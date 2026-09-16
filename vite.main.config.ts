import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/main/index.ts",
      fileName: () => "main.cjs",
      formats: ["cjs"],
    },
    minify: false,
    rollupOptions: {
      // node:sqlite is prefix-only, so it is missing from Node's builtinModules list that
      // electron-forge externalizes; without this the dev build stubs it as a browser module.
      external: ["electron", "node-pty", /^node:/],
    },
    sourcemap: false,
    target: "node24",
  },
  clearScreen: false,
});
