import { GeocodedVoter } from "./types";
import { buildDistanceMatrix } from "./distance-matrix";

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

export function optimizeRouteOrder(voters: GeocodedVoter[]): number[] {
  if (voters.length <= 1) return Array.from({ length: voters.length }, (_, i) => i);

  const matrix = buildDistanceMatrix(voters);
  const nnOrder = nearestNeighborMultiStart(matrix);
  const improved = twoOptOpenPath(nnOrder, matrix);

  // Keep whichever is shorter as a safety check.
  const nnLen = routeLength(matrix, nnOrder);
  const improvedLen = routeLength(matrix, improved);
  return improvedLen <= nnLen ? improved : nnOrder;
}

