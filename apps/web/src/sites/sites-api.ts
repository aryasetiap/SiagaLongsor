import type { ListEnvelope, OrganizationApiClient } from '../api/contracts';
import { appendQuery } from '../api/query-string';
import type { Site, SiteListQuery } from './site-contracts';

export function listSites(
  client: OrganizationApiClient,
  organizationId: string,
  query: SiteListQuery = {},
): Promise<ListEnvelope<Site>> {
  return client.organizationRequest<ListEnvelope<Site>>(
    appendQuery('/sites', {
      search: query.search,
      cursor: query.cursor,
      limit: query.limit,
      sort: query.sort,
    }),
    organizationId,
  );
}
