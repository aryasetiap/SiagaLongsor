import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../database/prisma.service.js';
import { ReportFailureCode, ReportJobStatus, ReportType } from '../generated/prisma/enums.js';
import type { ObjectStorageService } from '../object-storage/object-storage.js';
import type { ReportPdfDataService } from './report-pdf-data.service.js';
import type { ReportPdfInput } from './report-pdf.js';
import { ReportWorkerService } from './report-worker.service.js';

describe('ReportWorkerService', () => {
  it('treats 20 already-SUCCEEDED duplicate deliveries as no-ops', async () => {
    const { service, storage, data } = harness({ status: ReportJobStatus.SUCCEEDED });
    await Promise.all(Array.from({ length: 20 }, () => service.process('job-1')));
    expect(data.load).not.toHaveBeenCalled();
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('allows only one of 20 concurrent workers to create the success artifact', async () => {
    let claimed = false;
    const updateMany = vi.fn(async (args: { data: { status?: ReportJobStatus } }) => {
      if (args.data.status === ReportJobStatus.PROCESSING) {
        if (claimed) return { count: 0 };
        claimed = true;
        return { count: 1 };
      }
      return { count: 1 };
    });
    const { service, storage } = harness({ status: ReportJobStatus.QUEUED, updateMany });
    await Promise.all(Array.from({ length: 20 }, () => service.process('job-1')));
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('persists a sanitized terminal failure after retry exhaustion', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const { service } = harness({ status: ReportJobStatus.QUEUED, updateMany });
    await service.failAfterExhaustion('job-1', new Error('redis://secret@internal SQL path'));
    const mutation = updateMany.mock.calls[0]?.[0] as {
      data: { failureCode: ReportFailureCode; failureMessage: string };
    };
    expect(mutation.data.failureCode).toBe(ReportFailureCode.REPORT_GENERATION_FAILED);
    expect(mutation.data.failureMessage).not.toMatch(/redis|secret|sql|path/i);
  });

  it('deletes an uploaded artifact when durable success finalization fails', async () => {
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(new Error('forced DB finalization failure'))
      .mockResolvedValueOnce({ count: 1 });
    const { service, storage } = harness({ status: ReportJobStatus.QUEUED, updateMany });
    await expect(service.process('job-1')).rejects.toThrow('Laporan tidak dapat dibuat');
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledTimes(1);
  });

  it('recovers from a transient artifact failure in 20 independent retry iterations', async () => {
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const { service, storage } = harness({ status: ReportJobStatus.QUEUED });
      storage.put.mockRejectedValueOnce(new Error('transient provider detail'));
      await expect(service.process(`job-${iteration}`)).rejects.toThrow(
        'Artefak laporan tidak dapat disimpan',
      );
      await expect(service.process(`job-${iteration}`)).resolves.toBeUndefined();
      expect(storage.put).toHaveBeenCalledTimes(2);
    }
  });
});

function harness(options: { status: ReportJobStatus; updateMany?: ReturnType<typeof vi.fn> }) {
  const updateMany = options.updateMany ?? vi.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    reportJob: {
      findUnique: vi.fn().mockResolvedValue({ status: options.status, startedAt: null }),
      updateMany,
      findFirstOrThrow: vi.fn().mockResolvedValue({
        id: 'job-1',
        organizationId: 'org-1',
        siteId: 'site-1',
        reportType: ReportType.SITE_PERIOD_SUMMARY_PDF,
        from: new Date('2026-07-01T00:00:00.000Z'),
        to: new Date('2026-08-01T00:00:00.000Z'),
        site: { name: 'Site A', timezone: 'Asia/Jakarta' },
        createdBy: { name: 'Project Owner' },
      }),
    },
  } as unknown as PrismaService;
  const data = {
    load: vi.fn().mockResolvedValue(pdfInput()),
  } as unknown as ReportPdfDataService & {
    load: ReturnType<typeof vi.fn>;
  };
  const storage = {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
  } satisfies ObjectStorageService;
  return {
    service: new ReportWorkerService(prisma, data, storage),
    data,
    storage,
  };
}

function pdfInput(): ReportPdfInput {
  return {
    siteName: 'Site A',
    siteTimezone: 'Asia/Jakarta',
    from: new Date('2026-07-01T00:00:00.000Z'),
    to: new Date('2026-08-01T00:00:00.000Z'),
    generatedAt: new Date('2026-08-01T05:00:00.000Z'),
    createdByName: 'Project Owner',
    telemetry: {
      count: 0,
      averageTiltMagnitudeDeg: null,
      averageSoilMoisturePct: null,
      averageRainfallMmHour: null,
      averageBatteryVoltage: null,
    },
    riskCounts: { SAFE: 0, WATCH: 0, DANGER: 0, UNKNOWN: 0 },
    alertCounts: { ACTIVE: 0, ACKNOWLEDGED: 0, RESOLVED: 0, FALSE_ALARM: 0 },
  };
}
