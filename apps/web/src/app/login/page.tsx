'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { LoginForm } from '../../auth/login-form';
import { useAuth } from '../../auth/auth-context';
import { AuthLoadingScreen } from '../../components/auth-loading-screen';
import { BrandMark, InstitutionalAffiliation } from '../../components/brand-mark';

export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();

  useEffect(() => {
    if (auth.status === 'authenticated') {
      router.replace('/overview');
    }
  }, [auth.status, router]);

  if (auth.status !== 'unauthenticated') {
    return <AuthLoadingScreen />;
  }

  return (
    <main className="login-canvas min-h-screen px-4 py-5 sm:px-8 sm:py-8">
      <div className="login-card mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-5xl rounded-[28px] sm:min-h-[calc(100vh-4rem)] lg:grid-cols-[.9fr_1.1fr]">
        <section className="login-brand-panel relative overflow-hidden px-7 py-9 sm:px-10 lg:flex lg:flex-col lg:justify-between lg:px-12">
          <div className="absolute -right-24 -top-24 size-80 rounded-full bg-sky-200/25 blur-3xl" />
          <div className="relative max-w-md">
            <LoginBrandLockup />
            <p className="login-brand-kicker">Sistem pemantauan lereng</p>
            <h1 className="login-brand-heading">Pantau kondisi lereng dengan lebih jelas.</h1>
            <p className="login-brand-description">
              Teknila Siaga Longsor membantu memantau kondisi lereng, status perangkat, dan riwayat
              sensor secara terpusat.
            </p>
            <p className="login-brand-disclaimer">
              Informasi pada sistem mendukung pemantauan dan tidak menggantikan verifikasi lapangan
              maupun prosedur tanggap darurat resmi.
            </p>
          </div>
        </section>

        <section className="login-form-panel flex items-center px-6 py-10 sm:px-12 lg:px-14">
          <div className="mx-auto w-full max-w-md">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
              Portal pengguna
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
              Selamat datang kembali
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Masuk menggunakan akun terdaftar untuk mengakses dashboard Teknila Siaga Longsor.
            </p>
            <LoginForm
              message={auth.message}
              onLogin={auth.login}
              onSuccess={() => router.replace('/overview')}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function LoginBrandLockup() {
  return (
    <div className="login-brand-lockup">
      <BrandMark prominent />
      <span className="login-brand-divider" aria-hidden="true" />
      <InstitutionalAffiliation inverted />
    </div>
  );
}
