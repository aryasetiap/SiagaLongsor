export interface SiteResponseData {
  readonly id: string;
  readonly name: string;
  readonly address: string | null;
  readonly timezone: string;
}

export interface SiteListResponse {
  readonly data: SiteResponseData[];
  readonly page: {
    readonly nextCursor: string | null;
    readonly hasMore: boolean;
  };
}
