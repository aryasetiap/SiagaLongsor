import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import type { ObjectStorageService, PutObjectInput, StoredObject } from './object-storage.js';

@Injectable()
export class S3ObjectStorageService implements ObjectStorageService {
  private readonly client: S3Client | null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    const storage = config.objectStorage;
    this.client =
      storage === null
        ? null
        : new S3Client({
            endpoint: storage.endpoint,
            region: storage.region,
            forcePathStyle: storage.forcePathStyle,
            credentials: {
              accessKeyId: storage.accessKeyId,
              secretAccessKey: storage.secretAccessKey,
            },
          });
  }

  async put(input: PutObjectInput): Promise<void> {
    const { client, bucket } = this.configuration();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ChecksumSHA256: Buffer.from(input.sha256, 'hex').toString('base64'),
      }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    const { client, bucket } = this.configuration();
    try {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (result.Body === undefined) return null;
      return {
        body: Buffer.from(await result.Body.transformToByteArray()),
        contentType: result.ContentType ?? null,
      };
    } catch (error) {
      if (error instanceof NoSuchKey || objectNotFound(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const { client, bucket } = this.configuration();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  private configuration(): { client: S3Client; bucket: string } {
    if (this.client === null || this.config.objectStorage === null) {
      throw new ServiceUnavailableException({
        code: 'OBJECT_STORAGE_UNAVAILABLE',
        message: 'Penyimpanan dokumen sedang tidak tersedia.',
      });
    }
    return { client: this.client, bucket: this.config.objectStorage.bucket };
  }
}

function objectNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    '$metadata' in error &&
    typeof error.$metadata === 'object' &&
    error.$metadata !== null &&
    'httpStatusCode' in error.$metadata &&
    error.$metadata.httpStatusCode === 404
  );
}
