import { defineConfig, devices } from '@playwright/test';

const isCi = process.env.CI === 'true';
const webBaseUrl = readUrl('E2E_BASE_URL', 'http://localhost:3000');
const apiBaseUrl = readUrl('E2E_API_BASE_URL', 'http://localhost:3001/api/v1');
const webPort = portOf(webBaseUrl);
const apiPort = portOf(apiBaseUrl);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 7_500,
  },
  reporter: isCi ? [['line'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: webBaseUrl.origin,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: isCi
        ? 'corepack pnpm --filter @siagalongsor/api start'
        : 'corepack pnpm --filter @siagalongsor/api dev',
      url: new URL('/api/v1/health', apiBaseUrl.origin).href,
      reuseExistingServer: !isCi,
      timeout: 120_000,
      env: {
        API_PORT: String(apiPort),
        WEB_URL: webBaseUrl.origin,
        // Browser acceptance performs several legitimate logins in one run.
        // Authentication rate-limit behavior is covered independently by API integration tests.
        AUTH_LOGIN_RATE_LIMIT_MAX: '100',
      },
    },
    {
      command: isCi
        ? `corepack pnpm --filter @siagalongsor/web start --port ${webPort}`
        : `corepack pnpm --filter @siagalongsor/web dev --port ${webPort}`,
      url: webBaseUrl.origin,
      reuseExistingServer: !isCi,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_API_BASE_URL: apiBaseUrl.href.replace(/\/$/, ''),
      },
    },
  ],
});

function readUrl(name: 'E2E_BASE_URL' | 'E2E_API_BASE_URL', fallback: string): URL {
  const value = process.env[name]?.trim() || fallback;
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} harus berupa URL HTTP atau HTTPS absolut.`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} harus menggunakan protokol HTTP atau HTTPS.`);
  }

  return url;
}

function portOf(url: URL): number {
  if (url.port !== '') return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}
