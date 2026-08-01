import { Client } from 'pg';

const GLOBAL_CONNECTIVITY_FIXTURE_LOCK = 5_030_005;

export interface IntegrationSuiteLock {
  release(): Promise<void>;
}

/**
 * Serializes only integration suites that exercise the production-wide connectivity scan while
 * sharing one test database. Other Vitest files remain parallel. A dedicated PostgreSQL session
 * releases the advisory lock automatically if its worker exits unexpectedly.
 */
export async function acquireGlobalConnectivityFixtureLock(): Promise<IntegrationSuiteLock> {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString.length === 0) {
    throw new Error('DATABASE_URL is required for the integration fixture lock.');
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [GLOBAL_CONNECTIVITY_FIXTURE_LOCK]);
  } catch (error) {
    await client.end();
    throw error;
  }

  let released = false;
  return {
    async release(): Promise<void> {
      if (released) return;
      released = true;
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [GLOBAL_CONNECTIVITY_FIXTURE_LOCK]);
      } finally {
        await client.end();
      }
    },
  };
}
