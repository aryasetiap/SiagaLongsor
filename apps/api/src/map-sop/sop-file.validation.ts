import { createHash, randomUUID } from 'node:crypto';
import { basename } from 'node:path';

import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import type { UploadedPdfFile } from './dto/map-sop.dto.js';

export const MAX_SOP_BYTES = 10 * 1024 * 1024;

export interface PreparedPdfUpload {
  readonly bytes: Buffer;
  readonly originalFileName: string;
  readonly mediaType: 'application/pdf';
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly objectKey: string;
}

export function preparePdfUpload(file: UploadedPdfFile | undefined): PreparedPdfUpload {
  if (file === undefined || file.size === 0 || file.buffer.length === 0) {
    throw invalidFile('File PDF wajib diisi dan tidak boleh kosong.');
  }
  if (file.size > MAX_SOP_BYTES || file.buffer.length > MAX_SOP_BYTES) {
    throw new PayloadTooLargeException({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Ukuran file PDF melebihi 10 MiB.',
    });
  }
  if (file.mimetype.toLowerCase() !== 'application/pdf') {
    throw new UnsupportedMediaTypeException({
      code: 'FILE_VALIDATION_FAILED',
      message: 'Hanya file PDF yang dapat diunggah.',
    });
  }
  const originalFileName = sanitizePdfFilename(file.originalname);
  if (!file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-', 'ascii'))) {
    throw invalidFile('Signature file tidak sesuai format PDF.');
  }
  return {
    bytes: file.buffer,
    originalFileName,
    mediaType: 'application/pdf',
    sizeBytes: file.buffer.length,
    sha256: createHash('sha256').update(file.buffer).digest('hex'),
    objectKey: `sop/${randomUUID()}`,
  };
}

export function sanitizePdfFilename(candidate: string): string {
  const leaf = basename(candidate.replaceAll('\\', '/'));
  if (!/[.]pdf$/i.test(leaf)) {
    throw invalidFile('Nama file harus menggunakan ekstensi .pdf.');
  }
  const sanitized = leaf
    .normalize('NFKC')
    .replaceAll(/[^A-Za-z0-9._ -]/g, '_')
    .replaceAll(/\s+/g, ' ')
    .slice(0, 255);
  if (sanitized.length < 5 || !/[.]pdf$/i.test(sanitized)) {
    throw invalidFile('Nama file PDF tidak valid.');
  }
  return sanitized;
}

export function safeContentDisposition(filename: string): string {
  const safe = sanitizePdfFilename(filename).replaceAll(/["\r\n]/g, '_');
  return `inline; filename="${safe}"`;
}

function invalidFile(message: string): BadRequestException {
  return new BadRequestException({ code: 'FILE_VALIDATION_FAILED', message });
}
