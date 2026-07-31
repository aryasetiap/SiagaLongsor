export interface DataEnvelope<T> {
  readonly data: T;
}

export interface PageInfo {
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface ListEnvelope<T> {
  readonly data: readonly T[];
  readonly page: PageInfo;
}

export interface ValidationDetail {
  readonly field: string;
  readonly messages: readonly string[];
}

export interface ApiErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: readonly ValidationDetail[];
  };
  readonly requestId: string;
  readonly timestamp: string;
}

export interface CursorQuery {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface OrganizationApiClient {
  organizationRequest<T>(path: string, organizationId: string, init?: RequestInit): Promise<T>;
}
