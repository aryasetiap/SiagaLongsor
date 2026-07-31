import { describe, expect, it, vi } from 'vitest';

import type { RedisService } from '../redis/redis.service.js';
import { DistributedLockService } from './distributed-lock.service.js';

function subject(setResult: 'OK' | null = 'OK', evalResult = 1) {
  const client = {
    set: vi.fn().mockResolvedValue(setResult),
    eval: vi.fn().mockResolvedValue(evalResult),
  };
  const service = new DistributedLockService({ client } as unknown as RedisService);
  return { client, service };
}

describe('DistributedLockService', () => {
  it('skips work during contention', async () => {
    const { client, service } = subject(null);
    const work = vi.fn();
    await expect(service.runWithLock('key', 1000, work)).resolves.toEqual({
      acquired: false,
    });
    expect(work).not.toHaveBeenCalled();
    expect(client.eval).not.toHaveBeenCalled();
  });

  it('uses an expiring NX lock and releases through compare-and-delete', async () => {
    const { client, service } = subject();
    await expect(service.runWithLock('key', 12_345, async () => 'done')).resolves.toEqual({
      acquired: true,
      value: 'done',
    });
    expect(client.set).toHaveBeenCalledWith('key', expect.any(String), 'PX', 12_345, 'NX');
    expect(client.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("GET"'),
      1,
      'key',
      expect.any(String),
    );
  });

  it('does not report release when ownership changed or lock expired', async () => {
    const { service } = subject('OK', 0);
    await expect(service.release('key', 'stale-owner')).resolves.toBe(false);
  });

  it('releases its lock when work throws', async () => {
    const { client, service } = subject();
    await expect(
      service.runWithLock('key', 1000, async () => {
        throw new Error('expected failure');
      }),
    ).rejects.toThrow('expected failure');
    expect(client.eval).toHaveBeenCalledOnce();
  });
});
