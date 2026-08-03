export const REPORT_QUEUE = Symbol('REPORT_QUEUE');

export interface ReportQueue {
  enqueue(reportJobId: string): Promise<void>;
}
