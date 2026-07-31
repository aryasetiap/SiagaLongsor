'use client';

import { useEffect, useState } from 'react';

import type { ListEnvelope, OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import { listRiskAssessments } from './risk-api';
import type { RiskAssessment } from './risk-contracts';
import { formatSiteTimestamp, reasonLabel, RiskBadge, riskLabel } from './risk-presentation';

interface Props {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  readonly monitoringPointId: string;
  readonly monitoringPointName: string;
  readonly timezone: string;
  readonly onClose: () => void;
}

export function RiskAssessmentDialog(props: Props) {
  const [result, setResult] = useState<ListEnvelope<RiskAssessment> | null>(null);
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  const [retry, setRetry] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    void listRiskAssessments(props.client, props.organizationId, props.monitoringPointId, {
      limit: 25,
    })
      .then((response) => {
        if (active) setResult(response);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason : new Error('Riwayat gagal dimuat.'));
      });
    return () => {
      active = false;
    };
  }, [props.client, props.monitoringPointId, props.organizationId, retry]);

  async function loadMore() {
    if (result?.page.nextCursor === null || result === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await listRiskAssessments(
        props.client,
        props.organizationId,
        props.monitoringPointId,
        { cursor: result.page.nextCursor, limit: 25 },
      );
      const known = new Set(result.data.map((item) => item.id));
      setResult({
        data: [...result.data, ...next.data.filter((item) => !known.has(item.id))],
        page: next.page,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error('Riwayat gagal dimuat.'));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/40 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="assessment-title"
        aria-describedby="assessment-description"
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="assessment-title" className="text-xl font-bold text-slate-950">
              Riwayat penilaian — {props.monitoringPointName}
            </h2>
            <p id="assessment-description" className="mt-1 text-sm text-slate-600">
              Penilaian terbaru ditampilkan terlebih dahulu dan tetap terikat pada versi profil.
            </p>
          </div>
          <button type="button" onClick={props.onClose} className="secondary-button">
            Tutup
          </button>
        </div>

        {result === null && error === null && (
          <p aria-live="polite" className="mt-6 text-sm text-slate-600">
            Memuat riwayat penilaian…
          </p>
        )}
        {error !== null && (
          <div role="alert" className="error-banner mt-6">
            <p>Riwayat penilaian tidak dapat dimuat.</p>
            {error instanceof ApiClientError && error.requestId !== undefined && (
              <p className="mt-1 text-xs">Request ID: {error.requestId}</p>
            )}
            <button
              type="button"
              className="secondary-button mt-3"
              onClick={() => {
                setResult(null);
                setError(null);
                setRetry((v) => v + 1);
              }}
            >
              Coba lagi
            </button>
          </div>
        )}
        {result?.data.length === 0 && (
          <p className="mt-6 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">
            Belum ada riwayat penilaian.
          </p>
        )}
        <div className="mt-6 space-y-3">
          {result?.data.map((assessment) => (
            <article key={assessment.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <RiskBadge value={assessment.serverRisk} />
                <span className="text-xs font-semibold text-slate-600">
                  Firmware: {riskLabel(assessment.firmwareRisk)}
                </span>
                {!assessment.affectsCurrentState && (
                  <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-800">
                    Data historis terlambat
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm text-slate-700">
                {assessment.reasons.map(reasonLabel).join(' ')}
              </p>
              <dl className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                <div>
                  <dt className="font-semibold">Dievaluasi</dt>
                  <dd>{formatSiteTimestamp(assessment.evaluatedAt, props.timezone)}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Profil</dt>
                  <dd>
                    {assessment.profileId} · versi {assessment.profileVersion}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
        {result?.page.nextCursor !== null && (
          <button
            type="button"
            className="secondary-button mt-5"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? 'Memuat…' : 'Muat lebih banyak'}
          </button>
        )}
      </section>
    </div>
  );
}
