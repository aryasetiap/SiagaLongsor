import { describe, expect, it, vi } from 'vitest';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { startApi } from './start-api.js';

describe('startApi', () => {
  it('binds the API listener to the configured port and host', async () => {
    const config = {
      port: 3100,
      host: '127.0.0.1',
    } as AppConfig;
    const listen = vi.fn().mockResolvedValue(undefined);
    const app = {
      get: vi.fn((token: typeof APP_CONFIG) => {
        expect(token).toBe(APP_CONFIG);
        return config;
      }),
      listen,
    };

    await startApi(app);

    expect(listen).toHaveBeenCalledWith(3100, '127.0.0.1');
  });
});
