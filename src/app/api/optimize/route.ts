import { NextRequest, NextResponse } from "next/server";
import { GeocodedVoter, WalkerRoute } from "@/lib/types";
import { WALKER_COLORS, NUM_WALKERS } from "@/lib/constants";
import { clusterVoters } from "@/lib/clustering";
import { totalRouteDistance } from "@/lib/distance-matrix";
import { optimizeRouteOrder } from "@/lib/route-optimizer";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const voters: GeocodedVoter[] = body.voters;
    const numWalkers: number = body.numWalkers || NUM_WALKERS;

    if (!voters || voters.length === 0) {
      return NextResponse.json(
        { error: "No geocoded voters provided" },
        { status: 400 }
      );
    }

    // Step 1: Cluster voters
    const clusters = clusterVoters(voters, numWalkers);

    // Step 2: Build walker routes using JS nearest-neighbor TSP
    const walkerRoutes: WalkerRoute[] = [];
    let walkerIdx = 0;

    for (const [, clusterVoterList] of clusters) {
      const orderedIndices = optimizeRouteOrder(clusterVoterList);
      const orderedVoters = orderedIndices.map((i) => clusterVoterList[i]);
      const distKm = totalRouteDistance(clusterVoterList, orderedIndices);

      walkerRoutes.push({
        walkerId: walkerIdx,
        color: WALKER_COLORS[walkerIdx % WALKER_COLORS.length],
        voters: clusterVoterList,
        orderedVoters,
        totalDistanceKm: Math.round(distKm * 100) / 100,
        doorCount: clusterVoterList.length,
      });

      walkerIdx++;
    }

    return NextResponse.json({
      routes: walkerRoutes,
      solver: "nearest_neighbor_2opt",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Optimization failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      { status: 500 }
    );
  }
}
