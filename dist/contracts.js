export const plantStepS = 0.02;
export const controlIntervalS = 0.10;
export const ticksPerInterval = 5;
export const hvInterlockCode = "P0A0A";
export const chamberDefaults = { temperatureC: 23, humidityPct: 50, pressureKpa: 101.325 };
export const rollerTests = {
    brake: { title: "Service brake test", initialSpeedKph: 50, endSpeedKph: 0 },
    coastdown: { title: "Coastdown test", initialSpeedKph: 100, endSpeedKph: 20 },
};
export const reducedBrakeForceFraction = 0.5;
export function isRollerTest(scenario) {
    return scenario === "brake" || scenario === "coastdown";
}
