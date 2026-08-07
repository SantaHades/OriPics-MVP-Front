import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@oripics/stamp": path.resolve(__dirname, "./packages/stamp/src"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
