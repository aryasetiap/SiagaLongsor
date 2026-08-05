import { describe, expect, it } from 'vitest';

import { evaluateConnectivity } from './connectivity-policy.js';

const receivedAt = new Date('2026-08-01T00:00:00.000Z');

describe('evaluateConnectivity', () => {
  it.each([
    [20, 'ONLINE'],
    [21, 'DELAYED'],
    [35, 'DELAYED'],
    [36, 'OFFLINE'],
  ] as const)('classifies age %s minutes as %s', (minutes, status) => {
    const result = evaluateConnectivity({
      lifecycleStatus: 'ENABLED',
      serverReceivedAt: receivedAt,
      evaluationTime: new Date(receivedAt.getTime() + minutes * 60_000),
      onlineWithinMinutes: 20,
      offlineAfterMinutes: 35,
    });
    expect(result.status).toBe(status);
  });

  it('keeps a disabled Device UNKNOWN', () => {
    expect(
      evaluateConnectivity({
        lifecycleStatus: 'DISABLED',
        serverReceivedAt: receivedAt,
        evaluationTime: new Date(receivedAt.getTime() + 60 * 60_000),
        onlineWithinMinutes: 20,
        offlineAfterMinutes: 35,
      }),
    ).toMatchObject({ status: 'UNKNOWN', reason: 'DEVICE_DISABLED' });
  });

  it('keeps an enabled Device without telemetry UNKNOWN', () => {
    expect(
      evaluateConnectivity({
        lifecycleStatus: 'ENABLED',
        serverReceivedAt: null,
        evaluationTime: receivedAt,
        onlineWithinMinutes: 20,
        offlineAfterMinutes: 35,
      }),
    ).toEqual({ status: 'UNKNOWN', reason: null });
  });
});
