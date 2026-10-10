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
        "app/dashboard/kategori/**/*.{ts,tsx}",
        "app/dashboard/menu/**/*.{ts,tsx}",
        "lib/api/**/*.ts",
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
          include: [
            "tests/unit/ui-primitives.test.tsx",
            "tests/unit/useCategoriesQuery.test.tsx",
            "tests/unit/CategoryTable.test.tsx",
            "tests/unit/CategoryCreateDialog.test.tsx",
            "tests/unit/CategoryEditDialog.test.tsx",
            "tests/unit/useMenuItemsQuery.test.tsx",
            "tests/unit/MenuItemTable.test.tsx",
            "tests/unit/DashboardNavigation.test.tsx",
            "tests/unit/MenuCreateDialog.test.tsx",
            "tests/unit/MenuEditDialog.test.tsx",
          ],
          setupFiles: ["tests/setup-dom.ts"],
          testTimeout: 40000,
        },
      },
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: [
            "tests/unit/ui-primitives.test.tsx",
            "tests/unit/useCategoriesQuery.test.tsx",
            "tests/unit/CategoryTable.test.tsx",
          ],
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
