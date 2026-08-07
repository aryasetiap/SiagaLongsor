import { Injectable } from '@nestjs/common';

interface LocalLock {
  readonly token: symbol;
  readonly timeout: NodeJS.Timeout;
}

@Injectable()
export class DistributedLockService {
  private readonly locks = new Map<string, LocalLock>();

  async runWithLock<T>(
    key: string,
    ttlMilliseconds: number,
    work: () => Promise<T>,
  ): Promise<{ readonly acquired: false } | { readonly acquired: true; readonly value: T }> {
    if (this.locks.has(key)) return { acquired: false };
    const token = Symbol(key);
    const timeout = setTimeout(() => this.release(key, token), ttlMilliseconds);
    timeout.unref();
    this.locks.set(key, { token, timeout });

    try {
      return { acquired: true, value: await work() };
    } finally {
      this.release(key, token);
    }
  }

  release(key: string, token: symbol): boolean {
    const lock = this.locks.get(key);
    if (lock?.token !== token) return false;
    clearTimeout(lock.timeout);
    this.locks.delete(key);
    return true;
  }
}
