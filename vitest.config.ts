import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@shared": fileURLToPath(new URL("./shared", import.meta.url)) } },
  test: {
    environment: "node",
    include: [
      "shared/**/*.test.ts",
      "server/**/*.test.ts",
      "widgets/**/*.test.{ts,tsx}",
      "scripts/**/*.test.ts",
      "web/**/*.test.{ts,tsx}",
    ],
    testTimeout: 20000,
  },
});
