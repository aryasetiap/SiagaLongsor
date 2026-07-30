import { foundationStatus } from '../lib/foundation';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">SiagaLongsor</p>
        <h1 className="mt-3 text-3xl font-bold text-gray-950">
          Fondasi aplikasi siap diverifikasi
        </h1>
        <p className="mt-4 leading-7 text-gray-600">
          Checkpoint ini hanya menyiapkan monorepo dan fondasi data. Authentication dan dashboard
          operasional belum diaktifkan.
        </p>
        <p className="mt-6 text-sm text-gray-500">Checkpoint: {foundationStatus.checkpoint}</p>
      </section>
    </main>
  );
}
