'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { ApiClientError } from './api-client';
import type { LoginInput, Principal } from './auth-types';
import { getDefaultApiClient } from './default-api-client';

export interface AuthClient {
  bootstrapSession(): Promise<Principal | null>;
  login(input: LoginInput): Promise<Principal>;
  logout(): Promise<void>;
}

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  readonly status: AuthStatus;
  readonly principal: Principal | null;
  readonly message: string | null;
  login(input: LoginInput): Promise<void>;
  logout(): Promise<void>;
  clearMessage(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  readonly children: ReactNode;
  readonly client?: AuthClient;
}

export function AuthProvider({ children, client }: AuthProviderProps) {
  const [initialClient] = useState(() =>
    client === undefined ? getDefaultApiClient() : { client, configurationError: null },
  );
  const clientRef = useRef<AuthClient | null>(initialClient.client);
  const configurationError = initialClient.configurationError;
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (clientRef.current === null) {
      setPrincipal(null);
      setMessage(configurationError);
      setStatus('unauthenticated');
      return () => {
        active = false;
      };
    }

    void clientRef.current
      .bootstrapSession()
      .then((sessionPrincipal) => {
        if (!active) return;
        setPrincipal(sessionPrincipal);
        setStatus(sessionPrincipal === null ? 'unauthenticated' : 'authenticated');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setPrincipal(null);
        setMessage(
          error instanceof ApiClientError && error.kind === 'api'
            ? null
            : 'Layanan autentikasi sedang tidak tersedia. Silakan coba kembali.',
        );
        setStatus('unauthenticated');
      });

    return () => {
      active = false;
    };
  }, [configurationError]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      principal,
      message,
      async login(input) {
        setMessage(null);
        if (clientRef.current === null) {
          throw new ApiClientError(
            configurationError ?? 'Konfigurasi layanan autentikasi tidak tersedia.',
            'configuration',
          );
        }
        const nextPrincipal = await clientRef.current.login(input);
        setPrincipal(nextPrincipal);
        setMessage(null);
        setStatus('authenticated');
      },
      async logout() {
        try {
          await clientRef.current?.logout();
          setMessage('Anda telah keluar dari Teknila Siaga Longsor.');
        } catch {
          setMessage(
            'Sesi lokal telah diakhiri, tetapi server tidak dapat dikonfirmasi. Silakan masuk kembali.',
          );
        } finally {
          setPrincipal(null);
          setStatus('unauthenticated');
        }
      },
      clearMessage() {
        setMessage(null);
      },
    }),
    [configurationError, message, principal, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth harus digunakan di dalam AuthProvider.');
  }
  return context;
}

export function getLoginErrorMessage(error: unknown): string {
  if (
    error instanceof ApiClientError &&
    (error.kind === 'network' || error.kind === 'configuration')
  ) {
    return 'Layanan Teknila Siaga Longsor tidak dapat dihubungi. Periksa koneksi dan coba kembali.';
  }

  if (error instanceof ApiClientError && error.kind === 'api' && error.status === 429) {
    return 'Terlalu banyak percobaan masuk. Tunggu beberapa saat lalu coba kembali.';
  }

  if (error instanceof ApiClientError && error.kind === 'api' && error.status !== 401) {
    return 'Permintaan masuk tidak dapat diproses. Silakan coba kembali.';
  }

  return 'Email atau kata sandi tidak valid.';
}
