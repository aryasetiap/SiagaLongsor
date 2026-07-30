import { describe, expect, it } from 'vitest';

import { RefreshTokenService } from './refresh-token.service.js';

describe('RefreshTokenService', () => {
  const service = new RefreshTokenService();

  it('creates an opaque 256-bit token and a deterministic SHA-256 hash', () => {
    const first = service.create();
    const second = service.create();

    expect(first.raw).not.toBe(second.raw);
    expect(Buffer.from(first.raw, 'base64url')).toHaveLength(32);
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(service.hash(first.raw)).toBe(first.hash);
    expect(first.hash).not.toContain(first.raw);
  });
});
