import { randomBytes } from "node:crypto";
import { chmod, open, realpath, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

// From Agamemnon's journaled file apply, reduced to what a crash can break: a file is either
// its old or its new content, never half-written. The text goes to a temporary file beside the
// target, is flushed to disk, and replaces the target in one rename. A symbolic link is followed,
// so the file it points to is replaced rather than the link, and an existing file keeps its mode.
// ponytail: one file at a time; undo across files is the per-reply checkpoints' job.
export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const target = await realpath(path).catch(() => path);
  const mode = await stat(target).then(
    (info) => info.mode & 0o7777,
    () => undefined,
  );
  const temporary = join(
    dirname(target),
    `.${basename(target)}.zenith-${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    const handle = await open(temporary, "wx", mode ?? 0o666);
    try {
      await handle.writeFile(data, typeof data === "string" ? "utf8" : undefined);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (mode !== undefined) await chmod(temporary, mode);
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
