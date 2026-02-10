import { NextRequest, NextResponse } from "next/server";
import { Voter } from "@/lib/types";
import { geocodeWithRetry } from "@/lib/geocoder";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const voters: Voter[] = body.voters;

    if (!voters || !Array.isArray(voters) || voters.length === 0) {
      return NextResponse.json(
        { error: "No voters provided" },
        { status: 400 }
      );
    }

    const { geocoded, unmatched } = await geocodeWithRetry(voters);

    return NextResponse.json({
      geocoded,
      unmatched,
      stats: {
        total: voters.length,
        matched: geocoded.length,
        unmatched: unmatched.length,
        matchRate: ((geocoded.length / voters.length) * 100).toFixed(1),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Geocoding failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      { status: 500 }
    );
  }
}
