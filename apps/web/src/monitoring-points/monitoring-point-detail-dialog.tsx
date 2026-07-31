'use client';

import { type FormEvent, useEffect, useState } from 'react';

import type { OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import type { Role } from '../auth/auth-types';
import type { Site } from '../sites/site-contracts';
import { getMonitoringPoint, updateMonitoringPoint } from './monitoring-points-api';
import type { MonitoringPoint, UpdateMonitoringPointInput } from './monitoring-point-contracts';
import {
  detailsToErrors,
  optionalText,
  TextAreaField,
  TextField,
} from './monitoring-point-form-dialog';

interface DetailDialogProps {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  readonly monitoringPointId: string;
  readonly role: Role;
  readonly sites: readonly Site[];
  onClose(): void;
  onChanged(message: string): void;
}

interface DetailState {
  readonly key: string;
  readonly status: 'ready' | 'error';
  readonly point?: MonitoringPoint;
  readonly error?: Error;
}

interface EditErrors {
  readonly name?: string;
  readonly description?: string;
  readonly locationDescription?: string;
}

export function MonitoringPointDetailDialog({
  client,
  organizationId,
  monitoringPointId,
  role,
  sites,
  onClose,
  onChanged,
}: DetailDialogProps) {
  const [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmInput, setConfirmInput] = useState<UpdateMonitoringPointInput | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [locationDescription, setLocationDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<EditErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const detailKey = `${organizationId}\u0000${monitoringPointId}\u0000${retry}`;
  const currentDetail = detail?.key === detailKey ? detail : null;

  useEffect(() => {
    let active = true;
    void getMonitoringPoint(client, organizationId, monitoringPointId)
      .then((response) => {
        if (!active) return;
        setDetail({ key: detailKey, status: 'ready', point: response.data });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setDetail({
          key: detailKey,
          status: 'error',
          error: reason instanceof Error ? reason : new Error('Detail tidak dapat dimuat.'),
        });
      });

    return () => {
      active = false;
    };
  }, [client, detailKey, monitoringPointId, organizationId]);

  const point = currentDetail?.point;
  const site = sites.find((candidate) => candidate.id === point?.siteId);

  function beginEdit(): void {
    if (point === undefined) return;
    setName(point.name);
    setDescription(point.description ?? '');
    setLocationDescription(point.locationDescription ?? '');
    setIsActive(point.isActive);
    setErrors({});
    setGlobalError(null);
    setEditing(true);
  }

  function submitEdit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (point === undefined) return;
    const validation = validateEdit(name, description, locationDescription);
    setErrors(validation);
    setGlobalError(null);
    if (Object.keys(validation).length > 0) return;

    const input: UpdateMonitoringPointInput = {
      name: name.trim(),
      description: optionalText(description),
      locationDescription: optionalText(locationDescription),
      isActive,
    };
    if (point.isActive && !isActive) {
      setConfirmInput(input);
      return;
    }
    void save(input);
  }

  async function save(input: UpdateMonitoringPointInput): Promise<void> {
    setSubmitting(true);
    setGlobalError(null);
    try {
      await updateMonitoringPoint(client, organizationId, monitoringPointId, input);
      onChanged('Data titik monitoring tersimpan.');
    } catch (reason) {
      const error = reason instanceof ApiClientError ? reason : null;
      setConfirmInput(null);
      setErrors(detailsToErrors(error?.details));
      setGlobalError(
        error?.code === 'MONITORING_POINT_ACTIVE_DEVICE_CONFLICT'
          ? 'Nonaktifkan atau pindahkan perangkat aktif terlebih dahulu.'
          : error?.status === 403
            ? 'Anda tidak memiliki izin untuk mengubah titik monitoring.'
            : (error?.message ?? 'Titik monitoring tidak dapat diperbarui.'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmInput !== null) {
    return (
      <div className="dialog-backdrop" role="presentation">
        <section
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="deactivate-monitoring-point-title"
          aria-describedby="deactivate-monitoring-point-description"
          className="dialog-panel max-w-lg"
        >
          <h2 id="deactivate-monitoring-point-title" className="text-xl font-bold text-slate-950">
            Nonaktifkan titik monitoring?
          </h2>
          <p id="deactivate-monitoring-point-description" className="mt-3 text-sm text-slate-600">
            Titik monitoring tidak akan dihapus dan seluruh histori tetap tersedia. Titik dengan
            perangkat aktif tidak dapat dinonaktifkan.
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => setConfirmInput(null)}
              className="secondary-button"
              autoFocus
            >
              Batal
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void save(confirmInput)}
              className="danger-button"
            >
              {submitting ? 'Menonaktifkan…' : 'Ya, nonaktifkan'}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="monitoring-point-detail-title"
        className="dialog-panel"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-blue-700">
              Detail titik monitoring
            </p>
            <h2
              id="monitoring-point-detail-title"
              className="mt-1 text-xl font-bold text-slate-950"
            >
              {point?.name ?? 'Memuat detail…'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup detail"
            className="icon-button"
            autoFocus
          >
            ×
          </button>
        </div>

        {currentDetail === null && (
          <p role="status" aria-live="polite" className="mt-6 text-sm text-slate-600">
            Memuat detail titik monitoring…
          </p>
        )}
        {currentDetail?.status === 'error' && (
          <div className="error-banner mt-6" role="alert">
            <p>Detail titik monitoring tidak dapat dimuat.</p>
            {currentDetail.error instanceof ApiClientError &&
              currentDetail.error.requestId !== undefined && (
                <p className="mt-1 text-xs">Request ID: {currentDetail.error.requestId}</p>
              )}
            <button
              type="button"
              onClick={() => setRetry((value) => value + 1)}
              className="mt-2 font-bold underline"
            >
              Coba lagi
            </button>
          </div>
        )}
        {point !== undefined && editing && (
          <form className="mt-6 space-y-5" onSubmit={submitEdit} noValidate>
            {globalError !== null && (
              <div className="error-banner" role="alert">
                {globalError}
              </div>
            )}
            <div>
              <span className="mb-2 block text-sm font-semibold text-slate-800">Site</span>
              <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
                {site?.name ?? point.siteId}
              </p>
            </div>
            <TextField
              id="edit-monitoring-point-name"
              label="Nama titik monitoring"
              value={name}
              maxLength={120}
              error={errors.name}
              onChange={setName}
            />
            <TextAreaField
              id="edit-monitoring-point-description"
              label="Deskripsi (opsional)"
              value={description}
              maxLength={2000}
              error={errors.description}
              onChange={setDescription}
            />
            <TextAreaField
              id="edit-monitoring-point-location"
              label="Deskripsi lokasi (opsional)"
              value={locationDescription}
              maxLength={500}
              error={errors.locationDescription}
              onChange={setLocationDescription}
            />
            <label className="flex items-center gap-3 text-sm font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
                className="h-5 w-5 rounded border-slate-300"
              />
              Titik monitoring aktif
            </label>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setEditing(false)} className="secondary-button">
                Batal
              </button>
              <button type="submit" disabled={submitting} className="primary-button">
                {submitting ? 'Menyimpan…' : 'Simpan perubahan'}
              </button>
            </div>
          </form>
        )}
        {point !== undefined && !editing && (
          <>
            {globalError !== null && (
              <div className="error-banner mt-6" role="alert">
                {globalError}
              </div>
            )}
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <DetailItem label="Site" value={site?.name ?? point.siteId} />
              <DetailItem label="Status" value={point.isActive ? 'Aktif' : 'Nonaktif'} />
              <DetailItem label="Deskripsi" value={point.description ?? 'Tidak ada deskripsi'} />
              <DetailItem
                label="Deskripsi lokasi"
                value={point.locationDescription ?? 'Tidak ada deskripsi lokasi'}
              />
              <DetailItem
                label="Perangkat saat ini"
                value={
                  point.currentDevice === null
                    ? 'Belum ada perangkat'
                    : `${point.currentDevice.displayName} (${point.currentDevice.hardwareId})`
                }
              />
              <DetailItem
                label="Terakhir terlihat"
                value={formatTimestamp(point.currentDevice?.lastSeenAt ?? null)}
              />
              <DetailItem label="Dibuat" value={formatTimestamp(point.createdAt)} />
              <DetailItem label="Diperbarui" value={formatTimestamp(point.updatedAt)} />
            </dl>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={onClose} className="secondary-button">
                Tutup
              </button>
              {role === 'PROJECT_OWNER' && (
                <>
                  <button type="button" onClick={beginEdit} className="secondary-button">
                    Edit
                  </button>
                  {point.isActive && (
                    <button
                      type="button"
                      onClick={() => setConfirmInput({ isActive: false })}
                      className="danger-button"
                    >
                      Nonaktifkan
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function DetailItem({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{value}</dd>
    </div>
  );
}

function validateEdit(name: string, description: string, locationDescription: string): EditErrors {
  return {
    ...(name.trim().length === 0
      ? { name: 'Nama wajib diisi.' }
      : name.trim().length > 120
        ? { name: 'Nama maksimal 120 karakter.' }
        : {}),
    ...(description.length > 2000 ? { description: 'Deskripsi maksimal 2000 karakter.' } : {}),
    ...(locationDescription.length > 500
      ? { locationDescription: 'Deskripsi lokasi maksimal 500 karakter.' }
      : {}),
  };
}

export function formatTimestamp(value: string | null): string {
  if (value === null) return 'Belum tersedia';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Waktu tidak valid';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(date);
}
