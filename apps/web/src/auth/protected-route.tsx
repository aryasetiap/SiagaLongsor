'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

import { AuthLoadingScreen } from '../components/auth-loading-screen';
import type { Principal } from './auth-types';
import { useAuth } from './auth-context';

interface ProtectedRouteProps {
  readonly children: (principal: Principal) => ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter();
  const { principal, status } = useAuth();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [router, status]);

  if (status === 'checking') {
    return <AuthLoadingScreen />;
  }

  if (status !== 'authenticated' || principal === null) {
    return <AuthLoadingScreen label="Mengarahkan ke halaman masuk…" />;
  }

  return children(principal);
}
