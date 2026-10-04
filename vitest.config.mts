import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // Resolve the `@/…` alias from tsconfig.json (e.g. `@/src/config/bc`); native in Vite 8.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    // Playwright's smoke tests (pnpm test:e2e) live in e2e/.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
