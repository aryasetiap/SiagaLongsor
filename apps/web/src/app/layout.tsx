import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AuthProvider } from '../auth/auth-context';
import { OrganizationProvider } from '../organization/organization-context';
import { RealtimeProvider } from '../realtime/realtime-context';
import './globals.css';

export const metadata: Metadata = {
  description: 'Portal monitoring Sistem Deteksi Dini Tanah Longsor.',
  title: 'SiagaLongsor',
};

interface RootLayoutProps {
  readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="id">
      <body>
        <AuthProvider>
          <OrganizationProvider>
            <RealtimeProvider>{children}</RealtimeProvider>
          </OrganizationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
