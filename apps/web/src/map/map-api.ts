import type { DataEnvelope, ListEnvelope, OrganizationApiClient } from '../api/contracts';
import { appendQuery } from '../api/query-string';
import type { MapConfiguration, MapOverview, SopDocument } from './map-contracts';

export const getMapOverview = (
  client: OrganizationApiClient,
  organizationId: string,
  siteId: string,
) =>
  client.organizationRequest<DataEnvelope<MapOverview>>(
    appendQuery('/map/overview', { siteId }),
    organizationId,
  );
export const getMapConfiguration = (
  client: OrganizationApiClient,
  organizationId: string,
  siteId: string,
) =>
  client.organizationRequest<DataEnvelope<MapConfiguration>>(
    `/sites/${encodeURIComponent(siteId)}/map-config`,
    organizationId,
  );
export const putMapConfiguration = (
  client: OrganizationApiClient,
  organizationId: string,
  siteId: string,
  input: Omit<
    MapConfiguration,
    'id' | 'siteId' | 'version' | 'createdAt' | 'activatedAt' | 'createdBy'
  > & { expectedVersion: number | null },
) =>
  client.organizationRequest<{ data: MapConfiguration; changed: boolean }>(
    `/sites/${encodeURIComponent(siteId)}/map-config`,
    organizationId,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
  );
export const getActiveSop = (
  client: OrganizationApiClient,
  organizationId: string,
  siteId: string,
) =>
  client.organizationRequest<DataEnvelope<SopDocument>>(
    `/sites/${encodeURIComponent(siteId)}/sop`,
    organizationId,
  );
export const listSopVersions = (
  client: OrganizationApiClient,
  organizationId: string,
  siteId: string,
  cursor?: string,
) =>
  client.organizationRequest<ListEnvelope<SopDocument>>(
    appendQuery(`/sites/${encodeURIComponent(siteId)}/sop/versions`, { limit: 25, cursor }),
    organizationId,
  );
export async function uploadSop(
  client: OrganizationApiClient,
  organizationId: string,
  siteId: string,
  file: File,
): Promise<DataEnvelope<SopDocument>> {
  const form = new FormData();
  form.set('title', 'SOP Resmi');
  form.set('file', file);
  return client.organizationRequest(`/sites/${encodeURIComponent(siteId)}/sop`, organizationId, {
    method: 'POST',
    body: form,
  });
}
export async function downloadSop(
  client: OrganizationApiClient,
  organizationId: string,
  sopDocument: SopDocument,
): Promise<void> {
  if (client.organizationDownload === undefined)
    throw new Error('Authenticated download is unavailable.');
  const response = await client.organizationDownload(
    `/sop-documents/${encodeURIComponent(sopDocument.id)}/content`,
    organizationId,
  );
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = globalThis.document.createElement('a');
  link.href = url;
  link.download = sopDocument.originalFileName;
  globalThis.document.body.append(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}
