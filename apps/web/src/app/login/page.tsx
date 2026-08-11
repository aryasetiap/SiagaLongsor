'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { LoginForm } from '../../auth/login-form';
import { useAuth } from '../../auth/auth-context';
import { AuthLoadingScreen } from '../../components/auth-loading-screen';
import { BrandMark } from '../../components/brand-mark';

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
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-6xl overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_30px_80px_rgba(15,23,42,.12)] sm:min-h-[calc(100vh-4rem)] lg:grid-cols-[1.05fr_.95fr]">
        <section className="relative hidden overflow-hidden bg-[#17211f] p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-24 -top-24 size-80 rounded-full bg-emerald-400/15 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 size-72 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative">
            <LoginBrandLockup inverted />
          </div>
          <div className="relative max-w-lg">
            <p className="mb-5 inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-emerald-100">
              Monitoring yang dapat ditelusuri
            </p>
            <h1 className="text-4xl font-bold leading-tight tracking-[-0.035em]">
              Akses kondisi lapangan dengan konteks yang jelas.
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-7 text-slate-300">
              SiagaLongsor membantu operator sekolah dan pemilik proyek melihat status sistem tanpa
              menggantikan penilaian ahli maupun prosedur tanggap darurat resmi.
            </p>
          </div>
          <div className="relative grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[.07] p-4">
              <p className="text-xs text-slate-400">Akses aman</p>
              <p className="mt-1 text-sm font-semibold">Sesi dapat dicabut</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[.07] p-4">
              <p className="text-xs text-slate-400">Lingkup pengguna</p>
              <p className="mt-1 text-sm font-semibold">Sesuai organisasi</p>
            </div>
          </div>
        </section>

        <section className="flex items-center px-6 py-10 sm:px-12 lg:px-16">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-9 lg:hidden">
              <LoginBrandLockup />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
              Portal pengguna
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
              Selamat datang kembali
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Masukkan akun yang diberikan untuk melanjutkan ke ruang kerja SiagaLongsor.
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

function LoginBrandLockup({ inverted = false }: { readonly inverted?: boolean }) {
  return (
    <div className={`login-brand-lockup ${inverted ? 'login-brand-lockup-inverted' : ''}`}>
      <BrandMark inverted={inverted} />
      <span className="login-brand-divider" aria-hidden="true" />
      <div className="login-unila-lockup">
        <Image
          src="/brand/logo-unila.png"
          alt="Logo Universitas Lampung"
          width={48}
          height={48}
          className="login-unila-logo"
          priority
        />
        <span className="login-unila-copy">
          <strong>Universitas Lampung</strong>
          <span>Fakultas Teknik</span>
        </span>
      </div>
    </div>
  );
}
