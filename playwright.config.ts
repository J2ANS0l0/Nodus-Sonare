import { defineConfig, devices } from '@playwright/test';

// The app under test must already be running (frontend + API): the pipeline deploys it before this stage.
// E2E_BASE_URL selects the environment, E2E_BROWSER the browser (chromium | firefox | webkit).
const base_url = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const browser = process.env.E2E_BROWSER ?? 'chromium';

const browser_devices: Record<string, (typeof devices)[string]> = {
  chromium: devices['Desktop Chrome'],
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
};

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  // No retries: a test that passes on the second try is a flaky test to fix, not to hide
  retries: 0,
  forbidOnly: !!process.env.CI,
  outputDir: 'test-results',
  reporter: [
    ['list'],
    ['junit', { outputFile: 'reports/e2e-junit.xml' }],
    ['html', { outputFolder: 'reports/e2e-html', open: 'never' }],
  ],
  use: {
    baseURL: base_url,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: browser,
      use: {
        ...browser_devices[browser],
        viewport: { width: 1440, height: 900 },
        // The player starts tracks without a user gesture (auto_play), so the autoplay policy is relaxed
        ...(browser === 'chromium'
          ? { launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } }
          : {}),
      },
    },
  ],
});
