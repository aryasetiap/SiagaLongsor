import { describe, expect, it, vi } from 'vitest';

import { RealtimePostCommitService } from './realtime-post-commit.service.js';
import type { RealtimeRedisService } from './realtime-redis.service.js';

describe('realtime post-commit boundary', () => {
  it('swallows Redis publication failure after the database commit boundary', async () => {
    const publish = vi.fn().mockRejectedValue(new Error('redis unavailable'));
    const service = new RealtimePostCommitService({ publish } as unknown as RealtimeRedisService);

    await expect(
      service.dispatch([
        {
          eventType: 'ALERT_CREATED',
          occurredAt: '2026-08-01T10:00:00.000Z',
          organizationId: 'org-1',
          siteId: 'site-1',
          monitoringPointId: 'point-1',
          alertId: 'alert-1',
        },
      ]),
    ).resolves.toBeUndefined();
    expect(publish).toHaveBeenCalledOnce();
  });
});
