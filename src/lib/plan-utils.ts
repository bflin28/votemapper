import { GeocodedVoter, Voter } from "@/lib/types";
import { clusterVoters } from "@/lib/clustering";
import { haversineDistance } from "@/lib/distance-matrix";
import { optimizeRouteOrder, type RouteTravelMode } from "@/lib/route-optimizer";

export const MAX_PLAN_DAYS = 30;
export const PLAN_PREVIEW_LIMIT = 6;

export interface GoogleMapsLinkInput {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number | null;
  lng?: number | null;
  travelMode?: RouteTravelMode;
  directions?: boolean;
}

export interface DayPlan {
  dayNumber: number;
  dateValue: string;
  dateLabel: string;
  voters: Voter[];
}

export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateInput(value: string): Date {
  const parsed = new Date(`${value}T12:00:00`);
  if (!isNaN(parsed.getTime())) return parsed;
  const fallback = new Date();
  fallback.setHours(12, 0, 0, 0);
  return fallback;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function formatCampaignDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function mergeUniqueIds(base: string[], additions: string[]): string[] {
  const existing = new Set(base);
  const next = [...base];
  for (const id of additions) {
    if (!existing.has(id)) {
      existing.add(id);
      next.push(id);
    }
  }
  return next;
}

export function csvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function addressQuery(input: GoogleMapsLinkInput): string {
  const parts = [input.address, input.city, input.state, input.zip]
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0);
  return parts.join(", ");
}

export function buildGoogleMapsUrl(input: GoogleMapsLinkInput): string {
  const hasCoords =
    typeof input.lat === "number" &&
    Number.isFinite(input.lat) &&
    typeof input.lng === "number" &&
    Number.isFinite(input.lng);

  const destination = hasCoords
    ? `${input.lat},${input.lng}`
    : addressQuery(input);
  const encodedDestination = encodeURIComponent(destination);

  if (input.directions) {
    const travelMode =
      input.travelMode === "driving" ? "driving" : "walking";
    return `https://www.google.com/maps/dir/?api=1&destination=${encodedDestination}&travelmode=${travelMode}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodedDestination}`;
}

export function orderVotersByWalkingPath(
  voters: Voter[],
  geocodedById: Map<string, GeocodedVoter>,
  travelMode: RouteTravelMode = "walking"
): Voter[] {
  if (voters.length <= 1) return voters;

  const geocodedPairs = voters
    .map((voter) => {
      const geocoded = geocodedById.get(voter.id);
      return geocoded ? { voter, geocoded } : null;
    })
    .filter((pair): pair is { voter: Voter; geocoded: GeocodedVoter } => Boolean(pair));

  if (geocodedPairs.length <= 1) return voters;

  const order = optimizeRouteOrder(
    geocodedPairs.map((pair) => pair.geocoded),
    { mode: travelMode }
  );
  const orderedGeocoded = order.map((idx) => geocodedPairs[idx].voter);
  const orderedSet = new Set(orderedGeocoded.map((voter) => voter.id));
  const nonGeocoded = voters.filter((voter) => !orderedSet.has(voter.id));

  return [...orderedGeocoded, ...nonGeocoded];
}

export function buildBalancedGeoPlanAssignments(
  campaignList: Voter[],
  geocodedVoters: GeocodedVoter[],
  days: number
): Record<string, number> {
  const safeDays = Math.max(1, Math.floor(days));
  const assignments: Record<string, number> = {};
  if (campaignList.length === 0) return assignments;

  const geocodedById = new Map(geocodedVoters.map((voter) => [voter.id, voter]));
  const geocodedList: GeocodedVoter[] = [];

  for (const voter of campaignList) {
    const geocoded = geocodedById.get(voter.id);
    if (geocoded) {
      geocodedList.push(geocoded);
    }
  }

  const baseCapacity = Math.floor(campaignList.length / safeDays);
  const extraCapacity = campaignList.length % safeDays;

  const capacities = Array.from({ length: safeDays }, (_, idx) =>
    baseCapacity + (idx < extraCapacity ? 1 : 0)
  );

  const dayStates = Array.from({ length: safeDays }, (_, idx) => ({
    day: idx + 1,
    capacity: capacities[idx],
    assignedCount: 0,
  }));

  if (geocodedList.length > 0) {
    const clusters = clusterVoters(geocodedList, safeDays);
    const centroids = Array.from(clusters.values())
      .map((members) => {
        const lat =
          members.reduce((sum, voter) => sum + voter.lat, 0) / Math.max(1, members.length);
        const lng =
          members.reduce((sum, voter) => sum + voter.lng, 0) / Math.max(1, members.length);
        return { lat, lng };
      })
      .sort((a, b) => (a.lng !== b.lng ? a.lng - b.lng : a.lat - b.lat));

    while (centroids.length < safeDays) {
      const fallback = geocodedList[centroids.length % geocodedList.length];
      centroids.push({ lat: fallback.lat, lng: fallback.lng });
    }

    const remainingCapacities = [...capacities];
    const geocodedScores = geocodedList
      .map((voter) => {
        const distances = centroids.map((centroid) =>
          haversineDistance(voter.lat, voter.lng, centroid.lat, centroid.lng)
        );
        const sorted = [...distances].sort((a, b) => a - b);
        const spread = (sorted[1] ?? sorted[0] ?? 0) - (sorted[0] ?? 0);
        return { voter, distances, spread };
      })
      .sort((a, b) => b.spread - a.spread);

    for (const { voter, distances } of geocodedScores) {
      let bestDayIdx = -1;
      let bestDistance = Infinity;

      for (let dayIdx = 0; dayIdx < safeDays; dayIdx++) {
        if (remainingCapacities[dayIdx] <= 0) continue;
        if (distances[dayIdx] < bestDistance) {
          bestDistance = distances[dayIdx];
          bestDayIdx = dayIdx;
        }
      }

      if (bestDayIdx === -1) {
        bestDayIdx = 0;
      }

      assignments[voter.id] = bestDayIdx + 1;
      remainingCapacities[bestDayIdx] = Math.max(0, remainingCapacities[bestDayIdx] - 1);
      dayStates[bestDayIdx].assignedCount += 1;
    }
  }

  const unassigned = campaignList.filter((voter) => assignments[voter.id] == null);
  for (const voter of unassigned) {
    let bestDayIdx = 0;
    for (let i = 1; i < dayStates.length; i++) {
      const aRemaining = dayStates[i].capacity - dayStates[i].assignedCount;
      const bRemaining =
        dayStates[bestDayIdx].capacity - dayStates[bestDayIdx].assignedCount;
      if (aRemaining > bRemaining) {
        bestDayIdx = i;
      }
    }
    assignments[voter.id] = bestDayIdx + 1;
    dayStates[bestDayIdx].assignedCount += 1;
  }

  return assignments;
}

export function buildDayPlans(
  voters: Voter[],
  startDateValue: string,
  days: number
): DayPlan[] {
  if (voters.length === 0 || days <= 0) return [];

  const startDate = parseDateInput(startDateValue);
  const baseSize = Math.floor(voters.length / days);
  const extra = voters.length % days;

  let cursor = 0;
  const plans: DayPlan[] = [];

  for (let i = 0; i < days; i++) {
    const size = baseSize + (i < extra ? 1 : 0);
    const votersForDay = voters.slice(cursor, cursor + size);
    cursor += size;

    const date = addDays(startDate, i);
    plans.push({
      dayNumber: i + 1,
      dateValue: toDateInputValue(date),
      dateLabel: formatCampaignDate(date),
      voters: votersForDay,
    });
  }

  return plans;
}
