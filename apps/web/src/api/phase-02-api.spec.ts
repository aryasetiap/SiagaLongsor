import { describe, expect, it, vi } from 'vitest';

import {
  deviceDetailFixture,
  deviceListFixture,
  deviceRegisterFixture,
  monitoringPointFixture,
  monitoringPointListFixture,
  rotateCredentialFixture,
} from '../../test/phase-02-fixtures';
import { ApiClient } from '../auth/api-client';
import {
  disableDevice,
  getDevice,
  listDevices,
  registerDevice,
  rotateDeviceCredential,
  updateDevice,
} from '../devices/devices-api';
import {
  createMonitoringPoint,
  getMonitoringPoint,
  listMonitoringPoints,
  updateMonitoringPoint,
} from '../monitoring-points/monitoring-points-api';

const apiBaseUrl = 'http://api.example.test/api/v1';
const organizationId = monitoringPointFixture.organizationId;

describe('Phase 02 API adapters', () => {
  it('builds MonitoringPoint list query without undefined and preserves false', async () => {
    const fetchMock = createFetchMock([jsonResponse(monitoringPointListFixture)]);
    const client = new ApiClient(apiBaseUrl, fetchMock);

    await expect(
      listMonitoringPoints(client, organizationId, {
        siteId: monitoringPointFixture.siteId,
        isActive: false,
        search: 'lereng utara/timur',
        limit: 25,
        sort: 'name:asc',
      }),
    ).resolves.toEqual(monitoringPointListFixture);

    const [input, init] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(String(input));
    expect(url.pathname).toBe('/api/v1/monitoring-points');
    expect(url.searchParams.get('siteId')).toBe(monitoringPointFixture.siteId);
    expect(url.searchParams.get('isActive')).toBe('false');
    expect(url.searchParams.get('search')).toBe('lereng utara/timur');
    expect(url.searchParams.get('limit')).toBe('25');
    expect(url.searchParams.get('sort')).toBe('name:asc');
    expect(String(input)).not.toContain('undefined');
    expect(new Headers(init?.headers).get('x-organization-id')).toBe(organizationId);
  });

  it('uses correct MonitoringPoint paths, methods, and nullable body fields', async () => {
    const envelope = { data: monitoringPointFixture };
    const fetchMock = createFetchMock([
      jsonResponse(envelope, 201),
      jsonResponse(envelope),
      jsonResponse(envelope),
    ]);
    const client = new ApiClient(apiBaseUrl, fetchMock);

    await createMonitoringPoint(client, organizationId, {
      siteId: monitoringPointFixture.siteId,
      name: monitoringPointFixture.name,
      description: null,
    });
    await getMonitoringPoint(client, organizationId, 'point/with slash');
    await updateMonitoringPoint(client, organizationId, monitoringPointFixture.id, {
      locationDescription: null,
      isActive: false,
    });

    expectRequest(fetchMock, 0, '/monitoring-points', 'POST', {
      siteId: monitoringPointFixture.siteId,
      name: monitoringPointFixture.name,
      description: null,
    });
    expectRequest(fetchMock, 1, '/monitoring-points/point%2Fwith%20slash');
    expectRequest(fetchMock, 2, `/monitoring-points/${monitoringPointFixture.id}`, 'PATCH', {
      locationDescription: null,
      isActive: false,
    });
  });

  it('builds Device list filters and omits unavailable optional values', async () => {
    const fetchMock = createFetchMock([jsonResponse(deviceListFixture)]);
    const client = new ApiClient(apiBaseUrl, fetchMock);

    await listDevices(client, organizationId, {
      monitoringPointId: monitoringPointFixture.id,
      lifecycleStatus: 'DISABLED',
      search: 'sensor #1',
      cursor: 'opaque+cursor',
      sort: 'lastSeenAt:desc',
    });

    const [input] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(String(input));
    expect(url.pathname).toBe('/api/v1/devices');
    expect(url.searchParams.get('siteId')).toBeNull();
    expect(url.searchParams.get('monitoringPointId')).toBe(monitoringPointFixture.id);
    expect(url.searchParams.get('lifecycleStatus')).toBe('DISABLED');
    expect(url.searchParams.get('search')).toBe('sensor #1');
    expect(url.searchParams.get('cursor')).toBe('opaque+cursor');
    expect(String(input)).not.toContain('undefined');
  });

  it('uses correct Device paths, methods, bodies, and response types', async () => {
    const fetchMock = createFetchMock([
      jsonResponse(deviceRegisterFixture, 201),
      jsonResponse(deviceDetailFixture),
      jsonResponse(deviceDetailFixture),
      jsonResponse(rotateCredentialFixture),
      jsonResponse(deviceDetailFixture),
    ]);
    const client = new ApiClient(apiBaseUrl, fetchMock);

    const registered = await registerDevice(client, organizationId, {
      hardwareId: deviceDetailFixture.data.hardwareId,
      displayName: deviceDetailFixture.data.displayName,
      monitoringPointId: deviceDetailFixture.data.monitoringPointId,
    });
    await getDevice(client, organizationId, 'device/with slash');
    await updateDevice(client, organizationId, deviceDetailFixture.data.id, {
      displayName: 'Nama baru',
    });
    const rotated = await rotateDeviceCredential(
      client,
      organizationId,
      deviceDetailFixture.data.id,
    );
    await disableDevice(client, organizationId, deviceDetailFixture.data.id);

    expect(registered.data.credential.displayOnce).toBe(true);
    expect(rotated.data.credential.displayOnce).toBe(true);
    expectRequest(fetchMock, 0, '/devices', 'POST', {
      hardwareId: deviceDetailFixture.data.hardwareId,
      displayName: deviceDetailFixture.data.displayName,
      monitoringPointId: deviceDetailFixture.data.monitoringPointId,
    });
    expectRequest(fetchMock, 1, '/devices/device%2Fwith%20slash');
    expectRequest(fetchMock, 2, `/devices/${deviceDetailFixture.data.id}`, 'PATCH', {
      displayName: 'Nama baru',
    });
    expectRequest(
      fetchMock,
      3,
      `/devices/${deviceDetailFixture.data.id}/rotate-credential`,
      'POST',
    );
    expectRequest(fetchMock, 4, `/devices/${deviceDetailFixture.data.id}/disable`, 'POST');
  });

  it('does not persist or log one-time credentials returned by adapters', async () => {
    const fetchMock = createFetchMock([
      jsonResponse(deviceRegisterFixture, 201),
      jsonResponse(rotateCredentialFixture),
    ]);
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const client = new ApiClient(apiBaseUrl, fetchMock);

    await registerDevice(client, organizationId, {
      hardwareId: deviceDetailFixture.data.hardwareId,
      displayName: deviceDetailFixture.data.displayName,
      monitoringPointId: deviceDetailFixture.data.monitoringPointId,
    });
    await rotateDeviceCredential(client, organizationId, deviceDetailFixture.data.id);

    expect(storageSpy).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
    expect(window.localStorage).toHaveLength(0);
    expect(window.sessionStorage).toHaveLength(0);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createFetchMock(responses: Response[]) {
  const queue = [...responses];
  return vi.fn<typeof fetch>(async () => {
    const response = queue.shift();
    if (response === undefined) throw new Error('No mock response configured.');
    return response;
  });
}

function expectRequest(
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>,
  index: number,
  path: string,
  method?: string,
  body?: object,
): void {
  const [input, init] = fetchMock.mock.calls[index] ?? [];
  expect(String(input)).toBe(`${apiBaseUrl}${path}`);
  expect(init?.method).toBe(method);
  expect(new Headers(init?.headers).get('x-organization-id')).toBe(organizationId);
  if (body !== undefined) {
    expect(init?.body).toBe(JSON.stringify(body));
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
  }
}
