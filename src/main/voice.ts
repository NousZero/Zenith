import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { VoiceStatus } from "../shared/types";
import { resolveExecutable, type ExecutableEnvironment } from "./cli/resolve-executable";

// Speech to text, spawned like the other command-line tools Zenith drives. Nothing is uploaded: the
// recording goes to a temporary file, whisper reads it locally, and the file is deleted afterwards.
// Whisper is not bundled, both because the models are large and because .npmrc sets ignore-scripts,
// so a dependency that downloaded one on install would never run.
//
// Two whispers are common and their command lines have nothing in common, so the flavour is chosen
// from the binary's name:
//   openai-whisper (`whisper`)  fetches and caches models itself, named like "base" or "small".
//   whisper.cpp (`whisper-cli`) needs the path of a model file the user downloaded.

const CPP_BINARIES = ["whisper-cli", "whisper-cpp"];
const OPENAI_BINARIES = ["whisper"];
const DEFAULT_OPENAI_MODEL = "base";
const TRANSCRIBE_TIMEOUT_MS = 300_000;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export type WhisperFlavour = "cpp" | "openai";

export function flavourOf(binaryPath: string): WhisperFlavour {
  // Split on both separators: a Windows path reaches this code while running on any platform.
  const name = (binaryPath.split(/[\\/]/).at(-1) ?? "").toLowerCase();
  return CPP_BINARIES.some((candidate) => name.startsWith(candidate)) ? "cpp" : "openai";
}

export function whisperArgs(options: {
  flavour: WhisperFlavour;
  audioPath: string;
  outputDir: string;
  // A model file path for whisper.cpp, or a model name for openai-whisper.
  model: string;
}): string[] {
  if (options.flavour === "cpp") {
    // -nt keeps timestamps out of stdout, so what is printed is the spoken text.
    return ["-m", options.model, "-f", options.audioPath, "-nt", "-l", "auto"];
  }
  return [
    options.audioPath,
    "--model",
    options.model,
    "--output_format",
    "txt",
    "--output_dir",
    options.outputDir,
    // Without this openai-whisper warns on every run on machines without a usable GPU.
    "--fp16",
    "False",
  ];
}

// Both flavours print the transcript on stdout; openai-whisper prefixes timestamps and announces
// the language it detected, and whisper.cpp prints its own diagnostics as `whisper_...` lines.
export function parseWhisperOutput(stdout: string): string {
  return stdout
    .split("\n")
    .map((line) => line.replace(/^\s*\[[^\]]*\]\s*/, "").trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !line.startsWith("whisper_") &&
        !line.startsWith("Detecting language") &&
        !line.startsWith("Detected language"),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface VoiceOptions {
  environment(): ExecutableEnvironment;
  // For whisper.cpp the path of a model file; for openai-whisper a model name. Unset means the
  // openai default, which it downloads on first use.
  model(): string | undefined;
}

export function createVoice(options: VoiceOptions) {
  async function findBinary(): Promise<string | undefined> {
    const environment = options.environment();
    for (const name of [...CPP_BINARIES, ...OPENAI_BINARIES]) {
      const found = await resolveExecutable(name, environment);
      if (found) return found;
    }
    return undefined;
  }

  async function resolved(): Promise<VoiceStatus & { flavour?: WhisperFlavour }> {
    const binaryPath = await findBinary();
    if (!binaryPath) {
      return {
        available: false,
        problem:
          "No whisper was found. Install one (for example `brew install openai-whisper`) so speech can be transcribed on this computer.",
      };
    }
    const flavour = flavourOf(binaryPath);
    const model = options.model();
    if (flavour === "cpp" && !model) {
      return {
        available: false,
        binaryPath,
        problem: "Choose a whisper.cpp model file in Settings to transcribe speech.",
      };
    }
    return {
      available: true,
      binaryPath,
      flavour,
      modelPath: model ?? DEFAULT_OPENAI_MODEL,
    };
  }

  return {
    async status(): Promise<VoiceStatus> {
      const current = await resolved();
      delete current.flavour;
      return current;
    },

    // Takes 16 kHz mono WAV bytes and returns what was said.
    async transcribe(audio: Uint8Array): Promise<string> {
      if (audio.byteLength === 0) throw new Error("The recording was empty.");
      if (audio.byteLength > MAX_AUDIO_BYTES) throw new Error("That recording is too long.");
      const current = await resolved();
      if (!current.available || !current.binaryPath || !current.flavour || !current.modelPath) {
        throw new Error(current.problem ?? "Speech to text is unavailable.");
      }
      const binaryPath = current.binaryPath;
      const folder = await mkdtemp(join(tmpdir(), "zenith-voice-"));
      const audioPath = join(folder, "speech.wav");
      try {
        await writeFile(audioPath, audio);
        const args = whisperArgs({
          flavour: current.flavour,
          audioPath,
          outputDir: folder,
          model: current.modelPath,
        });
        return await new Promise<string>((resolve, reject) => {
          const child = spawn(binaryPath, args, { stdio: ["ignore", "pipe", "pipe"] });
          let stdout = "";
          let stderr = "";
          const timer = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error("Transcribing took too long."));
          }, TRANSCRIBE_TIMEOUT_MS);

          child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
          child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
          child.on("error", (error) => {
            clearTimeout(timer);
            reject(error);
          });
          child.on("close", (code) => {
            clearTimeout(timer);
            if (code !== 0) {
              reject(new Error(stderr.trim().split("\n").at(-1) || "Whisper failed."));
              return;
            }
            resolve(parseWhisperOutput(stdout));
          });
        });
      } finally {
        await rm(folder, { force: true, recursive: true }).catch(() => {});
      }
    },
  };
}

export type Voice = ReturnType<typeof createVoice>;
