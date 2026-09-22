import { desktopCapturer, screen as electronScreen } from "electron";

// Capturing the screen so a model can look at it. This is deliberately something the user does, not
// something an agent can do on its own: a screenshot can hold passwords, private messages and
// anything else on display, so it is taken on an explicit press and attached to the message being
// written, where it is visible before it is sent.
//
// macOS needs Screen Recording permission. Without it the system hands back an empty or black
// image instead of failing, so an all-one-colour capture is reported as a permission problem.

const MAX_CAPTURE_EDGE = 1920;

export interface ScreenCapture {
  // PNG bytes, base64 encoded, ready for the attachment store.
  base64: string;
  width: number;
  height: number;
}

interface NativeImageLike {
  isEmpty(): boolean;
  getSize(): { width: number; height: number };
  toPNG(): Buffer;
  toBitmap(): Buffer;
}

// A capture with no variation at all is what macOS returns when Screen Recording is refused. Every
// pixel is compared rather than a sample of them, since sampling can step straight over a small
// region of difference; a real screenshot differs within the first few pixels, so this returns
// immediately except on a genuinely blank image.
export function looksBlank(bitmap: Buffer): boolean {
  if (bitmap.length < 8) return true;
  const first = bitmap.readUInt32LE(0);
  for (let offset = 4; offset + 4 <= bitmap.length; offset += 4) {
    if (bitmap.readUInt32LE(offset) !== first) return false;
  }
  return true;
}

export function captureSize(display: { width: number; height: number }): {
  width: number;
  height: number;
} {
  const longest = Math.max(display.width, display.height);
  if (longest <= MAX_CAPTURE_EDGE) return display;
  const scale = MAX_CAPTURE_EDGE / longest;
  return {
    width: Math.round(display.width * scale),
    height: Math.round(display.height * scale),
  };
}

export function createScreen() {
  return {
    async capture(): Promise<ScreenCapture> {
      const display = electronScreen.getPrimaryDisplay();
      const thumbnailSize = captureSize(display.size);
      const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize });
      const source = sources[0];
      if (!source) throw new Error("No screen was available to capture.");

      const image = source.thumbnail as unknown as NativeImageLike;
      if (image.isEmpty() || looksBlank(image.toBitmap())) {
        throw new Error(
          "The screen came back blank. On macOS, allow Screen Recording for Zenith in System Settings → Privacy & Security, then try again.",
        );
      }
      const size = image.getSize();
      return { base64: image.toPNG().toString("base64"), width: size.width, height: size.height };
    },
  };
}

export type Screen = ReturnType<typeof createScreen>;
