import type { LoginInput, Principal } from './auth-types';
import type { ValidationDetail } from '../api/contracts';

interface AuthResponse {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly tokenType: 'Bearer';
  readonly user: Principal;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly kind: 'api' | 'configuration' | 'network',
    readonly status?: number,
    readonly code?: string,
    readonly requestId?: string,
    readonly details?: readonly ValidationDetail[],
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

type FetchImplementation = typeof fetch;

export class ApiClient {
  private accessToken: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(
    private readonly apiBaseUrl: string,
    private readonly fetchImplementation: FetchImplementation = fetch,
  ) {}

  async login(input: LoginInput): Promise<Principal> {
    const response = await this.fetchJson<AuthResponse>('/auth/login', {
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    this.accessToken = response.accessToken;

    try {
      return await this.requestWithRefresh<Principal>('/auth/me', {}, false);
    } catch (error) {
      this.clearSession();
      throw error;
    }
  }

  async bootstrapSession(): Promise<Principal | null> {
    const refreshed = await this.refreshAccessToken();
    if (!refreshed) {
      return null;
    }

    try {
      return await this.requestWithRefresh<Principal>('/auth/me', {}, false);
    } catch (error) {
      this.clearSession();
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.fetchJson<void>('/auth/logout', { method: 'POST' });
    } finally {
      this.clearSession();
    }
  }

  request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return this.requestWithRefresh<T>(path, init, true);
  }

  refreshSession(): Promise<boolean> {
    return this.refreshAccessToken();
  }

  clearSession(): void {
    this.accessToken = null;
  }

  private async requestWithRefresh<T>(
    path: string,
    init: RequestInit,
    allowRefresh: boolean,
  ): Promise<T> {
    const tokenUsed = this.accessToken;
    try {
      return await this.fetchJson<T>(path, init, tokenUsed);
    } catch (error) {
      if (
        !allowRefresh ||
        !(error instanceof ApiClientError) ||
        error.kind !== 'api' ||
        error.status !== 401
      ) {
        throw error;
      }

      if (this.accessToken !== null && this.accessToken !== tokenUsed) {
        return this.requestWithRefresh<T>(path, init, false);
      }

      const refreshed = await this.refreshAccessToken();
      if (!refreshed) {
        this.clearSession();
        throw error;
      }

      return this.requestWithRefresh<T>(path, init, false);
    }
  }

  private refreshAccessToken(): Promise<boolean> {
    if (this.refreshPromise !== null) {
      return this.refreshPromise;
    }

    const refreshOperation = this.performRefresh().finally(() => {
      if (this.refreshPromise === refreshOperation) {
        this.refreshPromise = null;
      }
    });
    this.refreshPromise = refreshOperation;
    return refreshOperation;
  }

  private async performRefresh(): Promise<boolean> {
    try {
      const response = await this.fetchJson<AuthResponse>('/auth/refresh', { method: 'POST' });
      this.accessToken = response.accessToken;
      return true;
    } catch (error) {
      this.clearSession();
      if (error instanceof ApiClientError && error.kind === 'api') {
        return false;
      }
      throw error;
    }
  }

  private async fetchJson<T>(
    path: string,
    init: RequestInit,
    bearerToken: string | null = null,
  ): Promise<T> {
    const headers = new Headers(init.headers);
    if (bearerToken !== null) {
      headers.set('authorization', `Bearer ${bearerToken}`);
    }

    let response: Response;
    try {
      response = await this.fetchImplementation.call(globalThis, `${this.apiBaseUrl}${path}`, {
        ...init,
        credentials: 'include',
        headers,
      });
    } catch {
      throw new ApiClientError('API tidak dapat dijangkau.', 'network');
    }

    if (!response.ok) {
      const envelope = await readErrorEnvelope(response);
      throw new ApiClientError(
        envelope.message,
        'api',
        response.status,
        envelope.code,
        envelope.requestId,
        envelope.details,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

async function readErrorEnvelope(response: Response): Promise<{
  readonly message: string;
  readonly code?: string;
  readonly requestId?: string;
  readonly details?: readonly ValidationDetail[];
}> {
  try {
    const value = (await response.json()) as unknown;
    if (!isRecord(value) || !isRecord(value.error)) {
      return { message: 'Permintaan tidak dapat diproses.' };
    }

    return {
      message: safeText(value.error.message, 'Permintaan tidak dapat diproses.', 500),
      ...(typeof value.error.code === 'string'
        ? { code: safeText(value.error.code, 'API_ERROR', 100) }
        : {}),
      ...(typeof value.requestId === 'string'
        ? { requestId: safeText(value.requestId, '', 128) }
        : {}),
      ...(Array.isArray(value.error.details)
        ? { details: parseValidationDetails(value.error.details) }
        : {}),
    };
  } catch {
    return { message: 'Permintaan tidak dapat diproses.' };
  }
}

function parseValidationDetails(values: readonly unknown[]): readonly ValidationDetail[] {
  return values.flatMap((value) => {
    if (!isRecord(value) || typeof value.field !== 'string' || !Array.isArray(value.messages)) {
      return [];
    }
    const messages = value.messages
      .filter((message): message is string => typeof message === 'string')
      .map((message) => safeText(message, '', 500))
      .filter((message) => message.length > 0);
    return messages.length === 0 ? [] : [{ field: safeText(value.field, 'body', 200), messages }];
  });
}

function safeText(value: unknown, fallback: string, maximumLength: number): string {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('')
    .slice(0, maximumLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
