export interface ScrapeMetadata {
  countySlug: string;
  countyName: string;
  precinct: string;
}

function titleCaseWords(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function parseScrapeMetadata(filename: string): ScrapeMetadata | null {
  const lower = filename.toLowerCase();
  if (!lower.endsWith(".csv") || lower.endsWith("-history.csv")) return null;

  const stem = lower.replace(/\.csv$/, "");

  // New schema: falls-county-precinct-101.csv
  const newSchema = stem.match(/^([a-z0-9-]+)-county-precinct-(\d+)$/);
  if (newSchema) {
    const countySlug = newSchema[1];
    return {
      countySlug,
      countyName: titleCaseWords(countySlug),
      precinct: newSchema[2],
    };
  }

  // Legacy schema: voteref-tx-falls-101.csv
  const legacySchema = stem.match(/^voteref-tx-([a-z0-9-]+)-(\d+)$/);
  if (legacySchema) {
    const countySlug = legacySchema[1];
    return {
      countySlug,
      countyName: titleCaseWords(countySlug),
      precinct: legacySchema[2],
    };
  }

  return null;
}

export function precinctSortValue(precinct: string): number {
  const parsed = Number(precinct);
  if (Number.isFinite(parsed)) return parsed;
  return Number.MAX_SAFE_INTEGER;
}
