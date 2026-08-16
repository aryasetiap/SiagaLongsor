import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AuthProvider } from '../auth/auth-context';
import './globals.css';

export const metadata: Metadata = {
  description:
    'Teknila Siaga Longsor adalah portal monitoring Sistem Deteksi Dini Tanah Longsor Fakultas Teknik Universitas Lampung.',
  title: 'Teknila Siaga Longsor',
};

interface RootLayoutProps {
  readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="id">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
