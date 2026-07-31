import type { CursorQuery } from '../api/contracts';

export type SiteSort = 'name:asc' | 'name:desc' | 'createdAt:desc';

export interface Site {
  readonly id: string;
  readonly name: string;
  readonly address: string | null;
  readonly timezone: string;
}

export interface SiteListQuery extends CursorQuery {
  readonly search?: string;
  readonly sort?: SiteSort;
}
