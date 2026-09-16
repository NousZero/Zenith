import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      external: ["electron"],
      output: {
        entryFileNames: "preload.js",
      },
    },
    sourcemap: false,
    target: "es2023",
  },
  clearScreen: false,
});
