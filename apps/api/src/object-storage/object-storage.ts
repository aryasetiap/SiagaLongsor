export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface PutObjectInput {
  readonly key: string;
  readonly body: Buffer;
  readonly contentType: 'application/pdf';
  readonly sha256: string;
}

export interface StoredObject {
  readonly body: Buffer;
  readonly contentType: string | null;
}

export interface ObjectStorageService {
  put(input: PutObjectInput): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}
