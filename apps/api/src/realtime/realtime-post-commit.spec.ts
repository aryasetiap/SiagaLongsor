import { describe, expect, it, vi } from 'vitest';

import { AlertLifecyclePostCommit } from '../alerts/alert-lifecycle-post-commit.js';
import { RealtimePostCommitService } from './realtime-post-commit.service.js';
import type { RealtimeRedisService } from './realtime-redis.service.js';

describe('realtime post-commit boundary', () => {
  it.each(['ALERT_ACKNOWLEDGED', 'ALERT_RESOLVED', 'ALERT_FALSE_ALARM'] as const)(
    'maps lifecycle %s to the frozen realtime descriptor',
    async (eventType) => {
      const dispatch = vi.fn().mockResolvedValue(undefined);
      const lifecycle = new AlertLifecyclePostCommit({
        dispatch,
      } as unknown as RealtimePostCommitService);
      const descriptor = {
        eventType,
        occurredAt: '2026-08-01T10:00:00.000Z',
        organizationId: 'org-1',
        siteId: 'site-1',
        monitoringPointId: 'point-1',
        alertId: 'alert-1',
      };

      await lifecycle.dispatch(descriptor);

      expect(dispatch).toHaveBeenCalledWith([descriptor]);
    },
  );

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
