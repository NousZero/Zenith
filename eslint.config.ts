import js from "@eslint/js";
import { builtinModules } from "node:module";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const generatedAndExternal = [
  "**/.vite/**",
  "**/.types/**",
  "**/coverage/**",
  "**/dist/**",
  "**/node_modules/**",
  "**/out/**",
  "**/playwright-report/**",
  "**/test-results/**",
  "resources/supplied/agent-skills/0.6.6/files/**",
  "coverage/**",
  "dist/**",
  "node_modules/**",
  "out/**",
  "playwright-report/**",
  "test-results/**",
  ".vite/**",
  ".types/**",
];

const privilegedModules = [
  ...new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]),
]
  .sort()
  .map((name) => ({
    message: "Renderer code cannot import Node or Electron authority.",
    name,
  }));

privilegedModules.push({
  message: "Renderer code cannot import Electron authority.",
  name: "electron",
});

export default tseslint.config(
  { ignores: generatedAndExternal },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      eqeqeq: ["error", "always"],
      "no-console": ["error", { allow: ["error", "warn"] }],
      "no-debugger": "error",
      "no-eval": "error",
      "no-new-func": "error",
      "no-var": "error",
      "prefer-const": "error",
    },
  },
  {
    files: ["**/*.{mjs,cjs}", "scripts/**/*.{js,mjs,cjs}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["src/renderer/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: privilegedModules,
          patterns: [
            {
              group: ["**/main/**", "**/preload/**", "**/utility/**"],
              message: "Renderer code cannot cross into a privileged process module.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
);
