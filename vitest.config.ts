import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "lib/helpers/**/*.ts",
        "lib/validators/**/*.ts",
        "lib/services/**/*.ts",
        "lib/auth/errors.ts",
      ],
      exclude: ["**/*.d.ts"],
    },
  },
  resolve: {
    alias: [
      {
        find: /^@\//,
        replacement: `${rootDirectory}/`,
      },
      {
        find: "server-only",
        replacement: path.resolve(rootDirectory, "tests/mocks/server-only.ts"),
      },
    ],
  },
});
