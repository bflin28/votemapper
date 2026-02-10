#!/usr/bin/env python3
"""
TSP solver using OR-Tools.
Reads JSON from stdin, writes optimized routes to stdout.

Input format:
{
  "clusters": [
    {
      "clusterId": 0,
      "distanceMatrix": [[0, 100, ...], ...],
      "voterIds": ["voter-1", "voter-2", ...]
    },
    ...
  ]
}

Output format:
{
  "routes": [
    {
      "clusterId": 0,
      "orderedIndices": [0, 3, 1, 2, ...],
      "totalDistance": 12345
    },
    ...
  ]
}
"""

import json
import sys

try:
    from ortools.constraint_solver import routing_enums_pb2, pywrapcp
    HAS_ORTOOLS = True
except ImportError:
    HAS_ORTOOLS = False


def solve_tsp_ortools(distance_matrix):
    """Solve open-path TSP using OR-Tools with a dummy depot trick.

    Adds a dummy node with 0-cost edges to all real nodes, then solves a
    closed-loop TSP. Removing the dummy from the result yields the optimal
    open path — the two nodes adjacent to the dummy become start and end.
    """
    n = len(distance_matrix)
    if n <= 1:
        return list(range(n)), 0
    if n == 2:
        return [0, 1], distance_matrix[0][1]

    # Build augmented (n+1) x (n+1) matrix with dummy node at index n
    aug_n = n + 1
    aug_matrix = []
    for i in range(n):
        row = list(distance_matrix[i]) + [0]
        aug_matrix.append(row)
    aug_matrix.append([0] * aug_n)

    manager = pywrapcp.RoutingIndexManager(aug_n, 1, n)  # dummy node n is depot
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return aug_matrix[from_node][to_node]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_parameters.time_limit.seconds = 5

    solution = routing.SolveWithParameters(search_parameters)

    if solution:
        # Extract full tour (closed loop including dummy)
        full_tour = []
        index = routing.Start(0)
        while not routing.IsEnd(index):
            full_tour.append(manager.IndexToNode(index))
            index = solution.Value(routing.NextVar(index))

        # Strip the dummy node — remaining sequence is the open path
        order = [node for node in full_tour if node != n]

        total_distance = 0
        for i in range(len(order) - 1):
            total_distance += distance_matrix[order[i]][order[i + 1]]

        return order, total_distance

    # Fallback: multi-start nearest neighbor
    return nearest_neighbor_tsp(distance_matrix)


def nearest_neighbor_tsp(distance_matrix):
    """Multi-start nearest-neighbor heuristic.

    Tries every node as a starting point and returns the tour with the
    minimum total open-path distance. O(N³) — negligible for clusters < 50.
    """
    n = len(distance_matrix)
    if n <= 1:
        return list(range(n)), 0

    best_order = None
    best_total = float("inf")

    for start in range(n):
        visited = [False] * n
        order = [start]
        visited[start] = True
        total_distance = 0

        for _ in range(n - 1):
            current = order[-1]
            best_next = -1
            best_dist = float("inf")
            for j in range(n):
                if not visited[j] and distance_matrix[current][j] < best_dist:
                    best_dist = distance_matrix[current][j]
                    best_next = j
            if best_next == -1:
                break
            order.append(best_next)
            visited[best_next] = True
            total_distance += best_dist

        if total_distance < best_total:
            best_total = total_distance
            best_order = order

    return best_order, best_total


def main():
    data = json.loads(sys.stdin.read())
    clusters = data.get("clusters", [])

    solve_fn = solve_tsp_ortools if HAS_ORTOOLS else nearest_neighbor_tsp

    routes = []
    for cluster in clusters:
        matrix = cluster["distanceMatrix"]
        if HAS_ORTOOLS:
            order, total_dist = solve_tsp_ortools(matrix)
        else:
            order, total_dist = nearest_neighbor_tsp(matrix)

        routes.append({
            "clusterId": cluster["clusterId"],
            "orderedIndices": order,
            "totalDistance": total_dist,
        })

    result = {
        "routes": routes,
        "solver": "ortools" if HAS_ORTOOLS else "nearest_neighbor",
    }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
