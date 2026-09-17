import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ImageAttachment } from "../shared/types";

// Images people paste, kept as files named by their content, so messages store only a reference.
const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
// Providers reject larger images; Anthropic's limit is 5 MB.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function createAttachmentStore(directory: string) {
  const pathFor = (id: string) => {
    const match = /^([0-9a-f]{64})\.(png|jpg|gif|webp)$/.exec(id);
    if (!match) throw new Error("Unknown attachment.");
    return join(directory, id);
  };

  return {
    async save(mediaType: string, base64: string): Promise<ImageAttachment> {
      const extension = TYPES[mediaType];
      if (!extension) throw new Error("Only PNG, JPEG, GIF, and WebP images can be attached.");
      const bytes = Buffer.from(base64, "base64");
      if (bytes.length === 0) throw new Error("That image is empty.");
      if (bytes.length > MAX_IMAGE_BYTES) throw new Error("Images must be 5 MB or smaller.");
      const id = `${createHash("sha256").update(bytes).digest("hex")}.${extension}`;
      await mkdir(directory, { recursive: true });
      await writeFile(pathFor(id), bytes);
      return { id, mediaType };
    },

    // The image with its data, for a model request or a thumbnail.
    async read(id: string): Promise<Required<ImageAttachment>> {
      const extension = id.split(".").at(-1) ?? "";
      const mediaType =
        Object.entries(TYPES).find(([, value]) => value === extension)?.[0] ?? "image/png";
      const data = (await readFile(pathFor(id))).toString("base64");
      return { id, mediaType, data };
    },
  };
}

export type AttachmentStore = ReturnType<typeof createAttachmentStore>;
