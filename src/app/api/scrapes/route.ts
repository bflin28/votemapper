import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { parseScrapeMetadata, precinctSortValue } from "@/lib/scrape-utils";
import Papa from "papaparse";

interface ScrapeFile {
  name: string;
  county: string;
  countyKey: string;
  precinct: string;
  label: string;
  size: string;
  modified: string;
  voterCount: number;
}

function countVoters(csvText: string): number {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  return Array.isArray(parsed.data) ? parsed.data.length : 0;
}

export async function GET() {
  try {
    const dataDir = path.join(process.cwd(), "data");

    let entries: string[];
    try {
      entries = await fs.readdir(dataDir);
    } catch {
      return NextResponse.json({ files: [], counties: [] });
    }

    const csvFiles = entries.filter((f) => Boolean(parseScrapeMetadata(f)));

    const files: ScrapeFile[] = await Promise.all(
      csvFiles.map(async (name) => {
        const filePath = path.join(dataDir, name);
        const [stat, text] = await Promise.all([
          fs.stat(filePath),
          fs.readFile(filePath, "utf-8"),
        ]);
        const metadata = parseScrapeMetadata(name)!;
        const sizeKB = Math.round(stat.size / 1024);
        return {
          name,
          county: metadata.countyName,
          countyKey: metadata.countySlug,
          precinct: metadata.precinct,
          label: `${metadata.countyName} County - Precinct ${metadata.precinct}`,
          size: sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`,
          modified: stat.mtime.toISOString().split("T")[0],
          voterCount: countVoters(text),
        };
      })
    );

    files.sort((a, b) => {
      if (a.countyKey !== b.countyKey) {
        return a.countyKey.localeCompare(b.countyKey);
      }
      return precinctSortValue(a.precinct) - precinctSortValue(b.precinct);
    });

    const countyMap = new Map<
      string,
      { county: string; countyKey: string; precincts: ScrapeFile[] }
    >();

    for (const file of files) {
      const existing = countyMap.get(file.countyKey);
      if (existing) {
        existing.precincts.push(file);
      } else {
        countyMap.set(file.countyKey, {
          county: file.county,
          countyKey: file.countyKey,
          precincts: [file],
        });
      }
    }

    const counties = Array.from(countyMap.values()).sort((a, b) =>
      a.county.localeCompare(b.county)
    );

    return NextResponse.json({ files, counties });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to list scrapes: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 }
    );
  }
}
