import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const cspPlaceholder = "__ZENITH_CSP__";

export const PRODUCTION_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'none'",
  "font-src 'self'",
  "form-action 'none'",
  // File previews render in a sandboxed frame served by Zenith's own local scheme.
  "frame-src zenith-file:",
  "img-src 'self' data: zenith-file:",
  "media-src 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "worker-src 'none'",
].join("; ");

export const DEVELOPMENT_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'self' ws://127.0.0.1:* ws://localhost:* ws://[::1]:*",
  "font-src 'self'",
  "form-action 'none'",
  "frame-src zenith-file:",
  "img-src 'self' data: zenith-file:",
  "media-src 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'none'",
].join("; ");

function contentSecurityPolicyPlugin(policy: string): Plugin {
  return {
    enforce: "pre",
    name: "zenith-content-security-policy",
    transformIndexHtml(html) {
      if (!html.includes(cspPlaceholder)) {
        throw new Error("Renderer CSP placeholder is missing.");
      }

      const transformed = html.replace(cspPlaceholder, policy);
      if (transformed.includes(cspPlaceholder)) {
        throw new Error("Renderer CSP placeholder was not replaced exactly once.");
      }

      return transformed;
    },
  };
}

export default defineConfig(({ command }) => {
  const policy = command === "serve" ? DEVELOPMENT_CSP : PRODUCTION_CSP;

  return {
    base: "./",
    build: {
      emptyOutDir: false,
      outDir: resolve(projectRoot, ".vite", "renderer", "main_window"),
      sourcemap: false,
      target: "es2023",
    },
    clearScreen: false,
    envPrefix: "ZENITH_PUBLIC_",
    plugins: [contentSecurityPolicyPlugin(policy), react(), tailwindcss()],
    resolve: {
      alias: {
        "@renderer": resolve(projectRoot, "src", "renderer"),
      },
    },
    root: resolve(projectRoot, "src", "renderer"),
    server: {
      strictPort: true,
    },
  };
});
