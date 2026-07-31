'use client';

import { useState } from 'react';

import type { IssuedDeviceCredential } from './device-contracts';
import { formatTimestamp } from '../monitoring-points/monitoring-point-detail-dialog';

interface OneTimeCredentialDialogProps {
  readonly credential: IssuedDeviceCredential;
  onClose(): void;
}

export function OneTimeCredentialDialog({ credential, onClose }: OneTimeCredentialDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  async function copySecret(): Promise<void> {
    try {
      await navigator.clipboard.writeText(credential.secret);
      setCopyStatus('Secret berhasil disalin.');
    } catch {
      setCopyStatus('Secret tidak dapat disalin. Pilih dan salin secara manual.');
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="one-time-credential-title"
        aria-describedby="one-time-credential-description"
        className="dialog-panel max-w-xl"
      >
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-amber-700">
          Informasi sensitif
        </p>
        <h2 id="one-time-credential-title" className="mt-2 text-xl font-bold text-slate-950">
          Simpan credential perangkat sekarang
        </h2>
        <p id="one-time-credential-description" className="mt-3 text-sm leading-6 text-slate-600">
          Secret ini hanya ditampilkan satu kali dan tidak dapat dibuka kembali. Simpan melalui
          mekanisme pengelolaan secret yang aman sebelum menutup dialog.
        </p>

        <dl className="mt-5 space-y-4">
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Hardware ID
            </dt>
            <dd className="mt-1 font-mono text-sm text-slate-900">{credential.hardwareId}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Diterbitkan
            </dt>
            <dd className="mt-1 text-sm text-slate-900">{formatTimestamp(credential.issuedAt)}</dd>
          </div>
        </dl>

        <label
          htmlFor="one-time-device-secret"
          className="mt-5 block text-sm font-bold text-slate-800"
        >
          Secret perangkat
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="one-time-device-secret"
            readOnly
            value={credential.secret}
            className="auth-input min-w-0 flex-1 font-mono"
            autoFocus
          />
          <button type="button" onClick={() => void copySecret()} className="secondary-button">
            Salin
          </button>
        </div>
        {copyStatus !== null && (
          <p role="status" aria-live="polite" className="mt-2 text-sm text-slate-700">
            {copyStatus}
          </p>
        )}

        <label className="mt-6 flex items-start gap-3 text-sm font-semibold text-slate-800">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="mt-0.5 size-5 rounded border-slate-300"
          />
          Saya telah menyimpan secret melalui mekanisme yang aman.
        </label>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={!acknowledged}
            onClick={onClose}
            className="primary-button"
          >
            Tutup dan hapus dari layar
          </button>
        </div>
      </section>
    </div>
  );
}
