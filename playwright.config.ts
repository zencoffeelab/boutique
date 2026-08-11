import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: true, workers: 1, retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:5173", trace: "on-first-retry" },
  webServer: { command: "VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= ALLOW_DEMO_DATA=true PAYMENTS_MOCK=true SHIPPING_MOCK=true DEMO_ADMIN=true npm run dev -- --host 127.0.0.1", url: "http://127.0.0.1:5173", reuseExistingServer: !process.env.CI, timeout: 120_000 },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }, { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } }],
});
