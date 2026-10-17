import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4317);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    acceptDownloads: true,
    // Animations off: axe would otherwise measure contrast mid fade-in. Also exercises
    // the prefers-reduced-motion styles.
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    // Production build, no API key in env → demo mode (heuristic suggestions).
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: BASE_URL,
    // Always our own production build: a dev server or another app on the port would skew results.
    reuseExistingServer: false,
    timeout: 240_000,
    env: { OPENROUTER_API_KEY: "" },
  },
});
