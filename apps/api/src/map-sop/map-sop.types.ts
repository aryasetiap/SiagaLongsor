import type {
  AlertSeverity,
  AlertType,
  ConnectivityStatus,
  RiskLevel,
} from '../generated/prisma/enums.js';

export type GeoJsonPosition = readonly [number, number];

export interface MapConfigurationData {
  readonly center: { readonly position: GeoJsonPosition; readonly zoom: number } | null;
  readonly monitoringPointLocations: readonly {
    readonly monitoringPointId: string;
    readonly position: GeoJsonPosition;
  }[];
  readonly riskZones: readonly {
    readonly featureId: string;
    readonly name: string;
    readonly description: string | null;
    readonly geometry: {
      readonly type: 'Polygon';
      readonly coordinates: readonly (readonly GeoJsonPosition[])[];
    };
  }[];
  readonly evacuationRoutes: readonly {
    readonly featureId: string;
    readonly name: string;
    readonly description: string | null;
    readonly destinationLabel: string | null;
    readonly geometry: {
      readonly type: 'LineString';
      readonly coordinates: readonly GeoJsonPosition[];
    };
  }[];
  readonly notes: string | null;
}

export interface MapConfigurationResponseData extends MapConfigurationData {
  readonly id: string;
  readonly siteId: string;
  readonly version: number;
  readonly createdAt: string;
  readonly activatedAt: string;
  readonly createdBy: { readonly id: string; readonly name: string };
}

export interface MapConfigurationResponse {
  readonly data: MapConfigurationResponseData;
}

export interface MapConfigurationMutationResponse extends MapConfigurationResponse {
  readonly changed: boolean;
}

export interface MapOverviewResponse {
  readonly data: {
    readonly generatedAt: string;
    readonly site: { readonly id: string; readonly name: string; readonly timezone: string };
    readonly configuration: {
      readonly configured: boolean;
      readonly version: number | null;
      readonly center: MapConfigurationData['center'];
      readonly riskZones: MapConfigurationData['riskZones'];
      readonly evacuationRoutes: MapConfigurationData['evacuationRoutes'];
    };
    readonly markers: readonly MapMarker[];
    readonly sop: {
      readonly available: boolean;
      readonly documentId: string | null;
      readonly version: number | null;
      readonly title: string | null;
    };
  };
}

interface MapMarker {
  readonly monitoringPoint: {
    readonly id: string;
    readonly name: string;
    readonly locationDescription: string | null;
    readonly isActive: boolean;
  };
  readonly position: GeoJsonPosition;
  readonly currentState: {
    readonly monitoringPointId: string;
    readonly deviceId: string | null;
    readonly serverRisk: RiskLevel;
    readonly connectivityStatus: ConnectivityStatus;
    readonly reasons: readonly string[];
    readonly latestTelemetryId: string | null;
    readonly evaluatedAt: string;
    readonly lastTelemetryAt: string | null;
    readonly profileId: string | null;
    readonly profileVersion: number | null;
    readonly activeAlertSummary: {
      readonly count: number;
      readonly highestSeverity: AlertSeverity | null;
      readonly types: readonly AlertType[];
    };
  } | null;
}

export interface SopDocumentData {
  readonly id: string;
  readonly siteId: string;
  readonly version: number;
  readonly title: string;
  readonly description: string | null;
  readonly originalFileName: string;
  readonly mediaType: 'application/pdf';
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly uploadedBy: { readonly id: string; readonly name: string };
  readonly uploadedAt: string;
  readonly isActive: boolean;
}

export interface SopDocumentResponse {
  readonly data: SopDocumentData;
}

export interface SopDocumentListResponse {
  readonly data: readonly SopDocumentData[];
  readonly page: { readonly nextCursor: string | null; readonly hasMore: boolean };
}
