export interface PublicWebConfig {
  readonly apiBaseUrl: string;
  readonly presentationMode: boolean;
}

export class PublicWebConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicWebConfigError';
  }
}

export function readPublicWebConfig(): PublicWebConfig {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (apiBaseUrl === undefined || apiBaseUrl.trim().length === 0) {
    throw new PublicWebConfigError('NEXT_PUBLIC_API_BASE_URL wajib dikonfigurasi.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(apiBaseUrl.trim());
  } catch {
    throw new PublicWebConfigError('NEXT_PUBLIC_API_BASE_URL harus berupa URL absolut yang valid.');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new PublicWebConfigError(
      'NEXT_PUBLIC_API_BASE_URL harus menggunakan protokol HTTP atau HTTPS.',
    );
  }

  parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '');

  return {
    apiBaseUrl: parsedUrl.href.replace(/\/$/, ''),
    presentationMode: process.env.NEXT_PUBLIC_PRESENTATION_MODE === 'true',
  };
}

export function publicConfigErrorMessage(error: unknown): string {
  if (process.env.NODE_ENV !== 'production' && error instanceof PublicWebConfigError) {
    return `Konfigurasi frontend belum lengkap: ${error.message}`;
  }

  return 'Konfigurasi layanan autentikasi tidak tersedia.';
}
