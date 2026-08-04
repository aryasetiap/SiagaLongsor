'use client';

import { useEffect, useRef, useState } from 'react';

import type { OrganizationApiClient } from '../api/contracts';
import { listSites } from '../sites/sites-api';
import type { Site } from '../sites/site-contracts';
import {
  createReportJob,
  downloadCsv,
  downloadReport,
  getReportJob,
  listReportJobs,
} from './reports-api';
import type { ReportJob } from './reports-contracts';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_BACKOFF_MS = 30000;

const terminal = (status: ReportJob['status']) =>
  status === 'SUCCEEDED' || status === 'FAILED' || status === 'EXPIRED';

export function ReportsManager({
  client,
  organizationId,
}: {
  client: OrganizationApiClient;
  organizationId: string;
}) {
  return (
    <ReportsManagerScope key={organizationId} client={client} organizationId={organizationId} />
  );
}

function ReportsManagerScope({
  client,
  organizationId,
}: {
  client: OrganizationApiClient;
  organizationId: string;
}) {
  const requestEpoch = useRef(0);
  const [sites, setSites] = useState<readonly Site[]>([]);
  const [siteId, setSiteId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [jobs, setJobs] = useState<readonly ReportJob[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void listSites(client, organizationId, { limit: 100, sort: 'name:asc' })
      .then((response) => {
        if (cancelled) return;
        setSites(response.data);
        setSiteId(response.data[0]?.id ?? '');
      })
      .catch(() => {
        if (!cancelled) {
          setError('Laporan belum dapat dimuat. Coba lagi.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, organizationId]);

  useEffect(() => {
    if (!siteId) return;

    let cancelled = false;
    const epoch = ++requestEpoch.current;

    void listReportJobs(client, organizationId, { siteId })
      .then((response) => {
        if (cancelled || epoch !== requestEpoch.current) return;
        setJobs(response.data);
        setCursor(response.page.nextCursor);
      })
      .catch(() => {
        if (!cancelled && epoch === requestEpoch.current) {
          setError('Laporan belum dapat dimuat. Coba lagi.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, organizationId, siteId]);

  useEffect(() => {
    const active = jobs.filter((job) => !terminal(job.status));
    if (active.length === 0) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = POLL_INTERVAL_MS;

    const tick = async () => {
      try {
        const updated = await Promise.all(
          active.map(async (job) => (await getReportJob(client, organizationId, job.id)).data),
        );

        if (stopped) return;

        setJobs((current) =>
          current.map((job) => updated.find((candidate) => candidate.id === job.id) ?? job),
        );
      } catch {
        if (stopped) return;

        setError('Status laporan belum dapat diperbarui; mencoba kembali.');
        retryDelay = Math.min(retryDelay * 2, MAX_POLL_BACKOFF_MS);
        timer = setTimeout(() => void tick(), retryDelay);
      }
    };

    timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);

    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [client, jobs, organizationId]);

  const valid = () => {
    if (!siteId || !from || !to) {
      setError('Site, dari, dan sampai wajib diisi.');
      return false;
    }

    const start = new Date(from);
    const end = new Date(to);

    if (!(start < end)) {
      setError('Waktu dari harus sebelum sampai.');
      return false;
    }

    if (end.getTime() - start.getTime() > 31 * 86400000) {
      setError('Rentang maksimal 31 hari.');
      return false;
    }

    return true;
  };

  const make = async () => {
    if (!valid()) return;

    setBusy(true);
    try {
      const job = (
        await createReportJob(client, organizationId, {
          siteId,
          from: new Date(from).toISOString(),
          to: new Date(to).toISOString(),
        })
      ).data;

      setJobs((current) => [job, ...current]);
    } catch {
      setError('Permintaan laporan belum berhasil.');
    } finally {
      setBusy(false);
    }
  };

  const selectSite = (nextSiteId: string) => {
    requestEpoch.current++;
    setSiteId(nextSiteId);
    setJobs([]);
    setCursor(null);
    setError(null);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border bg-white p-5">
        <label>
          Site
          <select
            aria-label="Site"
            value={siteId}
            onChange={(event) => selectSite(event.target.value)}
          >
            <option value="">Pilih Site</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label>
            Dari
            <input
              aria-label="Dari"
              type="datetime-local"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>

          <label>
            Sampai
            <input
              aria-label="Sampai"
              type="datetime-local"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="error-banner">
            {error}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => {
              if (valid()) {
                void downloadCsv(client, organizationId, {
                  siteId,
                  from: new Date(from).toISOString(),
                  to: new Date(to).toISOString(),
                }).catch(() => setError('CSV belum dapat diunduh.'));
              }
            }}
          >
            Ekspor telemetry CSV
          </button>

          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => void make()}
          >
            {busy ? 'Membuat…' : 'Buat laporan PDF'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5">
        <h2 className="font-bold">Laporan PDF</h2>
        <p className="mt-1 text-sm">Status saat laporan dibuat</p>

        <ul className="mt-3 space-y-2">
          {jobs.map((job) => (
            <li key={job.id} className="rounded-xl bg-slate-50 p-3">
              <strong>{job.status}</strong>
              <p>
                {job.site.name} · {job.from} — {job.to}
              </p>

              {job.status === 'SUCCEEDED' && job.artifact && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    void downloadReport(
                      client,
                      organizationId,
                      `/report-jobs/${encodeURIComponent(job.id)}/content`,
                      job.artifact!.fileName,
                    )
                  }
                >
                  Unduh PDF
                </button>
              )}

              {job.status === 'FAILED' && (
                <p>{job.failureMessage ?? 'Laporan belum dapat dibuat.'}</p>
              )}

              {job.status === 'EXPIRED' && <p>Artefak tidak lagi tersedia.</p>}

              {(job.status === 'FAILED' || job.status === 'EXPIRED') && (
                <button type="button" onClick={() => void make()}>
                  Buat ulang
                </button>
              )}
            </li>
          ))}
        </ul>

        {cursor && (
          <button
            type="button"
            onClick={() => {
              const nextCursor = cursor;
              const epoch = ++requestEpoch.current;

              void listReportJobs(client, organizationId, {
                siteId,
                cursor: nextCursor,
              })
                .then((response) => {
                  if (epoch !== requestEpoch.current) return;
                  setJobs((current) => [...current, ...response.data]);
                  setCursor(response.page.nextCursor);
                })
                .catch(() => {
                  if (epoch === requestEpoch.current) {
                    setError('Laporan belum dapat dimuat. Coba lagi.');
                  }
                });
            }}
          >
            Muat lebih banyak
          </button>
        )}
      </section>
    </div>
  );
}
