import { afterEach, describe, expect, it } from 'vitest';

import { loadEnvironment } from './load-environment.js';

const injectedDatabaseUrl = 'postgresql://ci-injected.example.invalid/database';
const originalDatabaseUrl = process.env.DATABASE_URL;

describe('loadEnvironment', () => {
  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it('preserves an environment variable injected before loading the root file', () => {
    process.env.DATABASE_URL = injectedDatabaseUrl;

    loadEnvironment();

    expect(process.env.DATABASE_URL).toBe(injectedDatabaseUrl);
  });
});
