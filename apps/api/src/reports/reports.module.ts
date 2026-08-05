import { Module } from '@nestjs/common';

import { SignedCursorService } from '../common/cursor/signed-cursor.service.js';
import { ObjectStorageModule } from '../object-storage/object-storage.module.js';
import { ReportJobsService } from './report-jobs.service.js';
import { ReportPdfDataService } from './report-pdf-data.service.js';
import { REPORT_QUEUE } from './report-queue.js';
import { ReportQueueService } from './report-queue.service.js';
import { ReportWorkerService } from './report-worker.service.js';
import { TelemetryCsvService } from './telemetry-csv.service.js';

@Module({
  imports: [ObjectStorageModule],
  controllers: [],
  providers: [
    TelemetryCsvService,
    ReportJobsService,
    ReportPdfDataService,
    ReportWorkerService,
    ReportQueueService,
    { provide: REPORT_QUEUE, useExisting: ReportQueueService },
    SignedCursorService,
  ],
  exports: [ReportQueueService, ReportWorkerService],
})
export class ReportsModule {}
