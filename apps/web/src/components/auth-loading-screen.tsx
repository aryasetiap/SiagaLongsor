import { BrandMark } from './brand-mark';

interface AuthLoadingScreenProps {
  readonly label?: string;
}

export function AuthLoadingScreen({ label = 'Memeriksa sesi aman…' }: AuthLoadingScreenProps) {
  return (
    <main
      className="grid min-h-screen place-items-center bg-[var(--app-bg)] px-6"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-5 text-center">
        <BrandMark />
        <span className="size-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
        <p className="text-sm font-medium text-slate-600">{label}</p>
      </div>
    </main>
  );
}
