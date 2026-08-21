import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3100";
const vaultRoot = path.join(process.cwd(), ".test-data", "e2e-vault");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "on-failure" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "bun run test:e2e:serve",
    url: `${baseURL}/api/dashboard`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      SECOND_BRAIN_VAULT_DIR: vaultRoot,
      SECOND_BRAIN_DB_PATH: path.join(vaultRoot, "second-brain.sqlite"),
      OLLAMA_HOST: "http://127.0.0.1:9",
      QDRANT_URL: "http://127.0.0.1:9",
    },
  },
});
