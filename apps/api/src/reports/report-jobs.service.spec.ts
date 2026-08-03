import { describe, expect, it, vi } from 'vitest';

import { Role, ReportType } from '../generated/prisma/enums.js';
import { ReportJobsService } from './report-jobs.service.js';

describe('ReportJobsService DB/queue consistency', () => {
  it('marks the committed durable row FAILED when post-commit enqueue fails', async () => {
    const transaction = {
      site: { findFirst: vi.fn().mockResolvedValue({ id: 'site-1' }) },
      reportJob: { create: vi.fn().mockResolvedValue({ id: 'report-1' }) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      $transaction: vi.fn(async (callback: (value: typeof transaction) => unknown) =>
        callback(transaction),
      ),
      reportJob: { updateMany },
    };
    const queue = { enqueue: vi.fn().mockRejectedValue(new Error('redis internal detail')) };
    const service = new ReportJobsService(prisma as never, {} as never, queue, {} as never);
    await expect(
      service.create(
        { organizationId: 'org-1', organizationName: 'Org', role: Role.PROJECT_OWNER },
        {
          userId: 'user-1',
          sessionId: 'session-1',
          email: 'owner@example.invalid',
          name: 'Owner',
          memberships: [],
        },
        {
          reportType: ReportType.SITE_PERIOD_SUMMARY_PDF,
          siteId: 'site-1',
          from: '2026-07-01T00:00:00.000Z',
          to: '2026-08-01T00:00:00.000Z',
        },
        { requestId: 'request-1', ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ status: 500 });
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'report-1', status: 'QUEUED' }),
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });
});
