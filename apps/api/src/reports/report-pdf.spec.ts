import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { generateSitePeriodSummaryPdf, type ReportPdfInput } from './report-pdf.js';
import { reportPdfFilename } from './report-worker.service.js';

describe('report PDF generation', () => {
  it('creates a valid multi-section application/pdf document', async () => {
    const bytes = await generateSitePeriodSummaryPdf(input());
    expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBeGreaterThan(0);
  });

  it('renders missing persisted values without fabricating zero', async () => {
    const bytes = await generateSitePeriodSummaryPdf(input());
    expect(bytes.length).toBeGreaterThan(500);
    expect(input().telemetry.averageRainfallMmHour).toBeNull();
  });

  it('preserves an UNKNOWN summary bucket', () => {
    expect(input().riskCounts.UNKNOWN).toBe(2);
    expect(input().riskCounts.SAFE).toBe(0);
  });

  it('does not accept or represent historical CurrentMonitoringPointState', () => {
    expect(input()).not.toHaveProperty('currentStateHistory');
  });

  it('sanitizes the PDF filename', () => {
    const name = reportPdfFilename(
      '../Site\r\nUnsafe',
      new Date('2026-07-01T00:00:00Z'),
      new Date('2026-08-01T00:00:00Z'),
    );
    expect(name).toMatch(/^laporan-[a-z0-9-]+-2026-07-01-2026-08-01[.]pdf$/);
    expect(name).not.toMatch(/[\r\n/\\]/);
  });
});

function input(): ReportPdfInput {
  return {
    siteName: 'Site A',
    siteTimezone: 'Asia/Jakarta',
    from: new Date('2026-07-01T00:00:00.000Z'),
    to: new Date('2026-08-01T00:00:00.000Z'),
    generatedAt: new Date('2026-08-01T05:00:10.000Z'),
    createdByName: 'Project Owner',
    telemetry: {
      count: 3,
      averageTiltMagnitudeDeg: '4.5',
      averageSoilMoisturePct: null,
      averageRainfallMmHour: null,
      averageBatteryVoltage: '12.4',
    },
    riskCounts: { SAFE: 0, WATCH: 1, DANGER: 0, UNKNOWN: 2 },
    alertCounts: { ACTIVE: 1, ACKNOWLEDGED: 0, RESOLVED: 0, FALSE_ALARM: 0 },
  };
}
