import type { CocResult, CocScenario } from "./coc.js";

export const plantStepS = 0.02;
export const controlIntervalS = 0.10;
export const ticksPerInterval = 5;
export const hvInterlockCode = "P0A0A";
export const chamberDefaults = { temperatureC: 23, humidityPct: 50, pressureKpa: 101.325 };
export type ChamberConditions = typeof chamberDefaults;

export const rollerTests = {
  brake: { title: "Service brake test", initialSpeedKph: 50, endSpeedKph: 0 },
  coastdown: { title: "Coastdown test", initialSpeedKph: 100, endSpeedKph: 20 },
} as const;
export type RollerScenario = keyof typeof rollerTests;
export const reducedBrakeForceFraction = 0.5;

export function isRollerTest(scenario: unknown): scenario is RollerScenario {
  return scenario === "brake" || scenario === "coastdown";
}

export type Scenario = "manual" | "wltc" | "cycle" | "charge-dc" | CocScenario | RollerScenario;
export type CycleDriver = "automatic" | "pedals";
export interface CycleInfo {
  id: string;
  title: string;
  group: string;
  source: string;
  stepS: number;
  durationS: number;
  phases: { title: string; endS: number }[];
}
export interface DriveCycle extends CycleInfo {
  speedKph: number[];
  gradePct?: number[];
}
export interface RunConfig {
  scenario: Scenario;
  vehicleId?: string;
  reducedBrakeForce?: boolean;
  initialSpeedKph?: number;
  cycleId?: string;
  socPct: number;
  temperatureC: number;
  ambientC: number;
  driver?: CycleDriver;
  profile?: "legacy";
  initialPack?: { voltageV: number; currentA: number };
}
export interface Pedals {
  accelerator: number;
  brake: number;
  hvOk: boolean;
}
export interface PlantState {
  time_s: number;
  mode: string;
  hv_state: string;
  gear: string;
  speed_kph: number;
  motor_rpm: number;
  distance_km: number;
  soc_pct: number;
  battery_temp_c: number;
  battery_voltage_v: number;
  battery_current_a: number;
  battery_power_kw: number;
  battery_charge_limit_kw: number;
  battery_discharge_limit_kw: number;
  motor_torque_nm: number;
  road_load_kw: number;
  regen_force_n: number;
  friction_force_n: number;
  source_kw: number;
  pack_heating_kw: number;
  energy_pack_cooling_electric_kwh?: number;
  energy_pack_heat_removed_kwh?: number;
  energy_regen_into_battery_kwh: number;
  energy_battery_out_kwh: number;
  energy_battery_in_kwh: number;
  energy_source_kwh: number;
  vehicle_energy_residual_j: number;
  battery_energy_residual_j: number;
  accelerator: number;
  brake: number;
}
export interface PlantInput {
  accelerator?: number;
  brake?: number;
  hv_ok?: boolean;
  compensate_regen?: boolean;
  grade_pct?: number;
  gear?: "D" | "P" | "N";
  awake?: boolean;
  brake_force_fraction?: number;
  plug?: "dc";
  charger_kw?: number;
  charge_target_soc?: number;
}
export interface Vehicle {
  id: string;
  title: string;
  configuration: string;
  plate: string;
  lengthM: number;
  widthM: number;
  heightM: number;
  wheelbaseM: number;
  trackM: number;
  frontOverhangM: number;
  rearOverhangM: number;
  groundClearanceM: number;
  wheelRadiusM: number;
  rollerRadiusM: number;
  rollerOutsideSpanM: number;
  rollerCenterGapM: number;
}
export interface Point {
  timeS: number;
  speedKph: number;
  targetKph: number | null;
  measuredKph: number | null;
  batteryKw: number;
  measuredBatteryKw: number | null;
}
export interface Comparison {
  targetRmseKph: number;
  measuredRmseKph: number;
  batteryRmseKw: number;
  measuredOutKwh: number;
  measuredInKwh: number;
  measuredDistanceKm: number;
}
export interface Snapshot {
  revision: number;
  startedAt?: string;
  faultCode?: typeof hvInterlockCode;
  abortReason?: "hv-fault";
  accelerationTimes?: { speedKph: number; timeS: number | null }[];
  config: RunConfig;
  state: PlantState;
  chamber: ChamberConditions;
  targetKph: number | null;
  cycleDurationS: number;
  complete: boolean;
  comparison: Comparison | null;
  targetRmseKph: number | null;
  consumptionKwhPer100Km: number | null;
  gradePct: number | null;
  coc?: CocResult & { reference: number; unit: "km/h" | "km" };
}

export interface AdvanceResult extends Snapshot {
  points: Point[];
}
