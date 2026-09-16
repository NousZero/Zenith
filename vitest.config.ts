import { defineConfig, defineProject } from "vitest/config";

const nodeProject = (name: string, include: string[]) =>
  defineProject({
    test: {
      environment: "node",
      include,
      name,
    },
  });

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      nodeProject("unit", ["tests/unit/**/*.test.{ts,tsx}"]),
      nodeProject("integration", ["tests/integration/**/*.test.{ts,tsx}"]),
      defineProject({
        test: {
          environment: "jsdom",
          include: ["tests/component/**/*.test.{ts,tsx}"],
          name: "component",
          setupFiles: ["./tests/setup.ts"],
        },
      }),
    ],
  },
});
