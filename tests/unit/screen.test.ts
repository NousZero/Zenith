import { describe, expect, it } from "vitest";

import { captureSize, looksBlank } from "../../src/main/screen";

describe("captureSize", () => {
  it("leaves a small display alone", () => {
    expect(captureSize({ width: 1440, height: 900 })).toEqual({ width: 1440, height: 900 });
  });

  it("scales a large display down by its longest edge, keeping the shape", () => {
    expect(captureSize({ width: 3840, height: 2160 })).toEqual({ width: 1920, height: 1080 });
  });

  it("scales a tall display by its height", () => {
    expect(captureSize({ width: 1080, height: 3840 })).toEqual({ width: 540, height: 1920 });
  });
});

describe("looksBlank", () => {
  const solid = (pixels: number, value = 0) => {
    const buffer = Buffer.alloc(pixels * 4);
    buffer.fill(value);
    return buffer;
  };

  it("treats an all-one-colour capture as blank, which is what a refused permission returns", () => {
    expect(looksBlank(solid(10_000))).toBe(true);
  });

  it("treats a capture with any variation as real", () => {
    const bitmap = solid(10_000);
    bitmap.writeUInt32LE(0x00ff00ff, 8_000);
    expect(looksBlank(bitmap)).toBe(false);
  });

  it("treats an empty buffer as blank", () => {
    expect(looksBlank(Buffer.alloc(0))).toBe(true);
  });
});
