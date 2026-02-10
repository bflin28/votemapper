import { Election, GeocodedVoter, Household, Voter } from "./types";

export type EngagementTier = "none" | "low" | "medium" | "high";

export const ENGAGEMENT_COLORS: Record<EngagementTier, string> = {
  none: "#d1d5db",
  low: "#93c5fd",
  medium: "#6366f1",
  high: "#10b981",
};

export function voterScore(voter: { voteCount?: number; lastVoted?: string | null }): number {
  const count = voter.voteCount || 0;
  const frequency = Math.min(count / 12, 1);

  let recency = 0;
  if (voter.lastVoted) {
    const lastDate = new Date(voter.lastVoted);
    if (!isNaN(lastDate.getTime())) {
      const yearsSince = (Date.now() - lastDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      recency = Math.max(0, 1 - yearsSince / 4);
    }
  }

  return 0.5 * frequency + 0.5 * recency;
}

export function engagementTier(score: number): EngagementTier {
  if (score <= 0) return "none";
  if (score < 0.25) return "low";
  if (score < 0.5) return "medium";
  return "high";
}

export function groupHouseholds(voters: GeocodedVoter[]): Household[] {
  const groups = new Map<string, GeocodedVoter[]>();

  for (const voter of voters) {
    const key = `${voter.address.toLowerCase().trim()}|${voter.city.toLowerCase().trim()}|${voter.zip.trim()}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(voter);
    } else {
      groups.set(key, [voter]);
    }
  }

  const households: Household[] = [];
  let idx = 0;

  for (const [, members] of groups) {
    const scores = members.map((m) => voterScore(m));
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const first = members[0];

    households.push({
      id: `hh-${idx++}`,
      address: first.address,
      city: first.city,
      state: first.state,
      zip: first.zip,
      lat: first.lat,
      lng: first.lng,
      members,
      score: avgScore,
      memberCount: members.length,
    });
  }

  return households;
}

export function isHighValueHousehold(hh: Household): boolean {
  return hh.score >= 0.6 && hh.memberCount >= 2;
}

/** Collect all unique elections across voters (deduped by date), return the N most recent */
export function getTopElections(voters: Voter[], n = 5): Election[] {
  const byDate = new Map<string, Election>();
  for (const voter of voters) {
    for (const e of voter.elections ?? []) {
      if (!byDate.has(e.date)) {
        byDate.set(e.date, e);
      }
    }
  }

  return Array.from(byDate.values())
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, n);
}

/** Format election as short label like "General 11/22" */
export function shortElectionLabel(election: Election): string {
  const d = new Date(election.date);
  if (isNaN(d.getTime())) return election.type ? `${election.type} ${election.date}` : election.date;
  const month = d.getMonth() + 1;
  const year = String(d.getFullYear()).slice(-2);
  const dateStr = `${month}/${year}`;
  return election.type ? `${election.type} ${dateStr}` : dateStr;
}
