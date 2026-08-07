import { describe, expect, it, vi } from 'vitest';

import { DistributedLockService } from './distributed-lock.service.js';

function subject() {
  return new DistributedLockService();
}

describe('DistributedLockService', () => {
  it('skips work during contention', async () => {
    const service = subject();
    let releaseWork!: () => void;
    const first = service.runWithLock(
      'key',
      1000,
      () => new Promise<void>((resolve) => (releaseWork = resolve)),
    );
    await Promise.resolve();
    const work = vi.fn();
    await expect(service.runWithLock('key', 1000, work)).resolves.toEqual({ acquired: false });
    expect(work).not.toHaveBeenCalled();
    releaseWork();
    await first;
  });

  it('releases the local lock after successful work', async () => {
    const service = subject();
    await expect(service.runWithLock('key', 12_345, async () => 'done')).resolves.toEqual({
      acquired: true,
      value: 'done',
    });
    await expect(service.runWithLock('key', 12_345, async () => 'again')).resolves.toEqual({
      acquired: true,
      value: 'again',
    });
  });

  it('does not release a lock for a stale owner token', () => {
    const service = subject();
    expect(service.release('key', Symbol('stale-owner'))).toBe(false);
  });

  it('releases its lock when work throws', async () => {
    const service = subject();
    await expect(
      service.runWithLock('key', 1000, async () => {
        throw new Error('expected failure');
      }),
    ).rejects.toThrow('expected failure');
    await expect(service.runWithLock('key', 1000, async () => 'recovered')).resolves.toMatchObject({
      acquired: true,
    });
  });
});
