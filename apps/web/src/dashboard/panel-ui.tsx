import type { ReactNode } from 'react';

import { ApiClientError } from '../auth/api-client';

export function PanelError({
  title,
  error,
  onRetry,
}: {
  readonly title: string;
  readonly error: Error;
  readonly onRetry: () => void;
}) {
  return (
    <div role="alert" className="error-banner">
      <p className="font-semibold">{title}</p>
      {error instanceof ApiClientError && error.requestId !== undefined && (
        <p className="mt-1 text-xs">Request ID: {error.requestId}</p>
      )}
      <button type="button" className="secondary-button mt-3" onClick={onRetry}>
        Coba lagi
      </button>
    </div>
  );
}

export function PanelSkeleton({
  label,
  className = '',
}: {
  readonly label: string;
  readonly className?: string;
}) {
  return (
    <div aria-live="polite" aria-label={label} className={`grid gap-3 ${className}`}>
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          aria-hidden="true"
          className="h-20 animate-pulse rounded-2xl bg-slate-100"
        />
      ))}
    </div>
  );
}

export function DashboardCard({
  title,
  description,
  children,
  className = '',
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <h2 className="text-base font-bold text-slate-950">{title}</h2>
      {description !== undefined && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
