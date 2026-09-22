import { describe, expect, it } from "vitest";

import { flavourOf, parseWhisperOutput, whisperArgs } from "../../src/main/voice";
import { encodeWav } from "../../src/renderer/recordSpeech";

describe("flavourOf", () => {
  it("recognises whisper.cpp by its binary name", () => {
    expect(flavourOf("/opt/homebrew/bin/whisper-cli")).toBe("cpp");
    expect(flavourOf("/usr/local/bin/whisper-cpp")).toBe("cpp");
    expect(flavourOf("C:\\tools\\whisper-cli.exe")).toBe("cpp");
  });

  it("treats a plain whisper as openai-whisper", () => {
    expect(flavourOf("/opt/homebrew/bin/whisper")).toBe("openai");
  });
});

describe("whisperArgs", () => {
  it("passes whisper.cpp a model file and asks for untimed text", () => {
    expect(
      whisperArgs({
        flavour: "cpp",
        audioPath: "/tmp/speech.wav",
        outputDir: "/tmp",
        model: "/models/base.bin",
      }),
    ).toEqual(["-m", "/models/base.bin", "-f", "/tmp/speech.wav", "-nt", "-l", "auto"]);
  });

  it("passes openai-whisper a model name and an output folder", () => {
    expect(
      whisperArgs({
        flavour: "openai",
        audioPath: "/tmp/speech.wav",
        outputDir: "/tmp/out",
        model: "base",
      }),
    ).toEqual([
      "/tmp/speech.wav",
      "--model",
      "base",
      "--output_format",
      "txt",
      "--output_dir",
      "/tmp/out",
      "--fp16",
      "False",
    ]);
  });
});

describe("parseWhisperOutput", () => {
  it("joins spoken lines into one string", () => {
    expect(parseWhisperOutput(" Hello there.\n How are you?\n")).toBe("Hello there. How are you?");
  });

  it("drops leading timestamps that older builds still print", () => {
    const output = "[00:00:00.000 --> 00:00:02.000]   Open the file\n";
    expect(parseWhisperOutput(output)).toBe("Open the file");
  });

  it("ignores whisper's own diagnostic lines and blank lines", () => {
    const output = "whisper_init_from_file: loading model\n\n Real speech here\n";
    expect(parseWhisperOutput(output)).toBe("Real speech here");
  });

  it("ignores the language openai-whisper announces before the transcript", () => {
    const output =
      "Detecting language using up to the first 30 seconds\nDetected language: English\n[00:00.000 --> 00:02.000]  Open settings\n";
    expect(parseWhisperOutput(output)).toBe("Open settings");
  });

  it("returns an empty string when nothing was said", () => {
    expect(parseWhisperOutput("\n\n")).toBe("");
  });
});

describe("encodeWav", () => {
  it("writes a mono 16-bit PCM header at the requested sample rate", () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5]), 16_000);
    const view = new DataView(wav.buffer);
    const text = (offset: number, length: number) =>
      String.fromCharCode(...wav.slice(offset, offset + length));

    expect(text(0, 4)).toBe("RIFF");
    expect(text(8, 4)).toBe("WAVE");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(view.getUint32(40, true)).toBe(6); // three samples, two bytes each
    expect(wav.byteLength).toBe(44 + 6);
  });

  it("scales samples to signed 16-bit and clamps anything out of range", () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2, -2]), 16_000);
    const view = new DataView(wav.buffer);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x7fff);
    expect(view.getInt16(50, true)).toBe(0x7fff);
    expect(view.getInt16(52, true)).toBe(-0x7fff);
  });
});
