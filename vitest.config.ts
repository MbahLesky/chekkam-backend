import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    // Several safety-check/report tests exercise real (mocked-network-free
    // but non-trivial) async fallback paths that can exceed vitest's 5000ms
    // default under parallel worker load — bump rather than leaving the
    // suite flaky.
    testTimeout: 15_000,
  },
});
