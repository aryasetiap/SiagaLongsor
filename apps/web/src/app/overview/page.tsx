'use client';

import { ProtectedRoute } from '../../auth/protected-route';
import { ApplicationShell } from '../../components/application-shell';

export default function OverviewPage() {
  return (
    <ProtectedRoute>
      {(principal) => (
        <ApplicationShell principal={principal} title="Overview">
          <OverviewContent name={principal.name} email={principal.email} />
        </ApplicationShell>
      )}
    </ProtectedRoute>
  );
}

function OverviewContent({ name, email }: { readonly name: string; readonly email: string }) {
  const firstName = name.trim().split(/\s+/, 1)[0] ?? name;

  return (
    <>
      <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-6 sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
            Fondasi aplikasi
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
            Selamat datang, {firstName}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Sesi Anda aktif. Modul monitoring tersedia melalui menu Monitoring, sementara dashboard
            risiko lengkap tetap disiapkan pada task terpisah.
          </p>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-2 sm:p-8">
          <InformationCard label="Pengguna" value={name} description={email} />
          <InformationCard
            label="Status sesi"
            value="Aktif"
            description="Diverifikasi oleh backend"
            status
          />
        </div>
      </section>

      <section className="mt-6 rounded-[22px] border border-dashed border-slate-300 bg-white/70 p-7 text-center">
        <h2 className="text-base font-bold text-slate-900">Dashboard risiko belum diaktifkan</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
          Tidak ada statistik sementara atau data sensor contoh yang ditampilkan.
        </p>
      </section>
    </>
  );
}

function InformationCard({
  label,
  value,
  description,
  status = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly description: string;
  readonly status?: boolean;
}) {
  return (
    <article className="rounded-[18px] border border-slate-200 p-5">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-3 flex items-center gap-2 truncate text-base font-bold text-slate-950">
        {status && <span className="size-2.5 rounded-full bg-emerald-500" aria-hidden="true" />}
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-slate-500">{description}</p>
    </article>
  );
}
