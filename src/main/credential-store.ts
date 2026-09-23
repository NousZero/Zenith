import { promises as fs } from "node:fs";
import { dirname } from "node:path";

import { writeFileAtomic } from "./atomic-write";

interface SafeStoragePort {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface CredentialStore {
  get(providerId: string): Promise<string | undefined>;
  set(providerId: string, secret: string): Promise<void>;
  delete(providerId: string): Promise<void>;
  list(): Promise<string[]>;
}

export function createCredentialStore(options: {
  safeStorage: SafeStoragePort;
  filePath: string;
}): CredentialStore {
  async function readAll(): Promise<Record<string, string>> {
    try {
      const raw = await fs.readFile(options.filePath, "utf8");
      return JSON.parse(raw) as Record<string, string>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }

  async function writeAll(data: Record<string, string>): Promise<void> {
    await fs.mkdir(dirname(options.filePath), { recursive: true });
    await writeFileAtomic(options.filePath, JSON.stringify(data));
  }

  function requireEncryption(): void {
    if (!options.safeStorage.isEncryptionAvailable()) {
      throw new Error("OS credential encryption is unavailable.");
    }
  }

  return {
    async get(providerId) {
      const data = await readAll();
      const encoded = data[providerId];
      if (!encoded) return undefined;
      requireEncryption();
      return options.safeStorage.decryptString(Buffer.from(encoded, "base64"));
    },
    async set(providerId, secret) {
      requireEncryption();
      const data = await readAll();
      data[providerId] = options.safeStorage.encryptString(secret).toString("base64");
      await writeAll(data);
    },
    async delete(providerId) {
      const data = await readAll();
      const rest = Object.fromEntries(Object.entries(data).filter(([key]) => key !== providerId));
      await writeAll(rest);
    },
    async list() {
      return Object.keys(await readAll());
    },
  };
}
