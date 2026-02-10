export const WALKER_COLORS = [
  "#e6194b", // red
  "#3cb44b", // green
  "#4363d8", // blue
  "#f58231", // orange
  "#911eb4", // purple
  "#42d4f4", // cyan
  "#f032e6", // magenta
  "#bfef45", // lime
  "#fabed4", // pink
  "#dcbeff", // lavender
] as const;

export const NUM_WALKERS = 10;

export const ARMSTRONG_COUNTY_CENTER: [number, number] = [34.965, -101.357];
export const DEFAULT_ZOOM = 11;

export const CENSUS_GEOCODER_URL =
  "https://geocoding.geo.census.gov/geocoder/geographies/addressbatch";

export const CENSUS_GEOCODER_SINGLE_URL =
  "https://geocoding.geo.census.gov/geocoder/geographies/address";

export const PARTY_COLORS: Record<string, string> = {
  R: "#dc2626",
  D: "#2563eb",
  unknown: "#9ca3af",
};

export const PLAN_DAY_COLORS = [
  "#dc2626",
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#4f46e5",
  "#059669",
  "#c2410c",
] as const;

export function planDayColor(day: number): string {
  const safeDay = Number.isFinite(day) ? Math.max(1, Math.floor(day)) : 1;
  return PLAN_DAY_COLORS[(safeDay - 1) % PLAN_DAY_COLORS.length];
}
