import { describe, expect, it, vi } from 'vitest';

import { ApiClient, ApiClientError } from './api-client';
import type { Principal } from './auth-types';

const principal: Principal = {
  id: 'user-1',
  email: 'admin@example.invalid',
  name: 'Admin Sekolah',
  memberships: [
    {
      organizationId: 'org-1',
      organizationName: 'SMAN 17 Bandar Lampung',
      role: 'SCHOOL_ADMIN',
    },
  ],
};

describe('ApiClient', () => {
  it('invokes a browser-bound fetch implementation with the global object', async () => {
    const browserFetch = vi.fn<typeof fetch>(function (this: unknown, input) {
      if (this !== globalThis) {
        throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      }

      const url = String(input);
      if (url.endsWith('/auth/login')) {
        return Promise.resolve(jsonResponse(authResponse('browser-token')));
      }
      if (url.endsWith('/auth/me')) {
        return Promise.resolve(jsonResponse(principal));
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    const client = new ApiClient('http://localhost:3001/api/v1', browserFetch);

    await expect(
      client.login({ email: principal.email, password: 'not-a-real-password' }),
    ).resolves.toEqual(principal);
    expect(browserFetch).toHaveBeenCalledTimes(2);
  });

  it('logs in with credentials, keeps the token in memory, and resolves /auth/me', async () => {
    const fetchMock = createFetchMock([
      jsonResponse(authResponse('access-one')),
      jsonResponse(principal),
    ]);
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    const client = new ApiClient('http://localhost:3001/api/v1', fetchMock);

    await expect(
      client.login({ email: principal.email, password: 'not-a-real-password' }),
    ).resolves.toEqual(principal);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectRequest(fetchMock, 0, '/auth/login', null, 'http://localhost:3001/api/v1');
    expectRequest(fetchMock, 1, '/auth/me', 'Bearer access-one', 'http://localhost:3001/api/v1');
    const [, loginInit] = fetchMock.mock.calls[0] ?? [];
    expect(loginInit?.method).toBe('POST');
    expect(new Headers(loginInit?.headers).get('content-type')).toBe('application/json');
    expect(loginInit?.body).toBe(
      JSON.stringify({ email: principal.email, password: 'not-a-real-password' }),
    );
    expect(storageSpy).not.toHaveBeenCalled();
    expect(window.localStorage).toHaveLength(0);
    expect(window.sessionStorage).toHaveLength(0);
    expect(document.cookie).not.toContain('access-one');
  });

  it('returns API and connectivity failures without leaking credential distinctions', async () => {
    const rejectedClient = new ApiClient(
      'http://api.example.test/api/v1',
      createFetchMock([
        jsonResponse(
          { error: { code: 'INVALID_CREDENTIALS', message: 'Email atau password tidak valid.' } },
          401,
        ),
      ]),
    );
    await expect(
      rejectedClient.login({ email: principal.email, password: 'wrong' }),
    ).rejects.toMatchObject({ kind: 'api', status: 401, code: 'INVALID_CREDENTIALS' });

    const unavailableClient = new ApiClient(
      'http://api.example.test/api/v1',
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network unavailable')),
    );
    await expect(
      unavailableClient.login({ email: principal.email, password: 'unknown' }),
    ).rejects.toEqual(expect.objectContaining({ kind: 'network' }));
  });

  it('bootstraps a session through refresh and then /auth/me', async () => {
    const fetchMock = createFetchMock([
      jsonResponse(authResponse('bootstrap-token')),
      jsonResponse(principal),
    ]);
    const client = new ApiClient('http://api.example.test/api/v1', fetchMock);

    await expect(client.bootstrapSession()).resolves.toEqual(principal);
    expectRequest(fetchMock, 0, '/auth/refresh', null);
    expectRequest(fetchMock, 1, '/auth/me', 'Bearer bootstrap-token');
  });

  it('returns no session after one rejected bootstrap refresh', async () => {
    const fetchMock = createFetchMock([
      jsonResponse({ error: { code: 'REFRESH_TOKEN_INVALID' } }, 401),
    ]);
    const client = new ApiClient('http://api.example.test/api/v1', fetchMock);

    await expect(client.bootstrapSession()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes and retries an unauthorized request exactly once', async () => {
    const fetchMock = createFetchMock([
      jsonResponse(authResponse('initial-token')),
      jsonResponse(principal),
      jsonResponse({ error: { code: 'SESSION_INVALID' } }, 401),
      jsonResponse(authResponse('rotated-token')),
      jsonResponse({ value: 'recovered' }),
    ]);
    const client = new ApiClient('http://api.example.test/api/v1', fetchMock);
    await client.bootstrapSession();

    await expect(client.request<{ value: string }>('/protected')).resolves.toEqual({
      value: 'recovered',
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expectRequest(fetchMock, 4, '/protected', 'Bearer rotated-token');
  });

  it('does not refresh more than once when the retried request remains unauthorized', async () => {
    const fetchMock = createFetchMock([
      jsonResponse(authResponse('initial-token')),
      jsonResponse(principal),
      jsonResponse({ error: { code: 'SESSION_INVALID' } }, 401),
      jsonResponse(authResponse('rotated-token')),
      jsonResponse({ error: { code: 'SESSION_INVALID' } }, 401),
    ]);
    const client = new ApiClient('http://api.example.test/api/v1', fetchMock);
    await client.bootstrapSession();

    await expect(client.request('/protected')).rejects.toMatchObject({
      kind: 'api',
      status: 401,
    });
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/auth/refresh')),
    ).toHaveLength(2);
  });

  it('uses one single-flight refresh for concurrent unauthorized requests', async () => {
    let protectedCalls = 0;
    let refreshCalls = 0;
    let releaseRefresh: ((response: Response) => void) | undefined;
    const delayedRefresh = new Promise<Response>((resolve) => {
      releaseRefresh = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        if (refreshCalls === 1) return jsonResponse(authResponse('initial-token'));
        return delayedRefresh;
      }
      if (url.endsWith('/auth/me')) return jsonResponse(principal);
      if (url.endsWith('/protected')) {
        protectedCalls += 1;
        return protectedCalls <= 2
          ? jsonResponse({ error: { code: 'SESSION_INVALID' } }, 401)
          : jsonResponse({ ok: true });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    const client = new ApiClient('http://api.example.test/api/v1', fetchMock);
    await client.bootstrapSession();

    const first = client.request('/protected');
    const second = client.request('/protected');
    await vi.waitFor(() => expect(refreshCalls).toBe(2));
    releaseRefresh?.(jsonResponse(authResponse('single-flight-token')));

    await expect(Promise.all([first, second])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(refreshCalls).toBe(2);
    expect(protectedCalls).toBe(4);
  });

  it('clears its memory token even when the logout API is unavailable', async () => {
    const fetchMock = createFetchMock([
      jsonResponse(authResponse('active-token')),
      jsonResponse(principal),
      new TypeError('network unavailable'),
      jsonResponse({ error: { code: 'SESSION_INVALID' } }, 401),
      jsonResponse({ error: { code: 'REFRESH_TOKEN_INVALID' } }, 401),
    ]);
    const client = new ApiClient('http://api.example.test/api/v1', fetchMock);
    await client.bootstrapSession();

    await expect(client.logout()).rejects.toBeInstanceOf(ApiClientError);
    await expect(client.request('/protected')).rejects.toMatchObject({ status: 401 });
    expectRequest(fetchMock, 3, '/protected', null);
  });
});

function authResponse(accessToken: string) {
  return {
    accessToken,
    expiresIn: 900,
    tokenType: 'Bearer' as const,
    user: principal,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createFetchMock(responses: Array<Response | Error>) {
  const queue = [...responses];
  return vi.fn<typeof fetch>(async () => {
    const next = queue.shift();
    if (next instanceof Error) throw next;
    if (next === undefined) throw new Error('No mock response configured.');
    return next;
  });
}

function expectRequest(
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>,
  index: number,
  path: string,
  authorization: string | null,
  apiBaseUrl = 'http://api.example.test/api/v1',
): void {
  const [input, init] = fetchMock.mock.calls[index] ?? [];
  expect(String(input)).toBe(`${apiBaseUrl}${path}`);
  expect(init?.credentials).toBe('include');
  const headers = new Headers(init?.headers);
  expect(headers.get('authorization')).toBe(authorization);
}
