import type { PrimaryVotingMethod, RepPrimaryVoteRecord, Voter } from "./types";

const YEAR_PATTERN = /(19|20)\d{2}/g;

function normalizeMethodToken(value: string): string {
  return value.toUpperCase().replace(/[^A-Z]/g, " ").trim();
}

export function parsePrimaryVotingMethod(value: string | null | undefined): PrimaryVotingMethod | null {
  if (!value) return null;
  const token = normalizeMethodToken(value);
  if (token.includes("EARLY") || token.split(/\s+/).includes("EV")) return "EV";
  if (token.includes("ELECTION DAY") || token.split(/\s+/).includes("ED")) return "ED";
  if (token.includes("ABSENTEE") || token.split(/\s+/).includes("AV")) return "AV";
  return null;
}

export function parseYearFromText(value: string | null | undefined): number | null {
  if (!value) return null;
  const matches = value.match(YEAR_PATTERN);
  if (!matches || matches.length === 0) return null;
  const year = Number(matches[matches.length - 1]);
  return Number.isFinite(year) ? year : null;
}

export function parseYearFromFilename(filename: string): number | null {
  return parseYearFromText(filename);
}

export function selectedElectionYears(selectedElections: string[]): Set<number> {
  const years = new Set<number>();
  for (const election of selectedElections) {
    const year = parseYearFromText(election);
    if (year != null) {
      years.add(year);
    } else {
      const parsed = new Date(election);
      if (!Number.isNaN(parsed.getTime())) {
        years.add(parsed.getFullYear());
      }
    }
  }
  return years;
}

export function dedupePrimaryVoteRecords(records: RepPrimaryVoteRecord[]): RepPrimaryVoteRecord[] {
  const keys = new Set<string>();
  const deduped: RepPrimaryVoteRecord[] = [];
  for (const record of records) {
    const key = `${record.year}:${record.method}`;
    if (keys.has(key)) continue;
    keys.add(key);
    deduped.push(record);
  }
  deduped.sort((a, b) => a.year - b.year);
  return deduped;
}

export function matchesPrimaryMethodFilter(
  voter: Pick<Voter, "repPrimaryVotes">,
  selectedMethods: PrimaryVotingMethod[],
  selectedElections: string[]
): boolean {
  if (selectedMethods.length === 0) return true;

  const records = voter.repPrimaryVotes ?? [];
  if (records.length === 0) return false;

  const allowedMethods = new Set(selectedMethods);
  const scopedYears = selectedElectionYears(selectedElections);
  if (scopedYears.size > 0) {
    for (const year of scopedYears) {
      const matchedYear = records.some(
        (record) => record.year === year && allowedMethods.has(record.method)
      );
      if (!matchedYear) return false;
    }
    return true;
  }

  return records.some((record) => allowedMethods.has(record.method));
}
