// Push to talk. The browser records compressed audio, which is decoded, mixed to mono, resampled to
// the 16 kHz whisper.cpp expects, and written as a WAV in memory. The bytes go straight to the main
// process over IPC, so the recording never leaves this computer.

const WHISPER_SAMPLE_RATE = 16_000;

export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(44 + index * 2, Math.round(clamped * 0x7fff), true);
  }
  return new Uint8Array(bytes);
}

async function toWhisperWav(compressed: Blob): Promise<Uint8Array> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await compressed.arrayBuffer());
    const frames = Math.ceil((decoded.duration * WHISPER_SAMPLE_RATE) / 1) || 1;
    const offline = new OfflineAudioContext(1, frames, WHISPER_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const resampled = await offline.startRendering();
    return encodeWav(resampled.getChannelData(0), WHISPER_SAMPLE_RATE);
  } finally {
    await context.close().catch(() => {});
  }
}

export interface Recording {
  // Resolves with WAV bytes ready for transcription, or undefined if nothing was captured.
  stop(): Promise<Uint8Array | undefined>;
  cancel(): void;
}

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  recorder.start();

  const release = () => {
    for (const track of stream.getTracks()) track.stop();
  };

  return {
    async stop() {
      if (recorder.state === "inactive") return undefined;
      const finished = new Promise<void>((resolve) =>
        recorder.addEventListener("stop", () => resolve(), { once: true }),
      );
      recorder.stop();
      await finished;
      release();
      if (chunks.length === 0) return undefined;
      return toWhisperWav(new Blob(chunks, { type: chunks[0]?.type || "audio/webm" }));
    },
    cancel() {
      if (recorder.state !== "inactive") recorder.stop();
      release();
    },
  };
}
