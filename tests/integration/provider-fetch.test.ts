import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { providerFetch } from "../../src/main/providers/http";

describe("providerFetch", () => {
  let server: Server;
  let base: string;
  let hits: string[];

  beforeEach(async () => {
    hits = [];
    server = createServer((request, response) => {
      hits.push(`${request.url} ${request.headers["x-api-key"] ?? ""}`);
      if (request.url === "/redirect") {
        response.writeHead(307, { location: `${base}/elsewhere` }).end();
      } else {
        response.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("reaches servers on this computer", async () => {
    const response = await providerFetch(`${base}/models`);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("refuses to follow a redirect, so the key goes nowhere else", async () => {
    await expect(
      providerFetch(`${base}/redirect`, { headers: { "x-api-key": "secret" } }),
    ).rejects.toThrow("redirect");
    expect(hits).toEqual(["/redirect secret"]);
  });

  it("refuses plain http to the internet before sending anything", async () => {
    await expect(providerFetch("http://api.example.com/v1/models")).rejects.toThrow("https://");
  });
});
