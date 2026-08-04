'use client';

import { useState } from 'react';

import type { OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import { downloadSop, getActiveSop } from './map-api';
import type { SopDocument } from './map-contracts';

export function SopQuickAccess({
  client,
  organizationId,
  siteId,
}: {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  readonly siteId: string;
}) {
  const [opened, setOpened] = useState(false);
  const [document, setDocument] = useState<SopDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open(): Promise<void> {
    const nextOpened = !opened;
    setOpened(nextOpened);
    if (!nextOpened || document !== null) return;
    setLoading(true);
    setError(null);
    try {
      setDocument((await getActiveSop(client, organizationId, siteId)).data);
    } catch (reason) {
      if (reason instanceof ApiClientError && reason.status === 404) setDocument(null);
      else setError('SOP belum dapat dimuat.');
    } finally {
      setLoading(false);
    }
  }

  async function download(): Promise<void> {
    if (document === null) return;
    setDownloading(true);
    setError(null);
    try {
      await downloadSop(client, organizationId, document);
    } catch {
      setError('SOP belum dapat diunduh. Periksa koneksi atau akses organisasi Anda.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 p-3">
      <button type="button" className="secondary-button" onClick={() => void open()}>
        {opened ? 'Tutup SOP' : 'Buka SOP'}
      </button>
      {opened && (
        <div className="mt-2 text-sm text-slate-700">
          {loading ? (
            <p>Memuat SOP resmi…</p>
          ) : document === null ? (
            <p>SOP resmi belum tersedia pada sistem</p>
          ) : (
            <>
              <p className="font-semibold">
                {document.originalFileName} · Versi {document.version}
              </p>
              <p>Diunggah {new Date(document.uploadedAt).toLocaleString('id-ID')}</p>
              <button
                type="button"
                className="secondary-button mt-2"
                disabled={downloading}
                onClick={() => void download()}
              >
                {downloading ? 'Menyiapkan unduhan…' : 'Unduh SOP'}
              </button>
            </>
          )}
          {error !== null && (
            <p role="alert" className="mt-2 font-semibold text-red-700">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
