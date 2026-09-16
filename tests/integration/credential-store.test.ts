import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCredentialStore } from "../../src/main/credential-store";

function fakeSafeStorage() {
  let available = true;
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plainText: string) => Buffer.from(`enc:${plainText}`, "utf8"),
    decryptString: (encrypted: Buffer) => encrypted.toString("utf8").replace(/^enc:/, ""),
    setAvailable(value: boolean) {
      available = value;
    },
  };
}

describe("createCredentialStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenith-credentials-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips a secret through set/get", async () => {
    const store = createCredentialStore({
      safeStorage: fakeSafeStorage(),
      filePath: join(dir, "credentials.json"),
    });
    await store.set("openai", "sk-secret");
    await expect(store.get("openai")).resolves.toBe("sk-secret");
    await expect(store.list()).resolves.toEqual(["openai"]);
  });

  it("returns undefined for a provider with no stored credential", async () => {
    const store = createCredentialStore({
      safeStorage: fakeSafeStorage(),
      filePath: join(dir, "credentials.json"),
    });
    await expect(store.get("anthropic")).resolves.toBeUndefined();
  });

  it("removes a credential on delete", async () => {
    const store = createCredentialStore({
      safeStorage: fakeSafeStorage(),
      filePath: join(dir, "credentials.json"),
    });
    await store.set("openai", "sk-secret");
    await store.delete("openai");
    await expect(store.get("openai")).resolves.toBeUndefined();
    await expect(store.list()).resolves.toEqual([]);
  });

  it("throws when OS encryption is unavailable", async () => {
    const safeStorage = fakeSafeStorage();
    safeStorage.setAvailable(false);
    const store = createCredentialStore({ safeStorage, filePath: join(dir, "credentials.json") });
    await expect(store.set("openai", "sk-secret")).rejects.toThrow(
      "OS credential encryption is unavailable.",
    );
  });
});
