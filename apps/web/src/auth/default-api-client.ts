import { publicConfigErrorMessage, readPublicWebConfig } from '../config/public-env';
import { ApiClient } from './api-client';

export interface DefaultApiClientResolution {
  readonly client: ApiClient | null;
  readonly configurationError: string | null;
}

let defaultResolution: DefaultApiClientResolution | null = null;

export function getDefaultApiClient(): DefaultApiClientResolution {
  if (defaultResolution !== null) {
    return defaultResolution;
  }

  try {
    defaultResolution = {
      client: new ApiClient(readPublicWebConfig().apiBaseUrl),
      configurationError: null,
    };
  } catch (error) {
    defaultResolution = {
      client: null,
      configurationError: publicConfigErrorMessage(error),
    };
  }

  return defaultResolution;
}
