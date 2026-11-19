import { chamberDefaults } from "./contracts.js";

export const cocTests = {
  "coc-speed": { title: "CoC top speed", reference: 225, unit: "km/h" },
  "coc-range": { title: "CoC electric range", reference: 440, unit: "km" },
} as const;

export type CocScenario = keyof typeof cocTests;
export type CocEnd = "complete" | "hv-fault" | "unstable-speed" | "time-limit";
export interface CocResult {
  value: number | null;
  end: CocEnd | null;
}

export const cocInitial = { socPct: 100, temperatureC: 23, ambientC: chamberDefaults.temperatureC };
export const topSpeedDurationS = 90;
export const rangeReservePct = 1;
export const rangeTimeLimitS = 24 * 3600;
export const rangePlaybackRate = 400;

export function isCocScenario(scenario: unknown): scenario is CocScenario {
  return scenario === "coc-speed" || scenario === "coc-range";
}

export interface SpeedSample {
  timeS: number;
  distanceKm: number;
  speedKph: number;
}

export function finalKilometreSpeed(samples: readonly SpeedSample[]): number | null {
  const last = samples.at(-1);
  if (!last || last.distanceKm < 1) return null;
  const distance = last.distanceKm - 1;
  const first = samples.findIndex((sample) => sample.distanceKm >= distance);
  const low = samples[Math.max(0, first - 1)];
  const high = samples[first];
  const fraction = high.distanceKm > low.distanceKm ? (distance - low.distanceKm) / (high.distanceKm - low.distanceKm) : 0;
  const startS = low.timeS + fraction * (high.timeS - low.timeS);
  const startSpeed = low.speedKph + fraction * (high.speedKph - low.speedKph);
  const speed = 3600 / (last.timeS - startS);
  // Require all reported speeds over the measuring interval to be within 1% of its average.
  const tolerance = 0.01 * speed;
  if (Math.abs(startSpeed - speed) > tolerance
      || samples.slice(first).some((point) => Math.abs(point.speedKph - speed) > tolerance)) return null;
  return speed;
}
