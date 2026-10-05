import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: [],
    coverage: {
      provider: "v8",
      include: [
        "app/dashboard/order-actions.ts",
        "app/dashboard/menu-actions.ts",
        "app/dashboard/table-actions.ts",
        "lib/helpers/**/*.ts",
        "lib/validators/**/*.ts",
        "lib/services/**/*.ts",
        "lib/auth/errors.ts",
        "lib/order/**/*.ts",
        "lib/validators/order.validator.ts",
        "lib/dashboard/**/*.ts",
        "lib/utils/**/*.ts",
        "components/ui/**/*.tsx",
      ],
      exclude: ["**/*.d.ts", "tests/setup-dom.ts"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["tests/unit/ui-primitives.test.tsx"],
          setupFiles: ["tests/setup-dom.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/unit/ui-primitives.test.tsx"],
        },
      },
    ],
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
