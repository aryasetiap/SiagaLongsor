import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';

const rootEnvironmentPath = fileURLToPath(new URL('../../../../.env', import.meta.url));
let environmentLoaded = false;

export function loadEnvironment(): void {
  if (environmentLoaded) {
    return;
  }

  const result = loadDotenv({
    path: rootEnvironmentPath,
    override: false,
    quiet: true,
  });

  if (result.error !== undefined && !isMissingFileError(result.error)) {
    const errorCode = getErrorCode(result.error);
    throw new Error(
      `Root environment file could not be loaded${errorCode === undefined ? '.' : ` (${errorCode}).`}`,
    );
  }

  environmentLoaded = true;
}

function isMissingFileError(error: Error): boolean {
  return getErrorCode(error) === 'ENOENT';
}

function getErrorCode(error: Error): string | undefined {
  return 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}
