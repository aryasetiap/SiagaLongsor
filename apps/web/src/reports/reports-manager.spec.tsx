import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OrganizationApiClient } from '../api/contracts';
import { ReportsManager } from './reports-manager';

type ReportStatus = 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
type Job = ReturnType<typeof job>;
type JobEnvelope = { data: Job };

describe('ReportsManager', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders Reports controls shared by both report-enabled roles', async () => {
    render(<ReportsManager client={client()} organizationId="org-1" />);

    expect(await screen.findByLabelText('Site')).toHaveValue('site-1');
    expect(screen.getByText('Status saat laporan dibuat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ekspor telemetry CSV' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buat laporan PDF' })).toBeInTheDocument();
  });

  it('rejects missing, inverted, and over-31-day ranges before binary or POST requests', async () => {
    const current = client();
    render(<ReportsManager client={current} organizationId="org-1" />);
    await screen.findByLabelText('Site');

    await userEvent.click(screen.getByRole('button', { name: 'Buat laporan PDF' }));
    expect(screen.getByRole('alert')).toHaveTextContent('wajib');

    await fill('2026-02-01T00:00', '2026-01-01T00:00');
    await userEvent.click(screen.getByRole('button', { name: 'Ekspor telemetry CSV' }));
    expect(screen.getByRole('alert')).toHaveTextContent('sebelum');

    await fill('2026-01-01T00:00', '2026-02-02T00:00');
    await userEvent.click(screen.getByRole('button', { name: 'Buat laporan PDF' }));
    expect(screen.getByRole('alert')).toHaveTextContent('31 hari');

    expect(postCount(current)).toBe(0);
    expect(current.organizationDownload).not.toHaveBeenCalled();
  });

  it('exports CSV only after a valid range through the authenticated organization download', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:reports-csv');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const current = client();
    render(<ReportsManager client={current} organizationId="org-1" />);
    await screen.findByLabelText('Site');

    await fill('2026-01-01T00:00', '2026-01-02T00:00');
    await userEvent.click(screen.getByRole('button', { name: 'Ekspor telemetry CSV' }));

    await waitFor(() => expect(current.organizationDownload).toHaveBeenCalledTimes(1));
    expect(String(vi.mocked(current.organizationDownload!).mock.calls[0]?.[0])).toContain(
      '/reports/telemetry.csv?',
    );
  });

  it('creates one authoritative QUEUED job, blocks duplicate submit, and polls to PROCESSING then SUCCEEDED', async () => {
    const create = deferred<JobEnvelope>();
    const current = client({ jobs: [], create });

    render(<ReportsManager client={current} organizationId="org-1" />);
    await screen.findByLabelText('Site');
    await fill('2026-01-01T00:00', '2026-01-02T00:00');

    await userEvent.click(screen.getByRole('button', { name: 'Buat laporan PDF' }));
    expect(screen.getByRole('button', { name: 'Membuat…' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Membuat…' }));
    expect(postCount(current)).toBe(1);

    vi.useFakeTimers();
    await act(async () => {
      create.resolve({ data: job('QUEUED', null, 'job-poll') });
      await Promise.resolve();
    });
    expect(screen.getByText('QUEUED')).toBeInTheDocument();

    current.__detail
      .mockResolvedValueOnce({ data: job('PROCESSING', null, 'job-poll') })
      .mockResolvedValueOnce({ data: job('SUCCEEDED', null, 'job-poll') });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByText('PROCESSING')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByText('SUCCEEDED')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(current.__detail).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Unduh PDF' })).toBeInTheDocument();
  });

  it('renders FAILED and EXPIRED safely and regenerates by creating a new job', async () => {
    const current = client({
      jobs: [
        job('FAILED', 'Aman untuk pengguna', 'job-failed'),
        job('EXPIRED', null, 'job-expired'),
      ],
    });

    render(<ReportsManager client={current} organizationId="org-1" />);
    expect(await screen.findByText('FAILED')).toBeInTheDocument();
    expect(screen.getByText('Aman untuk pengguna')).toBeInTheDocument();
    expect(screen.getByText('EXPIRED')).toBeInTheDocument();
    expect(screen.getByText('Artefak tidak lagi tersedia.')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: 'Unduh PDF' })).toHaveLength(0);

    await fill('2026-01-01T00:00', '2026-01-02T00:00');
    await userEvent.click(screen.getAllByRole('button', { name: 'Buat ulang' })[0]!);

    await waitFor(() => expect(postCount(current)).toBe(1));
    expect(await screen.findByText('QUEUED')).toBeInTheDocument();
    expect(screen.getByText('FAILED')).toBeInTheDocument();
  });

  it('appends backend history using the exact cursor and removes Load More at the end', async () => {
    const current = client({
      jobs: [job('FAILED', 'Terbaru', 'job-new')],
      cursor: 'next-1',
      historyJobs: [job('EXPIRED', null, 'job-old')],
    });

    render(<ReportsManager client={current} organizationId="org-1" />);

    expect(await screen.findByText('FAILED')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Muat lebih banyak' }));
    expect(await screen.findByText('EXPIRED')).toBeInTheDocument();

    expect(current.__paths.some((path) => path.includes('cursor=next-1'))).toBe(true);
    expect(screen.queryByRole('button', { name: 'Muat lebih banyak' })).toBeNull();
    expect(screen.queryByText(/totalCount/i)).toBeNull();
  });

  it('preserves authoritative state through a transient poll error, retries with backoff, and stops after unmount', async () => {
    const create = deferred<JobEnvelope>();
    const current = client({ jobs: [], create });
    const view = render(<ReportsManager client={current} organizationId="org-1" />);

    await screen.findByLabelText('Site');
    await fill('2026-01-01T00:00', '2026-01-02T00:00');
    await userEvent.click(screen.getByRole('button', { name: 'Buat laporan PDF' }));

    vi.useFakeTimers();
    await act(async () => {
      create.resolve({ data: job('QUEUED', null, 'job-retry') });
      await Promise.resolve();
    });
    expect(screen.getByText('QUEUED')).toBeInTheDocument();

    current.__detail
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ data: job('SUCCEEDED', null, 'job-retry') });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(current.__detail).toHaveBeenCalledTimes(1);
    expect(screen.getByText('QUEUED')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('mencoba kembali');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5999);
    });
    expect(current.__detail).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(current.__detail).toHaveBeenCalledTimes(2);
    expect(screen.getByText('SUCCEEDED')).toBeInTheDocument();

    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(current.__detail).toHaveBeenCalledTimes(2);
  });

  it('clears organization-scoped state and ignores a late poll response from the previous organization', async () => {
    const create = deferred<JobEnvelope>();
    const lateOrganizationA = deferred<JobEnvelope>();
    const current = client({
      create,
      jobsByOrganization: {
        'org-1': [],
        'org-2': [job('FAILED', 'Org B authoritative', 'job-b', 'org-2', 'Site B')],
      },
      sitesByOrganization: {
        'org-1': [site('site-1', 'Site A')],
        'org-2': [site('site-2', 'Site B')],
      },
    });
    current.__detail.mockReturnValueOnce(lateOrganizationA.promise);

    const view = render(<ReportsManager client={current} organizationId="org-1" />);
    await waitFor(() => expect(screen.getByLabelText('Site')).toHaveValue('site-1'));

    await fill('2026-01-01T00:00', '2026-01-02T00:00');
    await userEvent.click(screen.getByRole('button', { name: 'Buat laporan PDF' }));

    vi.useFakeTimers();
    await act(async () => {
      create.resolve({ data: job('QUEUED', null, 'job-a', 'org-1', 'Site A') });
      await Promise.resolve();
    });
    expect(screen.getByText('QUEUED')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(current.__detail).toHaveBeenCalledTimes(1);

    view.rerender(<ReportsManager client={current} organizationId="org-2" />);
    await flushMicrotasks();

    expect(screen.getByLabelText('Site')).toHaveValue('site-2');
    expect(screen.getByText('FAILED')).toBeInTheDocument();
    expect(screen.getByText('Org B authoritative')).toBeInTheDocument();

    await act(async () => {
      lateOrganizationA.resolve({
        data: job('SUCCEEDED', null, 'job-a', 'org-1', 'Site A'),
      });
      await Promise.resolve();
    });

    expect(screen.queryByText('SUCCEEDED')).toBeNull();
    expect(screen.getByText('FAILED')).toBeInTheDocument();
    expect(screen.getByLabelText('Site')).toHaveValue('site-2');
  });
});

async function fill(from: string, to: string) {
  await userEvent.clear(screen.getByLabelText('Dari'));
  await userEvent.type(screen.getByLabelText('Dari'), from);
  await userEvent.clear(screen.getByLabelText('Sampai'));
  await userEvent.type(screen.getByLabelText('Sampai'), to);
}

async function flushMicrotasks() {
  await act(async () => {
    for (let index = 0; index < 8; index++) await Promise.resolve();
  });
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function site(id: string, name: string) {
  return { id, name, address: null, timezone: 'Asia/Jakarta' };
}

function job(
  status: ReportStatus,
  failureMessage: string | null = null,
  id = `job-${status.toLowerCase()}`,
  organizationId = 'org-1',
  siteName = 'Site',
) {
  return {
    id,
    organizationId,
    site: { id: organizationId === 'org-2' ? 'site-2' : 'site-1', name: siteName },
    reportType: 'SITE_PERIOD_SUMMARY_PDF' as const,
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-01-02T00:00:00.000Z',
    status,
    requestedAt: '2026-01-01T00:00:00.000Z',
    failureMessage,
    artifact:
      status === 'SUCCEEDED'
        ? {
            fileName: 'report.pdf',
            mediaType: 'application/pdf' as const,
            sizeBytes: 1,
            expiresAt: '2027-01-01T00:00:00.000Z',
          }
        : null,
  };
}

function client(
  options: {
    readonly create?: Deferred<JobEnvelope>;
    readonly jobs?: Job[];
    readonly cursor?: string;
    readonly historyJobs?: Job[];
    readonly jobsByOrganization?: Record<string, Job[]>;
    readonly sitesByOrganization?: Record<string, ReturnType<typeof site>[]>;
  } = {},
) {
  const detail = vi.fn();
  const create: Deferred<JobEnvelope> =
    options.create ??
    ({
      promise: Promise.resolve({ data: job('QUEUED', null, 'job-created') }),
      resolve: () => undefined,
      reject: () => undefined,
    } as Deferred<JobEnvelope>);

  const paths: string[] = [];

  const request = vi.fn((path: string, organizationId: string, init?: RequestInit) => {
    paths.push(`${organizationId}:${path}`);

    if (path.startsWith('/sites?')) {
      const sites = options.sitesByOrganization?.[organizationId] ?? [site('site-1', 'Site')];
      return Promise.resolve({
        data: sites,
        page: { nextCursor: null, hasMore: false },
      });
    }

    if (path === '/report-jobs' && init?.method === 'POST') return create.promise;

    if (path.startsWith('/report-jobs?')) {
      const cursor = new URL(path, 'http://reports.local').searchParams.get('cursor');
      if (cursor !== null)
        return Promise.resolve({
          data: options.historyJobs ?? [job('EXPIRED', null, 'job-history')],
          page: { nextCursor: null, hasMore: false },
        });

      const jobs = options.jobsByOrganization?.[organizationId] ?? options.jobs ?? [];
      return Promise.resolve({
        data: jobs,
        page: {
          nextCursor: options.cursor ?? null,
          hasMore: options.cursor !== undefined,
        },
      });
    }

    if (path.startsWith('/report-jobs/')) return detail(path, organizationId);

    throw new Error(path);
  }) as unknown as OrganizationApiClient['organizationRequest'];

  const organizationDownload = vi.fn().mockResolvedValue(
    new Response(new Blob(['recordedAt,value\r\n'], { type: 'text/csv' }), {
      status: 200,
      headers: { 'content-type': 'text/csv' },
    }),
  );

  return {
    organizationRequest: request,
    organizationDownload,
    __detail: detail,
    __create: create,
    __paths: paths,
  } as OrganizationApiClient & {
    __detail: ReturnType<typeof vi.fn>;
    __create: Deferred<JobEnvelope>;
    __paths: string[];
  };
}

function postCount(current: OrganizationApiClient) {
  return vi
    .mocked(current.organizationRequest)
    .mock.calls.filter(([, , initialization]) => initialization?.method === 'POST').length;
}
