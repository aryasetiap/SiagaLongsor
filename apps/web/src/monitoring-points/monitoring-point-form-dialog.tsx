'use client';

import { type FormEvent, useState } from 'react';

import type { OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import { createMonitoringPoint } from './monitoring-points-api';
import type { MonitoringPoint } from './monitoring-point-contracts';
import { SiteLookupField } from './site-lookup-field';

interface CreateDialogProps {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  onClose(): void;
  onCreated(point: MonitoringPoint): void;
}

interface FormErrors {
  readonly siteId?: string;
  readonly name?: string;
  readonly description?: string;
  readonly locationDescription?: string;
}

export function MonitoringPointCreateDialog({
  client,
  organizationId,
  onClose,
  onCreated,
}: CreateDialogProps) {
  const [siteId, setSiteId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [locationDescription, setLocationDescription] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const validation = validateCreate({ siteId, name, description, locationDescription });
    setErrors(validation);
    setGlobalError(null);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    try {
      const response = await createMonitoringPoint(client, organizationId, {
        siteId,
        name: name.trim(),
        description: optionalText(description),
        locationDescription: optionalText(locationDescription),
      });
      onCreated(response.data);
    } catch (reason) {
      const apiError = reason instanceof ApiClientError ? reason : null;
      setErrors(detailsToErrors(apiError?.details));
      setGlobalError(
        apiError?.status === 403
          ? 'Anda tidak memiliki izin untuk menambah titik monitoring.'
          : (apiError?.message ?? 'Titik monitoring tidak dapat disimpan.'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-monitoring-point-title"
        className="dialog-panel"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="create-monitoring-point-title" className="text-xl font-bold text-slate-950">
              Tambah titik monitoring
            </h2>
            <p className="mt-1 text-sm text-slate-600">Pilih Site yang tersedia dari API.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup form tambah"
            className="icon-button"
            autoFocus
          >
            ×
          </button>
        </div>

        <form className="mt-6 space-y-5" onSubmit={(event) => void submit(event)} noValidate>
          {globalError !== null && (
            <div role="alert" className="error-banner">
              {globalError}
            </div>
          )}
          <SiteLookupField
            client={client}
            organizationId={organizationId}
            value={siteId}
            error={errors.siteId}
            onChange={setSiteId}
          />
          <TextField
            id="monitoring-point-name"
            label="Nama titik monitoring"
            value={name}
            maxLength={120}
            error={errors.name}
            onChange={setName}
          />
          <TextAreaField
            id="monitoring-point-description"
            label="Deskripsi (opsional)"
            value={description}
            maxLength={2000}
            error={errors.description}
            onChange={setDescription}
          />
          <TextAreaField
            id="monitoring-point-location"
            label="Deskripsi lokasi (opsional)"
            value={locationDescription}
            maxLength={500}
            error={errors.locationDescription}
            onChange={setLocationDescription}
          />
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="secondary-button">
              Batal
            </button>
            <button type="submit" disabled={submitting} className="primary-button">
              {submitting ? 'Menyimpan…' : 'Simpan titik monitoring'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function TextField({
  id,
  label,
  value,
  maxLength,
  error,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly maxLength: number;
  readonly error?: string | undefined;
  onChange(value: string): void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-slate-800">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        aria-invalid={error !== undefined}
        aria-describedby={error === undefined ? undefined : `${id}-error`}
        className="auth-input"
      />
      {error !== undefined && (
        <p id={`${id}-error`} className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextAreaField({
  id,
  label,
  value,
  maxLength,
  error,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly maxLength: number;
  readonly error?: string | undefined;
  onChange(value: string): void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-slate-800">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        rows={3}
        aria-invalid={error !== undefined}
        aria-describedby={error === undefined ? undefined : `${id}-error`}
        className="auth-input resize-y"
      />
      {error !== undefined && (
        <p id={`${id}-error`} className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function validateCreate(input: {
  readonly siteId: string;
  readonly name: string;
  readonly description: string;
  readonly locationDescription: string;
}): FormErrors {
  return {
    ...(input.siteId.length === 0 ? { siteId: 'Site wajib dipilih.' } : {}),
    ...(input.name.trim().length === 0
      ? { name: 'Nama wajib diisi.' }
      : input.name.trim().length > 120
        ? { name: 'Nama maksimal 120 karakter.' }
        : {}),
    ...(input.description.length > 2000
      ? { description: 'Deskripsi maksimal 2000 karakter.' }
      : {}),
    ...(input.locationDescription.length > 500
      ? { locationDescription: 'Deskripsi lokasi maksimal 500 karakter.' }
      : {}),
  };
}

export function detailsToErrors(details: ApiClientError['details']): FormErrors {
  const result: Record<string, string> = {};
  for (const detail of details ?? []) {
    const field = detail.field.split('.').at(-1);
    if (
      field !== undefined &&
      ['siteId', 'name', 'description', 'locationDescription'].includes(field) &&
      detail.messages[0] !== undefined
    ) {
      result[field] = detail.messages[0];
    }
  }
  return result;
}

export function optionalText(value: string): string | null {
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}
