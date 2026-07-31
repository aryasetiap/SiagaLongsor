'use client';

import { type FormEvent, useState } from 'react';

import type { OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import { TextField } from '../monitoring-points/monitoring-point-form-dialog';
import { SiteLookupField } from '../monitoring-points/site-lookup-field';
import type { DeviceCredentialData } from './device-contracts';
import { registerDevice } from './devices-api';
import { MonitoringPointLookupField } from './monitoring-point-lookup-field';

interface DeviceRegisterDialogProps {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  onClose(): void;
  onRegistered(data: DeviceCredentialData): void;
}

interface FormErrors {
  readonly hardwareId?: string;
  readonly displayName?: string;
  readonly siteId?: string;
  readonly monitoringPointId?: string;
}

export function DeviceRegisterDialog({
  client,
  organizationId,
  onClose,
  onRegistered,
}: DeviceRegisterDialogProps) {
  const [hardwareId, setHardwareId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [siteId, setSiteId] = useState('');
  const [monitoringPointId, setMonitoringPointId] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const validation = validate({ hardwareId, displayName, siteId, monitoringPointId });
    setErrors(validation);
    setGlobalError(null);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    try {
      const response = await registerDevice(client, organizationId, {
        hardwareId: hardwareId.trim(),
        displayName: displayName.trim(),
        monitoringPointId,
      });
      onRegistered(response.data);
    } catch (reason) {
      const error = reason instanceof ApiClientError ? reason : null;
      setErrors(validationDetails(error?.details));
      setGlobalError(safeMutationError(error, 'Perangkat tidak dapat didaftarkan.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="register-device-title"
        className="dialog-panel"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="register-device-title" className="text-xl font-bold text-slate-950">
              Daftarkan perangkat
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Credential awal akan ditampilkan satu kali setelah perangkat berhasil dibuat.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup form registrasi"
            className="icon-button"
            autoFocus
          >
            ×
          </button>
        </div>

        <form className="mt-6 space-y-5" onSubmit={(event) => void submit(event)} noValidate>
          {globalError !== null && (
            <div className="error-banner" role="alert">
              {globalError}
            </div>
          )}
          <TextField
            id="device-hardware-id"
            label="Hardware ID"
            value={hardwareId}
            maxLength={64}
            error={errors.hardwareId}
            onChange={setHardwareId}
          />
          <p className="-mt-3 text-xs text-slate-500">
            Gunakan 3–64 karakter: huruf kapital, angka, garis bawah, atau tanda hubung.
          </p>
          <TextField
            id="device-display-name"
            label="Nama perangkat"
            value={displayName}
            maxLength={120}
            error={errors.displayName}
            onChange={setDisplayName}
          />
          <SiteLookupField
            client={client}
            organizationId={organizationId}
            value={siteId}
            error={errors.siteId}
            onChange={(nextSiteId) => {
              setSiteId(nextSiteId);
              setMonitoringPointId('');
            }}
          />
          <MonitoringPointLookupField
            client={client}
            organizationId={organizationId}
            siteId={siteId}
            value={monitoringPointId}
            error={errors.monitoringPointId}
            idPrefix="register-device"
            onChange={setMonitoringPointId}
          />
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="secondary-button">
              Batal
            </button>
            <button type="submit" disabled={submitting} className="primary-button">
              {submitting ? 'Mendaftarkan…' : 'Daftarkan perangkat'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function validate(input: {
  readonly hardwareId: string;
  readonly displayName: string;
  readonly siteId: string;
  readonly monitoringPointId: string;
}): FormErrors {
  const normalizedHardwareId = input.hardwareId.trim();
  const normalizedName = input.displayName.trim();
  return {
    ...(!/^[A-Z0-9][A-Z0-9_-]{2,63}$/.test(normalizedHardwareId)
      ? {
          hardwareId:
            'Hardware ID harus 3–64 karakter dan hanya memakai huruf kapital, angka, _ atau -.',
        }
      : {}),
    ...(normalizedName.length === 0
      ? { displayName: 'Nama perangkat wajib diisi.' }
      : normalizedName.length > 120
        ? { displayName: 'Nama perangkat maksimal 120 karakter.' }
        : {}),
    ...(input.siteId.length === 0 ? { siteId: 'Site wajib dipilih.' } : {}),
    ...(input.monitoringPointId.length === 0
      ? { monitoringPointId: 'Titik monitoring wajib dipilih.' }
      : {}),
  };
}

export function validationDetails(details: ApiClientError['details']): FormErrors {
  const errors: Record<string, string> = {};
  for (const detail of details ?? []) {
    const field = detail.field.split('.').at(-1);
    if (
      field !== undefined &&
      ['hardwareId', 'displayName', 'monitoringPointId'].includes(field) &&
      detail.messages[0] !== undefined
    ) {
      errors[field] = detail.messages[0];
    }
  }
  return errors;
}

export function safeMutationError(error: ApiClientError | null, fallback: string): string {
  const requestSuffix = error?.requestId === undefined ? '' : ` Request ID: ${error.requestId}`;
  if (error?.status === 403)
    return `Anda tidak memiliki izin untuk melakukan tindakan ini.${requestSuffix}`;
  if (error?.status === 404) return `Perangkat atau assignment tidak ditemukan.${requestSuffix}`;
  if (error?.status === 409)
    return `Tindakan bertentangan dengan status atau assignment saat ini.${requestSuffix}`;
  if (error?.kind === 'network') return `Layanan perangkat tidak dapat dijangkau.${requestSuffix}`;
  return `${error?.message ?? fallback}${requestSuffix}`;
}
