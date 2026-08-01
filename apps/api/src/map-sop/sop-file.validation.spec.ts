import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { UploadedPdfFile } from './dto/map-sop.dto.js';
import {
  MAX_SOP_BYTES,
  preparePdfUpload,
  safeContentDisposition,
  sanitizePdfFilename,
} from './sop-file.validation.js';

describe('SOP PDF file validation', () => {
  it('validates a PDF, hashes bytes, and generates an opaque key', () => {
    const file = pdf();
    const prepared = preparePdfUpload(file);
    expect(prepared.sha256).toBe(createHash('sha256').update(file.buffer).digest('hex'));
    expect(prepared.objectKey).toMatch(/^sop\/[0-9a-f-]{36}$/);
    expect(prepared.objectKey).not.toContain(file.originalname);
  });

  it('sanitizes path and unsafe filename characters', () => {
    expect(sanitizePdfFilename('../SOP<script>.pdf')).toBe('SOP_script_.pdf');
  });

  it('rejects a non-PDF MIME type', () => {
    expect(() => preparePdfUpload(pdf({ mimetype: 'text/html' }))).toThrow();
  });

  it('rejects a non-PDF extension', () => {
    expect(() => preparePdfUpload(pdf({ originalname: 'sop.txt' }))).toThrow();
  });

  it('rejects a spoofed PDF without magic signature', () => {
    expect(() => preparePdfUpload(pdf({ buffer: Buffer.from('not a pdf'), size: 9 }))).toThrow();
  });

  it('rejects an empty file', () => {
    expect(() => preparePdfUpload(pdf({ buffer: Buffer.alloc(0), size: 0 }))).toThrow();
  });

  it('rejects a file over 10 MiB', () => {
    expect(() =>
      preparePdfUpload(pdf({ buffer: Buffer.alloc(MAX_SOP_BYTES + 1), size: MAX_SOP_BYTES + 1 })),
    ).toThrow();
  });

  it('builds Content-Disposition without CRLF or unsafe quotes', () => {
    const disposition = safeContentDisposition('sop\r\n"unsafe".pdf');
    expect(disposition).toBe('inline; filename="sop___unsafe_.pdf"');
    expect(disposition).not.toMatch(/[\r\n]/);
  });
});

function pdf(overrides: Partial<UploadedPdfFile> = {}): UploadedPdfFile {
  const buffer = Buffer.from('%PDF-1.7\nexample', 'ascii');
  return {
    originalname: 'sop-resmi.pdf',
    mimetype: 'application/pdf',
    size: buffer.length,
    buffer,
    ...overrides,
  };
}
