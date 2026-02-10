import { Voter, GeocodedVoter } from "./types";
import { CENSUS_GEOCODER_URL, CENSUS_GEOCODER_SINGLE_URL } from "./constants";

function buildBatchCSV(voters: Voter[]): string {
  return voters
    .map(
      (v) =>
        `${v.id},${v.address},${v.city},${v.state},${v.zip}`
    )
    .join("\n");
}

interface CensusResult {
  id: string;
  inputAddress: string;
  matchStatus: string;
  matchType: string;
  matchedAddress: string;
  coords: string;
  tigerId: string;
  sideOfStreet: string;
}

function parseBatchResponse(responseText: string): CensusResult[] {
  const lines = responseText.trim().split("\n");
  return lines.map((line) => {
    const parts = line.split('","').map((p) => p.replace(/"/g, ""));
    return {
      id: parts[0] || "",
      inputAddress: parts[1] || "",
      matchStatus: parts[2] || "",
      matchType: parts[3] || "",
      matchedAddress: parts[4] || "",
      coords: parts[5] || "",
      tigerId: parts[6] || "",
      sideOfStreet: parts[7] || "",
    };
  });
}

export async function batchGeocode(
  voters: Voter[]
): Promise<{ geocoded: GeocodedVoter[]; unmatched: Voter[] }> {
  const csvContent = buildBatchCSV(voters);
  const blob = new Blob([csvContent], { type: "text/csv" });

  const formData = new FormData();
  formData.append("addressFile", blob, "addresses.csv");
  formData.append("benchmark", "Public_AR_Current");
  formData.append("vintage", "Current_Current");

  const response = await fetch(CENSUS_GEOCODER_URL, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Census geocoder returned ${response.status}`);
  }

  const text = await response.text();
  const results = parseBatchResponse(text);

  const geocoded: GeocodedVoter[] = [];
  const unmatched: Voter[] = [];

  const voterMap = new Map(voters.map((v) => [v.id, v]));

  for (const result of results) {
    const voter = voterMap.get(result.id);
    if (!voter) continue;

    if (result.matchStatus === "Match" && result.coords) {
      const [lng, lat] = result.coords.split(",").map(Number);
      if (!isNaN(lat) && !isNaN(lng)) {
        geocoded.push({
          ...voter,
          lat,
          lng,
          geocodeStatus: "matched",
        });
        continue;
      }
    }
    unmatched.push(voter);
  }

  // Also add voters that weren't in the response at all
  for (const voter of voters) {
    const found =
      geocoded.some((g) => g.id === voter.id) ||
      unmatched.some((u) => u.id === voter.id);
    if (!found) {
      unmatched.push(voter);
    }
  }

  return { geocoded, unmatched };
}

export async function singleGeocode(
  voter: Voter
): Promise<GeocodedVoter | null> {
  const params = new URLSearchParams({
    street: voter.address,
    city: voter.city,
    state: voter.state,
    zip: voter.zip,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    format: "json",
  });

  try {
    const response = await fetch(
      `${CENSUS_GEOCODER_SINGLE_URL}?${params.toString()}`
    );
    if (!response.ok) return null;

    const data = await response.json();
    const matches = data?.result?.addressMatches;
    if (matches && matches.length > 0) {
      const { x: lng, y: lat } = matches[0].coordinates;
      return {
        ...voter,
        lat,
        lng,
        geocodeStatus: "matched",
      };
    }
  } catch {
    // Silently fail for individual retries
  }
  return null;
}

export async function geocodeWithRetry(
  voters: Voter[],
  onProgress?: (matched: number, total: number) => void
): Promise<{ geocoded: GeocodedVoter[]; unmatched: Voter[] }> {
  // First: batch geocode
  const { geocoded, unmatched } = await batchGeocode(voters);
  onProgress?.(geocoded.length, voters.length);

  // Then: retry unmatched individually
  const stillUnmatched: Voter[] = [];
  const retryGeocoded: GeocodedVoter[] = [];

  for (let i = 0; i < unmatched.length; i++) {
    const result = await singleGeocode(unmatched[i]);
    if (result) {
      retryGeocoded.push(result);
    } else {
      stillUnmatched.push(unmatched[i]);
    }
    onProgress?.(geocoded.length + retryGeocoded.length, voters.length);
    // Small delay to avoid rate limiting
    if (i < unmatched.length - 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return {
    geocoded: [...geocoded, ...retryGeocoded],
    unmatched: stillUnmatched,
  };
}
