import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import {
  getOrderById,
  updateOrderStatus,
  updateOrderStatusAndSlug,
  updateOrderStatusIf,
  insertCampaign,
  CampaignData,
} from "@/lib/db";
import { parseCSV, parseHistoryCSV } from "@/lib/csv-parser";
import { geocodeWithRetry } from "@/lib/geocoder";
import { clusterVoters } from "@/lib/clustering";
import { totalRouteDistance } from "@/lib/distance-matrix";
import { GeocodedVoter, WalkerRoute } from "@/lib/types";
import { WALKER_COLORS, NUM_WALKERS } from "@/lib/constants";
import { optimizeRouteOrder } from "@/lib/route-optimizer";

export async function POST(request: NextRequest) {
  let orderId: string | undefined;
  try {
    const body = await request.json();
    orderId = body.orderId;
    const { voterCsv, historyCsv } = body;

    if (!orderId || !voterCsv) {
      return NextResponse.json(
        { error: "Missing orderId or voterCsv" },
        { status: 400 }
      );
    }

    // Fetch order
    const order = getOrderById(orderId);

    if (!order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    // Guard: only process orders in "paid" status
    if (order.status !== "paid") {
      return NextResponse.json(
        { error: `Order already ${order.status} — cannot reprocess` },
        { status: 409 }
      );
    }

    // Update status to processing
    updateOrderStatus(orderId, "processing");

    // 1. Parse CSV
    const historyMap = historyCsv ? parseHistoryCSV(historyCsv) : undefined;
    const { voters, geocodedVoters: preGeocoded } = parseCSV(voterCsv, historyMap);

    // 2. Geocode (use pre-geocoded if CSV had lat/lng, otherwise Census API)
    let geocodedVoters: GeocodedVoter[];
    let unmatchedVoters = [];

    if (preGeocoded.length > 0) {
      geocodedVoters = preGeocoded;
      unmatchedVoters = voters.filter(
        (v) => !preGeocoded.some((g) => g.id === v.id)
      );
    } else {
      const result = await geocodeWithRetry(voters);
      geocodedVoters = result.geocoded;
      unmatchedVoters = result.unmatched;
    }

    // 3. Cluster + TSP optimize
    const numWalkers = Math.min(NUM_WALKERS, geocodedVoters.length);
    const clusters = clusterVoters(geocodedVoters, numWalkers);

    const routes: WalkerRoute[] = [];
    let walkerIdx = 0;

    for (const [, clusterVoterList] of clusters) {
      const orderedIndices = optimizeRouteOrder(clusterVoterList);
      const orderedVoters = orderedIndices.map((i) => clusterVoterList[i]);
      const distKm = totalRouteDistance(clusterVoterList, orderedIndices);

      routes.push({
        walkerId: walkerIdx,
        color: WALKER_COLORS[walkerIdx % WALKER_COLORS.length],
        voters: clusterVoterList,
        orderedVoters,
        totalDistanceKm: Math.round(distKm * 100) / 100,
        doorCount: clusterVoterList.length,
      });

      walkerIdx++;
    }

    // 4. Compute center
    let centerLat: number | null = null;
    let centerLng: number | null = null;
    if (geocodedVoters.length > 0) {
      centerLat =
        geocodedVoters.reduce((s, v) => s + v.lat, 0) / geocodedVoters.length;
      centerLng =
        geocodedVoters.reduce((s, v) => s + v.lng, 0) / geocodedVoters.length;
    }

    // 5. Create campaign (with slug collision retry)
    const areaLabel = order.precinct
      ? `${order.precinct}, ${order.county}, ${order.state}`
      : `${order.county}, ${order.state}`;

    const campaignData: CampaignData = {
      voters,
      geocodedVoters,
      unmatchedVoters,
      routes,
      numWalkers,
    };

    // Use pre-assigned slug from order, fall back to generating one
    let slug = order.slug || "";
    const MAX_SLUG_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
      if (!slug) slug = nanoid(8);
      const ok = insertCampaign({
        order_id: orderId,
        slug,
        title: `Walk Routes — ${areaLabel}`,
        state: order.state,
        county: order.county,
        precinct: order.precinct || null,
        voter_count: voters.length,
        geocoded_count: geocodedVoters.length,
        route_count: routes.length,
        center_lat: centerLat,
        center_lng: centerLng,
        data: campaignData,
        password: order.password || null,
      });

      if (ok) break;

      // Slug collision — retry with new slug
      if (attempt < MAX_SLUG_RETRIES - 1) {
        console.warn(`Slug collision on "${slug}", retrying...`);
        slug = ""; // force new slug generation on next attempt
        continue;
      }

      console.error("Failed to insert campaign after retries");
      // Rollback order status so admin can retry
      updateOrderStatus(orderId, "paid");
      return NextResponse.json(
        { error: "Failed to save campaign" },
        { status: 500 }
      );
    }

    // 6. Update order as fulfilled
    updateOrderStatusAndSlug(orderId, "fulfilled", slug);

    return NextResponse.json({
      slug,
      voterCount: voters.length,
      geocodedCount: geocodedVoters.length,
      routeCount: routes.length,
    });
  } catch (error) {
    console.error("Process error:", error);
    // Rollback order status so admin can retry
    if (orderId) {
      try {
        updateOrderStatusIf(orderId, "paid", "processing");
      } catch {
        // Best-effort rollback
      }
    }
    return NextResponse.json(
      {
        error: `Processing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      { status: 500 }
    );
  }
}
