import type { ConnectivityStatus, RiskLevel, SafeActorSummary } from '../risk/risk-contracts';

export type Position = readonly [number, number];
export interface MapConfiguration {
  readonly id: string;
  readonly siteId: string;
  readonly version: number;
  readonly center: { readonly position: Position; readonly zoom: number } | null;
  readonly monitoringPointLocations: readonly {
    readonly monitoringPointId: string;
    readonly position: Position;
  }[];
  readonly riskZones: readonly MapFeature<'Polygon'>[];
  readonly evacuationRoutes: readonly MapFeature<'LineString'>[];
  readonly notes: string | null;
  readonly createdAt: string;
  readonly activatedAt: string;
  readonly createdBy: SafeActorSummary;
}
export interface MapFeature<T extends 'Polygon' | 'LineString'> {
  readonly featureId: string;
  readonly name: string;
  readonly description: string | null;
  readonly destinationLabel?: string | null;
  readonly geometry: {
    readonly type: T;
    readonly coordinates: T extends 'Polygon'
      ? readonly (readonly Position[])[]
      : readonly Position[];
  };
}
export interface MapOverview {
  readonly generatedAt: string;
  readonly site: { readonly id: string; readonly name: string; readonly timezone: string };
  readonly configuration: Pick<MapConfiguration, 'center' | 'riskZones' | 'evacuationRoutes'> & {
    readonly configured: boolean;
    readonly version: number | null;
  };
  readonly markers: readonly {
    readonly monitoringPoint: {
      readonly id: string;
      readonly name: string;
      readonly locationDescription: string | null;
      readonly isActive: boolean;
    };
    readonly position: Position;
    readonly currentState: {
      readonly serverRisk: RiskLevel;
      readonly connectivityStatus: ConnectivityStatus;
      readonly evaluatedAt: string;
      readonly lastTelemetryAt: string | null;
    } | null;
  }[];
  readonly sop: {
    readonly available: boolean;
    readonly documentId: string | null;
    readonly version: number | null;
    readonly title: string | null;
  };
}
export interface SopDocument {
  readonly id: string;
  readonly siteId: string;
  readonly version: number;
  readonly title: string;
  readonly description: string | null;
  readonly originalFileName: string;
  readonly mediaType: 'application/pdf';
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly uploadedBy: SafeActorSummary;
  readonly uploadedAt: string;
  readonly isActive: boolean;
}
