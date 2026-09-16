import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerPreviewProtocol } from "../../src/main/preview-protocol";
import { previewUrl } from "../../src/shared/preview";

describe("preview scheme", () => {
  let dir: string;
  let project: string;
  let handler: (request: Request) => Promise<Response>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenith-preview-"));
    project = join(dir, "project");
    await mkdir(join(project, "site"), { recursive: true });
    await writeFile(join(project, "site", "index.html"), "<h1>Hello</h1>");
    await writeFile(join(project, "site", "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(join(dir, "secret.txt"), "SECRET");
    await symlink(join(dir, "secret.txt"), join(project, "link.txt"));
    registerPreviewProtocol(
      { handle: (_scheme, given) => (handler = given) },
      (path) => path === project,
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const get = (url: string) => handler(new Request(url));

  it("serves files from an open project with a policy that blocks the network", async () => {
    const response = await get(previewUrl(project, "site/index.html"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("Content-Security-Policy")).toContain("connect-src 'none'");
    expect(response.headers.get("Content-Security-Policy")).toContain("form-action 'none'");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.text()).toBe("<h1>Hello</h1>");

    const image = await get(previewUrl(project, "site/logo.png"));
    expect(image.headers.get("Content-Type")).toBe("image/png");
  });

  it("refuses folders that are not open, escapes, and missing files", async () => {
    expect((await get(previewUrl(join(dir, "elsewhere"), "index.html"))).status).toBe(403);
    // "../" is dropped while the address is normalized, which leaves no open folder to serve.
    expect((await get(previewUrl(project, "../secret.txt"))).status).toBe(403);
    // A link inside the project that points outside it is refused as well.
    expect((await get(previewUrl(project, "link.txt"))).status).toBe(404);
    expect((await get(previewUrl(project, "site/missing.html"))).status).toBe(404);
    expect(await (await get(previewUrl(project, "link.txt"))).text()).not.toContain("SECRET");
  });
});
