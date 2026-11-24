/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * @ra/contracts — Contratos Canónicos de Dominio y Plataforma (Fase 4 · F4-02)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export interface Vec2 {
  u: number;
  v: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ModuleSpec {
  id: string;
  brand: string;
  model: string;
  wp: number;
  l: number;
  w: number;
  eff?: number;
  voc: number;
  isc: number;
  vmp: number;
  imp: number;
  gammaVoc?: number;
  tempCoeffVoc?: number;
  tempCoeffPmax?: number;
  price?: number;
  weightKg?: number;
  bifacial?: boolean;
  bifacialityFactor?: number;
}

export interface InverterSpec {
  id: string;
  brand: string;
  model: string;
  kw: number;
  phases: 1 | 3;
  mppt: number;
  stringsPerMppt?: number;
  vDcMax: number;
  vMpptMin: number;
  vMpptMax: number;
  iMaxMppt?: number;
  iScMaxMppt?: number;
  eff?: number;
  hybrid?: boolean;
  price?: number;
}

export interface BatterySpec {
  id: string;
  brand: string;
  model: string;
  kwh: number;
  voltage?: number;
  technology?: string;
  efficiency?: number;
  dod?: number;
  price?: number;
}

export interface RoofPolyline {
  id?: string;
  name?: string;
  points: Vec3[];
  planeIdx?: number;
  moduleId?: string;
  structureType?: string;
  orientationPref?: 'portrait' | 'landscape';
  modTilt?: number | 'auto';
  modAzimuth?: number | 'auto';
  panelsDisabled?: boolean;
}

export interface ElectricalSizingResult {
  P_dc_kW: number;
  P_ac_kW: number;
  inv_kW: number;
  invCount: number;
  monofasico: boolean;
  V_ac: number;
  I_ac: number;
  I_ac_design: number;
  numStrings: number;
  modsPerString: number;
  Voc_str_stc: number;
  Voc_str_max: number;
  Vmp_str_hot: number;
  S_str: number;
  S_ac: number;
  S_earth: number;
  dVdc_pct: number;
  dVac_pct: number;
  PR: number;
}

export interface FinancialResult {
  numPanels: number;
  kwp: number;
  annualYieldKWh: number;
  capexBruto: number;
  capexNeto: number;
  subtotal: number;
  iva: number;
  ahorroLuzAnio1: number;
  paybackYears: number | null;
  van: number;
  tir: number | null;
  tirString?: string;
  touTarifa?: string;
  [key: string]: unknown;
}

export interface WindResourceConfig {
  sourceName: string;
  vMeanRefMs: number;
  vMean50mMs: number;
  refHeightM: number;
  weibullK: number;
  roughnessLengthM: number;
  shearExponentAlpha: number;
  prevailingWindDirDeg: number;
  autoYawToWind: boolean;
  ambientTempC: number;
  siteAltitudeM: number;
  receptorDistanceM: number;
  availabilityFactor: number;
  electricalEfficiency: number;
}

export interface RAEventMap {
  readonly PROJECT_UPDATED: 'project:updated';
  readonly STEP_CHANGED: 'step:changed';
  readonly GEOMETRY_MUTATED: 'geometry:mutated';
  readonly HARDWARE_CHANGED: 'hardware:changed';
  readonly SIMULATION_UPDATED: 'simulation:updated';
  readonly UI_REFRESHED: 'ui:refreshed';
  readonly BILL_UPDATED: 'bill:updated';
  readonly HIERARCHY_CHANGED: 'hierarchy:changed';
}

export interface EventBusApi {
  readonly EVENTS: RAEventMap;
  on(eventName: string, handler: (payload?: unknown, meta?: { event: string; timestamp: number }) => void): () => void;
  once(eventName: string, handler: (payload?: unknown, meta?: { event: string; timestamp: number }) => void): () => void;
  off(eventName: string, handler: (...args: unknown[]) => void): void;
  emit(eventName: string, payload?: unknown, opts?: { fromDom?: boolean }): void;
  listenerCount(eventName: string): number;
}

export interface StoreState {
  projectMeta: { uuid: string | null; name: string; address: string; currentStep: number };
  site: { lat: number | null; lng: number | null };
  geometry: { planesCount: number; polylinesCount: number; panelsCount: number; version: number };
  hardware: { moduleId: string | null; inverterId: string | null; batteryId: string | null; topology: string };
  simulation: { hasHeatmap: boolean; dirty: boolean; annualKWh: number; avgShadowLossPct: number };
  financial: { lastModel: FinancialResult | null; numPanels: number; updatedAt: number };
  ui: { activeTab: string };
}

export interface StoreApi {
  getState(): Readonly<StoreState>;
  getSlice<K extends keyof StoreState>(slice: K): Readonly<StoreState[K]>;
  setSlice<K extends keyof StoreState>(slice: K, patch: Partial<StoreState[K]>, meta?: { silent?: boolean; reason?: string }): Readonly<StoreState[K]>;
  subscribe<K extends keyof StoreState>(slice: K | '*', listener: (nextSlice: unknown, fullState: Readonly<StoreState>) => void): () => void;
  getFinancialModel(expectedNumPanels?: number): FinancialResult | null;
  setFinancialModel(model: FinancialResult | null): void;
  reset(): void;
}
