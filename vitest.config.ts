import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) } },
  test: {
    environment: "node",
    exclude: ["tests/e2e/**", "node_modules/**"],
    setupFiles: ["./tests/setup-env.ts"],
    coverage: { reporter: ["text", "json", "html"] },
  },
});
