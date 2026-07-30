import type { LoginInput, Principal } from './auth-types';

interface AuthResponse {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly tokenType: 'Bearer';
  readonly user: Principal;
}

interface ApiErrorEnvelope {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
  };
  readonly requestId?: string;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly kind: 'api' | 'configuration' | 'network',
    readonly status?: number,
    readonly code?: string,
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
        envelope.error?.message ?? 'Permintaan tidak dapat diproses.',
        'api',
        response.status,
        envelope.error?.code,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

async function readErrorEnvelope(response: Response): Promise<ApiErrorEnvelope> {
  try {
    return (await response.json()) as ApiErrorEnvelope;
  } catch {
    return {};
  }
}
