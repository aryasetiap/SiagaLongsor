import { afterEach, describe, expect, it, vi } from 'vitest';

const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

describe('getDefaultApiClient', () => {
  afterEach(() => {
    vi.resetModules();
    if (originalApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalApiBaseUrl;
    }
  });

  it('creates a client from the public frontend environment', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:3001/api/v1';
    const { getDefaultApiClient } = await import('./default-api-client');

    expect(getDefaultApiClient()).toMatchObject({
      client: expect.anything(),
      configurationError: null,
    });
  });

  it('returns a controlled configuration failure when the public URL is missing', async () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    const { getDefaultApiClient } = await import('./default-api-client');

    const resolution = getDefaultApiClient();
    expect(resolution.client).toBeNull();
    expect(resolution.configurationError).toContain('NEXT_PUBLIC_API_BASE_URL');
  });
});
