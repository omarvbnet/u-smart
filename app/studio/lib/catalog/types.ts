/**
 * U Smart Studio — Domain catalog types.
 *
 * Clean-architecture domain layer: pure TypeScript with no UI/framework
 * dependencies. These types model the engineering components that can be
 * placed on the Digital Twin canvas.
 */

export type LocalizedText = {
  ar: string;
  en: string;
  ku: string;
  tr: string;
};

export type ComponentDomain =
  | 'source'
  | 'protection'
  | 'cable'
  | 'load'
  | 'hvac'
  | 'sensor'
  | 'smarthome';

/** Electrical port type — used to validate which components may connect. */
export type PortKind = 'power' | 'bus' | 'signal' | 'control';

export type ComponentPort = {
  id: string;
  kind: PortKind;
  label: LocalizedText;
  direction: 'in' | 'out' | 'inout';
};

export type StandardCode =
  | 'IEC 60364'
  | 'IEC 60947'
  | 'IEC 60898'
  | 'IEC 60287'
  | 'IEC 60332'
  | 'NEC 2023'
  | 'NFPA 70'
  | 'ASHRAE'
  | 'KNX';

/** Common metadata every catalog entry shares. */
export type CatalogEntryBase = {
  id: string;
  domain: ComponentDomain;
  category: string;
  name: LocalizedText;
  manufacturer: string;
  model: string;
  standards: StandardCode[];
  ports: ComponentPort[];
  /** Lucide icon name rendered on the node. */
  icon: string;
  /** Accent color (hex) used on the canvas node. */
  color: string;
};

/* ----------------------------- Cables ----------------------------- */

export type ConductorMaterial = 'copper' | 'aluminium';

export type CableSpec = CatalogEntryBase & {
  domain: 'cable';
  conductorMaterial: ConductorMaterial;
  coreCount: number;
  /** Cross-sectional area in mm². */
  csaMm2: number;
  /** Rated voltage in volts. */
  voltageRating: number;
  /** Current-carrying capacity (ampacity) in amperes. */
  ampacityA: number;
  /** Resistance in Ω/km at 20°C. */
  resistanceOhmPerKm: number;
  /** Reactance in Ω/km. */
  reactanceOhmPerKm: number;
  /** Mass in kg/km. */
  weightKgPerKm: number;
  /** Cost per meter in the project currency. */
  costPerMeter: number;
  fireResistant: boolean;
};

/* -------------------------- Protection ----------------------------- */

export type ProtectionType =
  | 'MCB'
  | 'MCCB'
  | 'ACB'
  | 'RCCB'
  | 'RCBO'
  | 'MPCB'
  | 'FUSE'
  | 'SPD';

/** IEC 60898 / 60947 magnetic trip curves. */
export type TripCurve = 'B' | 'C' | 'D' | 'K' | 'Z' | 'NA';

export type ProtectionSpec = CatalogEntryBase & {
  domain: 'protection';
  protectionType: ProtectionType;
  /** Rated current In (A). For SPD/RCCB this is the throughput rating. */
  ratedCurrentA: number;
  /** Number of poles. */
  poles: 1 | 2 | 3 | 4;
  /** Breaking capacity Icu (kA). */
  breakingCapacityKA: number;
  tripCurve: TripCurve;
  /** Residual sensitivity in mA (RCCB/RCBO), else null. */
  residualSensitivityMa: number | null;
  /** Whether In can be adjusted (MCCB/ACB). */
  adjustable: boolean;
};

/* ---------------------------- Sources ------------------------------ */

export type SourceType =
  | 'UTILITY'
  | 'GENERATOR'
  | 'UPS'
  | 'BATTERY'
  | 'SOLAR_PV'
  | 'INVERTER'
  | 'WIND'
  | 'EV_CHARGER';

export type SourceSpec = CatalogEntryBase & {
  domain: 'source';
  sourceType: SourceType;
  /** Nominal voltage (V). */
  voltage: number;
  phases: 1 | 3;
  /** Rated apparent power (kVA). */
  ratedKva: number;
  powerFactor: number;
  efficiency: number;
  /** Short-circuit contribution (kA). */
  scContributionKA: number;
};

/* ----------------------------- Loads ------------------------------- */

export type LightingFixtureType = 'DOWNLIGHT' | 'LINEAR' | 'SPOT' | 'MAGNETIC';

export type LoadSpec = CatalogEntryBase & {
  domain: 'load';
  /** Active power in watts. */
  powerW: number;
  voltage: number;
  phases: 1 | 3;
  powerFactor: number;
  demandFactor: number;
  /** Lighting fixture classification (when category === LIGHTING). */
  lightingType?: LightingFixtureType;
  /** Nominal lumens per fixture. */
  lumens?: number;
  /** Beam angle in degrees (spot/downlight). */
  beamAngleDeg?: number;
  /** Track / linear length in mm. */
  lengthMm?: number;
  /** Map outlet / appliance kind (SOCKET or APPLIANCE category). */
  outletKind?: 'socket' | 'double_socket' | 'washer' | 'dryer' | 'dishwasher' | 'oven' | 'fridge' | 'cooker' | 'water_heater';
};

/* ----------------------------- HVAC -------------------------------- */

export type HvacType =
  | 'SPLIT'
  | 'VRF'
  | 'VRF_INDOOR'
  | 'VRF_OUTDOOR'
  | 'CHILLER'
  | 'FCU'
  | 'AHU'
  | 'PACKAGE'
  | 'HEAT_PUMP'
  | 'UNDERFLOOR';

export type VrfIndoorStyle = 'wall' | 'duct' | 'cassette' | 'floor';

export type HvacSpec = CatalogEntryBase & {
  domain: 'hvac';
  hvacType: HvacType;
  /** Cooling capacity in kW. */
  coolingKw: number;
  /** Heating capacity in kW. */
  heatingKw: number;
  /** Electrical input power in kW. */
  inputKw: number;
  /** Coefficient of performance (heating). */
  cop: number;
  /** Energy efficiency ratio (cooling). */
  eer: number;
  voltage: number;
  phases: 1 | 3;
  /** VRF indoor unit style. */
  vrfIndoorStyle?: VrfIndoorStyle;
  /** Max connected indoor units (outdoor modules). */
  maxIndoorUnits?: number;
};

/* ---------------------------- Sensors ------------------------------ */

export type SensorType =
  | 'MOTION'
  | 'PRESENCE'
  | 'SMOKE'
  | 'HEAT'
  | 'GAS'
  | 'WATER_LEAK'
  | 'LUX'
  | 'TEMPERATURE'
  | 'HUMIDITY'
  | 'VIBRATION'
  | 'MAGNETIC';

export type SensorSpec = CatalogEntryBase & {
  domain: 'sensor';
  sensorType: SensorType;
  /** Operating voltage (V). */
  voltage: number;
  /** Current draw (mA). */
  currentMa: number;
  protocol: 'KNX' | 'HDL' | 'DRY_CONTACT' | 'ANALOG';
};

/* -------------------------- Smart Home ----------------------------- */

export type SmartHomeProtocol = 'HDL' | 'KNX';

export type SmartHomeSpec = CatalogEntryBase & {
  domain: 'smarthome';
  protocol: SmartHomeProtocol;
  deviceClass: string;
  /** Channels / outputs (e.g. relay channels, dimmer channels). */
  channels: number;
  /** Per-channel rated current (A) for actuators, else null. */
  channelCurrentA: number | null;
  /** Bus current draw (mA). */
  busCurrentMa: number;
  voltage: number;
};

export type CatalogEntry =
  | CableSpec
  | ProtectionSpec
  | SourceSpec
  | LoadSpec
  | HvacSpec
  | SensorSpec
  | SmartHomeSpec;
