import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../config/app-config.js';
import { S3ObjectStorageService } from './s3-object-storage.service.js';

describe('S3ObjectStorageService contract', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses private bucket commands with opaque keys and the byte checksum', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    const storage = new S3ObjectStorageService(config());

    await storage.put({
      key: 'sop/opaque-id',
      body: Buffer.from('pdf'),
      contentType: 'application/pdf',
      sha256: '0'.repeat(64),
    });
    await storage.delete('sop/opaque-id');

    const put = send.mock.calls[0]?.[0];
    const remove = send.mock.calls[1]?.[0];
    expect(put).toBeInstanceOf(PutObjectCommand);
    expect((put as PutObjectCommand).input).toMatchObject({
      Bucket: 'private-documents',
      Key: 'sop/opaque-id',
      ContentType: 'application/pdf',
      ChecksumSHA256: Buffer.alloc(32).toString('base64'),
    });
    expect(remove).toBeInstanceOf(DeleteObjectCommand);
    expect((remove as DeleteObjectCommand).input).toEqual({
      Bucket: 'private-documents',
      Key: 'sop/opaque-id',
    });
  });

  it('returns object bytes and converts provider 404 into a stable missing object', async () => {
    const send = vi
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValueOnce({
        Body: { transformToByteArray: async () => Uint8Array.from([1, 2, 3]) },
        ContentType: 'application/pdf',
      } as never)
      .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
    const storage = new S3ObjectStorageService(config());

    await expect(storage.get('sop/present')).resolves.toEqual({
      body: Buffer.from([1, 2, 3]),
      contentType: 'application/pdf',
    });
    await expect(storage.get('sop/missing')).resolves.toBeNull();
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetObjectCommand);
  });

  it('fails safely when storage configuration is not injected', async () => {
    const storage = new S3ObjectStorageService({ ...config(), objectStorage: null });

    await expect(storage.get('sop/opaque-id')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

function config(): AppConfig {
  return {
    nodeEnv: 'test',
    port: 3001,
    trustProxyHops: 0,
    webUrl: 'http://localhost:3000',
    databaseUrl: 'postgresql://unused',
    redisUrl: 'redis://localhost:6379',
    auth: {
      accessTokenSecret: 'unused-test-secret',
      issuer: 'test',
      audience: 'test',
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 2_592_000,
      refreshCookieName: 'refresh',
      loginRateLimitTtlMs: 60_000,
      loginRateLimitMax: 5,
    },
    telemetry: {
      maxFutureSkewSeconds: 300,
      rateLimitTtlMs: 60_000,
      rateLimitMax: 120,
    },
    objectStorage: {
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      bucket: 'private-documents',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      forcePathStyle: true,
    },
  };
}
