import { GeocodedVoter } from "./types";

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export function buildDistanceMatrix(voters: GeocodedVoter[]): number[][] {
  const n = voters.length;
  const matrix: number[][] = Array.from({ length: n }, () =>
    Array(n).fill(0)
  );

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = haversineDistance(
        voters[i].lat,
        voters[i].lng,
        voters[j].lat,
        voters[j].lng
      );
      // Convert to integer meters for OR-Tools (it needs integers)
      const distMeters = Math.round(dist * 1000);
      matrix[i][j] = distMeters;
      matrix[j][i] = distMeters;
    }
  }

  return matrix;
}

export function totalRouteDistance(
  voters: GeocodedVoter[],
  order: number[]
): number {
  let total = 0;
  for (let i = 0; i < order.length - 1; i++) {
    total += haversineDistance(
      voters[order[i]].lat,
      voters[order[i]].lng,
      voters[order[i + 1]].lat,
      voters[order[i + 1]].lng
    );
  }
  return total;
}
