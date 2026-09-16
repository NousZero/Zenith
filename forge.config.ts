import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerZIP } from "@electron-forge/maker-zip";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const config: ForgeConfig = {
  hooks: {
    packageAfterPrune: async (_forgeConfig, buildPath) => {
      const packagedManifestPath = join(buildPath, "package.json");
      const packagedManifest = JSON.parse(await readFile(packagedManifestPath, "utf8"));
      if (packagedManifest.type !== "module" || packagedManifest.main !== ".vite/build/main.cjs") {
        throw new Error("Unexpected packaged manifest module boundary.");
      }
      delete packagedManifest.type;
      await writeFile(packagedManifestPath, `${JSON.stringify(packagedManifest, null, 2)}\n`, {
        encoding: "utf8",
        flag: "w",
      });
      const verifiedPackagedManifest = JSON.parse(await readFile(packagedManifestPath, "utf8"));
      if (
        Object.hasOwn(verifiedPackagedManifest, "type") ||
        verifiedPackagedManifest.main !== ".vite/build/main.cjs"
      ) {
        throw new Error("Packaged CommonJS manifest rewrite failed.");
      }
    },
  },
  makers: [new MakerZIP({}, ["win32", "darwin", "linux"])],
  packagerConfig: {
    // Native binaries must sit outside the archive so the operating system can run them.
    asar: { unpackDir: "utility", unpack: "**/{*.node,spawn-helper}" },
    executableName: "Zenith",
    name: "Zenith",
    prune: true,
  },
  plugins: [
    new VitePlugin({
      build: [
        {
          config: "vite.main.config.ts",
          entry: "src/main/index.ts",
          target: "main",
        },
        {
          config: "vite.preload.config.ts",
          entry: "src/preload/index.ts",
          target: "preload",
        },
      ],
      concurrent: false,
      renderer: [
        {
          config: "vite.renderer.config.ts",
          name: "main_window",
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  rebuildConfig: {},
};

export default config;
