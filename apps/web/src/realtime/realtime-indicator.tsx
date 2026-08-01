'use client';

import { useOptionalRealtime, type RealtimeStatus } from './realtime-context';

export function RealtimeIndicator({
  status: suppliedStatus,
}: {
  readonly status?: RealtimeStatus;
}) {
  const realtime = useOptionalRealtime();
  const status = suppliedStatus ?? realtime.status;
  const presentation = {
    CONNECTED: { icon: '●', text: 'Realtime aktif', className: 'text-emerald-700 bg-emerald-50' },
    CONNECTING: {
      icon: '◌',
      text: 'Menghubungkan realtime…',
      className: 'text-blue-700 bg-blue-50',
    },
    DEGRADED: {
      icon: '!',
      text: 'Realtime terputus — data tetap dapat diperbarui manual',
      className: 'text-amber-800 bg-amber-50',
    },
  }[status];
  return (
    <p
      aria-live="polite"
      data-testid="realtime-indicator"
      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${presentation.className}`}
    >
      <span aria-hidden="true" className="mr-1.5">
        {presentation.icon}
      </span>
      {presentation.text}
    </p>
  );
}
