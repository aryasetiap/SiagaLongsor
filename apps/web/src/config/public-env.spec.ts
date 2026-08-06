import { afterEach, describe, expect, it } from 'vitest';

import { readPublicWebConfig } from './public-env';

const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalPresentationMode = process.env.NEXT_PUBLIC_PRESENTATION_MODE;

describe('readPublicWebConfig', () => {
  afterEach(() => {
    if (originalApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalApiBaseUrl;
    }
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    if (originalPresentationMode === undefined) {
      delete process.env.NEXT_PUBLIC_PRESENTATION_MODE;
    } else {
      process.env.NEXT_PUBLIC_PRESENTATION_MODE = originalPresentationMode;
    }
  });

  it('reads and normalizes a valid public API URL', () => {
    process.env.DATABASE_URL = 'postgresql://server-only.example.invalid/database';
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:3001/api/v1/';
    const config = readPublicWebConfig();

    expect(config).toEqual({
      apiBaseUrl: 'http://localhost:3001/api/v1',
      presentationMode: false,
    });
    expect(config).not.toHaveProperty('DATABASE_URL');
  });

  it('enables presentation mode only for the explicit public true flag', () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_PRESENTATION_MODE = 'true';
    expect(readPublicWebConfig().presentationMode).toBe(true);
  });

  it('rejects a missing public API URL', () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    expect(() => readPublicWebConfig()).toThrow('wajib dikonfigurasi');
  });

  it('rejects relative, malformed, and non-HTTP API URLs', () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = '/api/v1';
    expect(() => readPublicWebConfig()).toThrow('URL absolut');

    process.env.NEXT_PUBLIC_API_BASE_URL = 'not a URL';
    expect(() => readPublicWebConfig()).toThrow('URL absolut');

    process.env.NEXT_PUBLIC_API_BASE_URL = 'file:///api/v1';
    expect(() => readPublicWebConfig()).toThrow('HTTP atau HTTPS');
  });
});
