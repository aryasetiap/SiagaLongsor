'use client';

import { type FormEvent, forwardRef, useEffect, useRef, useState } from 'react';

import type { OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import { acknowledgeAlert, markAlertFalseAlarm, resolveAlert } from './risk-api';
import type { Alert, AlertMutationResponse } from './risk-contracts';
import { alertTypeLabel, severityLabel } from './risk-presentation';

export type AlertOperation = 'acknowledge' | 'resolve' | 'false-alarm';

export function AlertOperationDialog({
  client,
  organizationId,
  alert,
  operation,
  onClose,
  onSuccess,
  onStale,
  onUnavailable,
}: {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  readonly alert: Alert;
  readonly operation: AlertOperation;
  readonly onClose: () => void;
  readonly onSuccess: (response: AlertMutationResponse) => void;
  readonly onStale: () => void;
  readonly onUnavailable?: () => void;
}) {
  const [actionId] = useState(() => crypto.randomUUID());
  const [note, setNote] = useState('');
  const [fieldCondition, setFieldCondition] = useState('');
  const [sopExecuted, setSopExecuted] = useState<boolean | null>(null);
  const [singleValue, setSingleValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [stale, setStale] = useState(false);
  const firstField = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    firstField.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
      previouslyFocused?.focus();
    };
  }, [onClose, submitting]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validate();
    if (validation !== null) {
      setError(validation);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response =
        operation === 'acknowledge'
          ? await acknowledgeAlert(client, organizationId, alert.id, {
              actionId,
              note: note.trim(),
              fieldCondition: fieldCondition.trim(),
              sopExecuted: sopExecuted!,
            })
          : operation === 'resolve'
            ? await resolveAlert(client, organizationId, alert.id, {
                actionId,
                resolutionNote: singleValue.trim(),
              })
            : await markAlertFalseAlarm(client, organizationId, alert.id, {
                actionId,
                reason: singleValue.trim(),
              });
      onSuccess(response);
    } catch (reason) {
      if (reason instanceof ApiClientError && reason.code === 'ALERT_STATE_CONFLICT') {
        setError('Peringatan telah berubah. Data terbaru sedang dimuat ulang.');
        setStale(true);
        onStale();
      } else if (reason instanceof ApiClientError && reason.code === 'IDEMPOTENCY_CONFLICT') {
        setError('Permintaan ini berkonflik dengan aksi sebelumnya. Periksa status terbaru.');
        setStale(true);
        onStale();
      } else if (reason instanceof ApiClientError && reason.status === 403) {
        setError('Anda tidak memiliki izin untuk melakukan aksi ini.');
        setStale(true);
        onStale();
      } else if (reason instanceof ApiClientError && reason.status === 404) {
        onUnavailable?.();
      } else {
        setError('Aksi belum berhasil. Periksa koneksi lalu coba lagi.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function validate(): string | null {
    if (operation === 'acknowledge') {
      if (note.trim().length === 0 || note.trim().length > 2_000)
        return 'Catatan wajib diisi dan maksimal 2.000 karakter.';
      if (fieldCondition.trim().length === 0 || fieldCondition.trim().length > 1_000)
        return 'Kondisi lapangan wajib diisi dan maksimal 1.000 karakter.';
      if (sopExecuted === null) return 'Pilih apakah SOP telah dijalankan.';
      return null;
    }
    if (singleValue.trim().length === 0 || singleValue.trim().length > 2_000) {
      return operation === 'resolve'
        ? 'Catatan penyelesaian wajib diisi dan maksimal 2.000 karakter.'
        : 'Alasan alarm palsu wajib diisi dan maksimal 2.000 karakter.';
    }
    return null;
  }

  const title = {
    acknowledge: 'Konfirmasi peringatan',
    resolve: 'Selesaikan peringatan',
    'false-alarm': 'Tandai sebagai alarm palsu',
  }[operation];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="alert-operation-title"
        className="my-auto max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6"
      >
        <h2 id="alert-operation-title" className="text-xl font-bold text-slate-950">
          {title}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {alertTypeLabel(alert.type)} · {severityLabel(alert.severity)} ·{' '}
          {alert.monitoringPoint.name}
        </p>
        {operation !== 'acknowledge' && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
            Status ini terminal untuk instance peringatan ini dan tetap tersimpan pada histori serta
            audit.
          </p>
        )}
        <SopUnavailable />
        <form noValidate onSubmit={(event) => void submit(event)} className="mt-5 space-y-4">
          {operation === 'acknowledge' ? (
            <>
              <TextAreaField
                ref={firstField}
                id="acknowledge-note"
                label="Catatan operator"
                value={note}
                maxLength={2_000}
                onChange={setNote}
              />
              <TextAreaField
                id="field-condition"
                label="Kondisi lapangan"
                value={fieldCondition}
                maxLength={1_000}
                onChange={setFieldCondition}
              />
              <fieldset>
                <legend className="text-sm font-semibold">Apakah SOP telah dijalankan?</legend>
                <div className="mt-2 flex gap-5">
                  {[true, false].map((value) => (
                    <label key={String(value)} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="sopExecuted"
                        checked={sopExecuted === value}
                        onChange={() => setSopExecuted(value)}
                      />
                      {value ? 'Ya' : 'Belum'}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          ) : (
            <TextAreaField
              ref={firstField}
              id={operation === 'resolve' ? 'resolution-note' : 'false-alarm-reason'}
              label={operation === 'resolve' ? 'Catatan penyelesaian' : 'Alasan alarm palsu'}
              value={singleValue}
              maxLength={2_000}
              onChange={setSingleValue}
            />
          )}
          {error !== null && (
            <p id="operation-error" role="alert" className="text-sm font-semibold text-red-700">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="secondary-button"
              disabled={submitting}
              onClick={onClose}
            >
              Batal
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={submitting || stale}
              {...(error === null ? {} : { 'aria-describedby': 'operation-error' })}
            >
              {submitting ? 'Menyimpan…' : 'Konfirmasi'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function SopUnavailable() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 rounded-xl border border-slate-200 p-3">
      <button type="button" className="secondary-button" onClick={() => setOpen((value) => !value)}>
        Buka SOP
      </button>
      {open && <p className="mt-2 text-sm text-slate-700">SOP resmi belum tersedia pada sistem</p>}
    </div>
  );
}

const TextAreaField = forwardRef<
  HTMLTextAreaElement,
  {
    readonly id: string;
    readonly label: string;
    readonly value: string;
    readonly maxLength: number;
    readonly onChange: (value: string) => void;
  }
>(function TextAreaField({ id, label, value, maxLength, onChange }, ref) {
  return (
    <label htmlFor={id} className="block text-sm font-semibold text-slate-800">
      {label}
      <textarea
        ref={ref}
        id={id}
        required
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field-input mt-1 min-h-24 resize-y"
      />
    </label>
  );
});
