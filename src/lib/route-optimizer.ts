import { GeocodedVoter } from "./types";
import { buildDistanceMatrix } from "./distance-matrix";

export type RouteTravelMode = "walking" | "driving";

interface OptimizeRouteOptions {
  mode?: RouteTravelMode;
}

function routeLength(matrix: number[][], order: number[]): number {
  let total = 0;
  for (let i = 0; i < order.length - 1; i++) {
    total += matrix[order[i]][order[i + 1]];
  }
  return total;
}

function nearestNeighborMultiStart(matrix: number[][]): number[] {
  const n = matrix.length;
  if (n <= 1) return Array.from({ length: n }, (_, i) => i);

  let bestOrder: number[] = [];
  let bestTotal = Infinity;

  // Try each start node; keep shortest open path.
  for (let start = 0; start < n; start++) {
    const visited = new Array(n).fill(false);
    const order = [start];
    visited[start] = true;
    let totalDist = 0;

    for (let step = 1; step < n; step++) {
      const current = order[order.length - 1];
      let bestNext = -1;
      let bestDist = Infinity;

      for (let j = 0; j < n; j++) {
        if (!visited[j] && matrix[current][j] < bestDist) {
          bestDist = matrix[current][j];
          bestNext = j;
        }
      }

      if (bestNext === -1) break;
      order.push(bestNext);
      visited[bestNext] = true;
      totalDist += bestDist;
    }

    if (totalDist < bestTotal) {
      bestTotal = totalDist;
      bestOrder = order;
    }
  }

  return bestOrder;
}

function twoOptOpenPath(initialOrder: number[], matrix: number[][]): number[] {
  const n = initialOrder.length;
  if (n < 4) return initialOrder;

  let order = [...initialOrder];
  let improved = true;
  let passes = 0;
  const MAX_PASSES = 10;

  // 2-opt for an open path (no return-to-start edge).
  while (improved && passes < MAX_PASSES) {
    improved = false;
    passes += 1;

    for (let i = 0; i < n - 2; i++) {
      for (let k = i + 2; k < n - 1; k++) {
        const a = order[i];
        const b = order[i + 1];
        const c = order[k];
        const d = order[k + 1];

        const current = matrix[a][b] + matrix[c][d];
        const proposed = matrix[a][c] + matrix[b][d];

        if (proposed + 1 < current) {
          const reversed = order.slice(i + 1, k + 1).reverse();
          order = [...order.slice(0, i + 1), ...reversed, ...order.slice(k + 1)];
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  return order;
}

function turnAngleAndDirection(
  prev: GeocodedVoter,
  current: GeocodedVoter,
  next: GeocodedVoter
): { angleDeg: number; isLeftTurn: boolean } {
  const avgLatRad = ((prev.lat + current.lat + next.lat) / 3) * (Math.PI / 180);
  const scaleX = Math.cos(avgLatRad);

  const v1x = (current.lng - prev.lng) * scaleX;
  const v1y = current.lat - prev.lat;
  const v2x = (next.lng - current.lng) * scaleX;
  const v2y = next.lat - current.lat;

  const cross = v1x * v2y - v1y * v2x;
  const dot = v1x * v2x + v1y * v2y;
  const angleRad = Math.atan2(Math.abs(cross), dot);
  const angleDeg = (angleRad * 180) / Math.PI;

  return {
    angleDeg,
    isLeftTurn: cross > 0,
  };
}

function leftTurnPenaltyMeters(
  order: number[],
  voters: GeocodedVoter[],
  mode: RouteTravelMode
): number {
  if (mode !== "driving" || order.length < 3) return 0;

  let penalty = 0;
  for (let i = 1; i < order.length - 1; i++) {
    const prev = voters[order[i - 1]];
    const current = voters[order[i]];
    const next = voters[order[i + 1]];
    const { angleDeg, isLeftTurn } = turnAngleAndDirection(prev, current, next);

    if (angleDeg < 25) continue;

    // Driving mode preference: lightly avoid left turns and heavily avoid sharp lefts.
    if (isLeftTurn) {
      if (angleDeg >= 140) {
        penalty += 180;
      } else if (angleDeg >= 80) {
        penalty += 110;
      } else {
        penalty += 45;
      }
      continue;
    }

    // Penalize extreme U-turn-ish maneuvers in any direction.
    if (angleDeg >= 165) {
      penalty += 60;
    }
  }

  return penalty;
}

function routeCost(
  matrix: number[][],
  order: number[],
  voters: GeocodedVoter[],
  mode: RouteTravelMode
): number {
  return routeLength(matrix, order) + leftTurnPenaltyMeters(order, voters, mode);
}

function twoOptOpenPathByCost(
  initialOrder: number[],
  matrix: number[][],
  voters: GeocodedVoter[],
  mode: RouteTravelMode
): number[] {
  const n = initialOrder.length;
  if (n < 4) return initialOrder;

  let order = [...initialOrder];
  let bestCost = routeCost(matrix, order, voters, mode);
  let improved = true;
  let passes = 0;
  const MAX_PASSES = 10;

  while (improved && passes < MAX_PASSES) {
    improved = false;
    passes += 1;

    for (let i = 0; i < n - 2; i++) {
      for (let k = i + 2; k < n - 1; k++) {
        const candidate = [
          ...order.slice(0, i + 1),
          ...order.slice(i + 1, k + 1).reverse(),
          ...order.slice(k + 1),
        ];
        const candidateCost = routeCost(matrix, candidate, voters, mode);

        if (candidateCost + 1 < bestCost) {
          order = candidate;
          bestCost = candidateCost;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  return order;
}

export function optimizeRouteOrder(
  voters: GeocodedVoter[],
  options: OptimizeRouteOptions = {}
): number[] {
  if (voters.length <= 1) return Array.from({ length: voters.length }, (_, i) => i);
  const mode = options.mode ?? "walking";

  const matrix = buildDistanceMatrix(voters);
  const nnOrder = nearestNeighborMultiStart(matrix);
  const improved =
    mode === "walking"
      ? twoOptOpenPath(nnOrder, matrix)
      : twoOptOpenPathByCost(nnOrder, matrix, voters, mode);

  // Keep whichever is better for the selected travel mode.
  const nnCost = routeCost(matrix, nnOrder, voters, mode);
  const improvedCost = routeCost(matrix, improved, voters, mode);
  return improvedCost <= nnCost ? improved : nnOrder;
}
