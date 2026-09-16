import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { PREVIEW_SCHEME, parsePreviewUrl } from "../shared/preview";
import { insideProject } from "./workspace";

// Serves files from project folders to the preview frame in the window. Pages served here can
// load their own folder's files and nothing else: the policy below allows no network at all.

export const PREVIEW_SCHEME_PRIVILEGES = {
  scheme: PREVIEW_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: false, stream: true },
};

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".csv": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

const PREVIEW_POLICY = [
  "default-src 'self' data: blob:",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline' data:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:",
  // No requests may leave the computer, and nothing may be sent anywhere.
  "connect-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
].join("; ");

interface ProtocolPort {
  handle(scheme: string, handler: (request: Request) => Promise<Response>): void;
}

// `isOpenProject` limits serving to folders the window is actually working in.
export function registerPreviewProtocol(
  protocol: ProtocolPort,
  isOpenProject: (projectPath: string) => boolean,
): void {
  protocol.handle(PREVIEW_SCHEME, async (request) => {
    const deny = (status: number, message: string) =>
      new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    let target: { projectPath: string; relativePath: string };
    try {
      target = parsePreviewUrl(request.url);
    } catch {
      return deny(400, "Bad preview address.");
    }
    if (!target.projectPath || !isOpenProject(target.projectPath)) {
      return deny(403, "That folder is not open in Zenith.");
    }
    try {
      const path = await insideProject(target.projectPath, target.relativePath);
      const body = await readFile(path);
      return new Response(new Uint8Array(body), {
        headers: {
          "Content-Type": TYPES[extname(path).toLowerCase()] ?? "application/octet-stream",
          "Content-Security-Policy": PREVIEW_POLICY,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      return deny(404, "That file can't be previewed.");
    }
  });
}
