import Papa from "papaparse";
import { Voter, GeocodedVoter, Election } from "./types";

const COLUMN_ALIASES: Record<string, string[]> = {
  firstName: ["first_name", "firstname", "first name", "fname", "first"],
  lastName: ["last_name", "lastname", "last name", "lname", "last"],
  name: ["name", "full_name", "full name", "voter_name"],
  address: ["address", "street", "street_address", "street address", "addr", "residential address"],
  compositeAddress: ["registered address", "detail address", "full_address", "full address"],
  city: ["city", "town", "municipality"],
  state: ["state", "st"],
  zip: ["zip", "zipcode", "zip_code", "zip code", "postal", "postal_code"],
  party: ["party", "party_affiliation", "party affiliation", "political_party"],
  age: ["age", "voter_age", "dob/age"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lng", "lon", "long"],
  voteHistory: ["vote history", "vote_history", "votehistory", "elections"],
  lastVoted: ["last voted", "last_voted", "lastvoted", "last vote date"],
  registrationStatus: ["registration status", "registration_status", "registrationstatus", "reg_status", "reg status"],
};

const NAME_SUFFIXES = /,?\s+(JR|SR|II|III|IV|V)\.?$/i;
const SUFFIX_WORDS = new Set(["JR", "SR", "II", "III", "IV", "V"]);

/** Normalize a name for cross-file matching: strip suffixes, uppercase, sort words alphabetically */
export function normalizeName(name: string): string {
  const cleaned = name.toUpperCase().replace(/[,]/g, " ");
  const words = cleaned.split(/\s+/).filter((w) => w && !SUFFIX_WORDS.has(w));
  words.sort();
  return words.join(" ");
}

/** Parse county-format rep primary CSVs and return a Set of normalized voter names */
export function parseRepPrimaryCSVs(csvTexts: string[]): Set<string> {
  const names = new Set<string>();
  for (const text of csvTexts) {
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
    });
    const rows = result.data as Record<string, string>[];
    for (const row of rows) {
      const voterName = (row["Voter Name"] || "").trim();
      if (voterName) {
        names.add(normalizeName(voterName));
      }
    }
  }
  return names;
}

function parseName(raw: string): { firstName: string; lastName: string } {
  const cleaned = raw.trim().replace(NAME_SUFFIXES, "");
  const parts = cleaned.split(/\s+/);
  if (parts.length <= 1) return { firstName: "", lastName: parts[0] || "" };
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(" ");
  return { firstName, lastName };
}

function parseCompositeAddress(raw: string): { street: string; city: string; state: string; zip: string } | null {
  const commaIdx = raw.indexOf(",");
  if (commaIdx === -1) return null;
  const street = raw.slice(0, commaIdx).trim();
  const rest = raw.slice(commaIdx + 1).trim();
  const match = rest.match(/^(.*)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  if (!match) return null;
  return { street, city: match[1].trim(), state: match[2], zip: match[3] };
}

function findColumn(headers: string[], aliases: string[]): string | null {
  const normalized = headers.map((h) => h.toLowerCase().trim());
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

/** Parse a companion -history.csv into a map of voter name → elections */
export function parseHistoryCSV(csvText: string): Map<string, Election[]> {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  const rows = result.data as Record<string, string>[];
  const map = new Map<string, Election[]>();

  for (const row of rows) {
    const name = (row["Name"] || "").trim().toUpperCase();
    const date = (row["Election Date"] || "").trim();
    const type = (row["Election"] || "").trim();
    if (!name || !date) continue;
    const election: Election = { date, type };
    const existing = map.get(name);
    if (existing) {
      existing.push(election);
    } else {
      map.set(name, [election]);
    }
  }

  return map;
}

export function parseCSV(csvText: string, historyMap?: Map<string, Election[]>, repPrimaryNames?: Set<string>): { voters: Voter[]; geocodedVoters: GeocodedVoter[]; errors: string[] } {
  const errors: string[] = [];

  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  if (result.errors.length > 0) {
    errors.push(
      ...result.errors.map((e) => `Row ${e.row}: ${e.message}`)
    );
  }

  const headers = result.meta.fields || [];
  const columnMap: Record<string, string | null> = {};

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    columnMap[field] = findColumn(headers, aliases);
  }

  const hasCompositeName = !columnMap.firstName && !columnMap.lastName && !!columnMap.name;
  const hasCompositeAddress = !columnMap.address && !!columnMap.compositeAddress;
  if (hasCompositeAddress) columnMap.address = columnMap.compositeAddress;

  if (!columnMap.address) {
    errors.push("Could not find an address column in the CSV");
    return { voters: [], geocodedVoters: [], errors };
  }

  const voters: Voter[] = [];
  const geocodedVoters: GeocodedVoter[] = [];
  const rows = result.data as Record<string, string>[];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawAddress = columnMap.address ? row[columnMap.address]?.trim() : "";

    if (!rawAddress) {
      errors.push(`Row ${i + 1}: Missing address`);
      continue;
    }

    let firstName = columnMap.firstName ? row[columnMap.firstName]?.trim() || "" : "";
    let lastName = columnMap.lastName ? row[columnMap.lastName]?.trim() || "" : "";
    if (hasCompositeName && columnMap.name) {
      const parsed = parseName(row[columnMap.name] || "");
      firstName = parsed.firstName;
      lastName = parsed.lastName;
    }

    let address = rawAddress;
    let city = columnMap.city ? row[columnMap.city]?.trim() || "" : "";
    let state = columnMap.state ? row[columnMap.state]?.trim() || "" : "";
    let zip = columnMap.zip ? row[columnMap.zip]?.trim() || "" : "";
    if (hasCompositeAddress) {
      const parsed = parseCompositeAddress(rawAddress);
      if (parsed) {
        address = parsed.street;
        city = parsed.city;
        state = parsed.state;
        zip = parsed.zip;
      }
    }

    // Require city/state/zip for geocoding — skip row if missing and not composite
    if (!hasCompositeAddress && (!city || !state || !zip)) {
      const missing = [!city && "city", !state && "state", !zip && "zip"].filter(Boolean).join(", ");
      errors.push(`Row ${i + 1}: Missing ${missing} — no default available`);
      continue;
    }

    const voteHistoryRaw = columnMap.voteHistory ? row[columnMap.voteHistory]?.trim() || "" : "";
    const voteCount = (voteHistoryRaw.match(/\+/g) || []).length;
    const lastVotedRaw = columnMap.lastVoted ? row[columnMap.lastVoted]?.trim() || null : null;

    // Look up per-election history from companion file
    let elections: Election[] = [];
    if (historyMap) {
      // Join on full name (composite or first+last)
      const fullName = hasCompositeName && columnMap.name
        ? (row[columnMap.name] || "").trim().toUpperCase()
        : `${firstName} ${lastName}`.trim().toUpperCase();
      elections = historyMap.get(fullName) || [];
    }

    // Determine primary party affiliation from rep primary cross-reference
    let primaryParty: "R" | "D" | null = null;
    if (repPrimaryNames) {
      const fullName = hasCompositeName && columnMap.name
        ? (row[columnMap.name] || "").trim()
        : `${firstName} ${lastName}`.trim();
      const normalized = normalizeName(fullName);
      if (repPrimaryNames.has(normalized)) {
        primaryParty = "R";
      } else if (elections.some((e) => /primary/i.test(e.type))) {
        primaryParty = "D";
      }
    }

    const voter: Voter = {
      id: `voter-${i + 1}`,
      firstName,
      lastName,
      address,
      city,
      state,
      zip,
      party: (columnMap.party ? row[columnMap.party]?.trim() : undefined) || primaryParty || undefined,
      age: columnMap.age ? parseInt(row[columnMap.age]) || undefined : undefined,
      voteCount,
      lastVoted: lastVotedRaw || null,
      elections,
      registrationStatus: columnMap.registrationStatus ? row[columnMap.registrationStatus]?.trim() || null : null,
      primaryParty,
    };

    voters.push(voter);

    const latStr = columnMap.latitude ? row[columnMap.latitude]?.trim() : "";
    const lngStr = columnMap.longitude ? row[columnMap.longitude]?.trim() : "";
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      geocodedVoters.push({
        ...voter,
        lat,
        lng,
        geocodeStatus: "matched",
      });
    }
  }

  return { voters, geocodedVoters, errors };
}
