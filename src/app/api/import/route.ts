import { NextRequest, NextResponse } from "next/server";
import { parseCSV, parseHistoryCSV, parseRepPrimaryCSVs, RepPrimaryData } from "@/lib/csv-parser";
import fs from "fs/promises";
import path from "path";
import type { Election, GeocodedVoter, Voter } from "@/lib/types";

function mergeHistoryMaps(target: Map<string, Election[]>, source: Map<string, Election[]>) {
  for (const [name, elections] of source.entries()) {
    const existing = target.get(name);
    if (existing) {
      existing.push(...elections);
    } else {
      target.set(name, [...elections]);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const rawFilenames = [
      ...(Array.isArray(body.filenames) ? body.filenames : []),
      ...(typeof body.filename === "string" ? [body.filename] : []),
    ].filter((name): name is string => typeof name === "string" && name.trim().length > 0);

    const filenames = [...new Set(rawFilenames.map((name) => path.basename(name)))];
    const hasInlineCsv = typeof body.csvText === "string" && body.csvText.length > 0;

    if (filenames.length === 0 && !hasInlineCsv) {
      return NextResponse.json(
        { error: "No CSV data provided" },
        { status: 400 }
      );
    }

    let inlineHistoryMap: Map<string, Election[]> | undefined;
    if (body.historyText && typeof body.historyText === "string") {
      inlineHistoryMap = parseHistoryCSV(body.historyText);
    }

    // Auto-load rep primary CSVs from data/rep_primary_data/.
    let repPrimaryData: RepPrimaryData | undefined;
    try {
      const repDir = path.join(process.cwd(), "data", "rep_primary_data");
      const files = await fs.readdir(repDir);
      const csvFiles = files.filter((f) => f.endsWith(".csv"));
      if (csvFiles.length > 0) {
        const csvSources = await Promise.all(
          csvFiles.map(async (filename) => ({
            filename,
            csvText: await fs.readFile(path.join(repDir, filename), "utf-8"),
          }))
        );
        repPrimaryData = parseRepPrimaryCSVs(csvSources);
      }
    } catch {
      // No rep_primary_data directory — that's fine
    }

    let voters: Voter[] = [];
    let geocodedVoters: GeocodedVoter[] = [];
    let errors: string[] = [];
    let nextVoterId = 1;

    if (filenames.length > 0) {
      const dataDir = path.join(process.cwd(), "data");

      for (const safeName of filenames) {
        const filePath = path.join(dataDir, safeName);
        const text = await fs.readFile(filePath, "utf-8");

        let historyMap: Map<string, Election[]> | undefined;
        if (inlineHistoryMap) {
          historyMap = new Map();
          mergeHistoryMaps(historyMap, inlineHistoryMap);
        }

        const historyName = safeName.replace(/\.csv$/, "-history.csv");
        const historyPath = path.join(dataDir, historyName);
        try {
          const historyText = await fs.readFile(historyPath, "utf-8");
          const parsedHistory = parseHistoryCSV(historyText);
          if (!historyMap) {
            historyMap = new Map();
          }
          mergeHistoryMaps(historyMap, parsedHistory);
        } catch {
          // No companion history file — that's fine.
        }

        const parsed = parseCSV(text, historyMap, repPrimaryData);
        if (parsed.errors.length > 0) {
          errors.push(...parsed.errors.map((err) => `${safeName}: ${err}`));
        }

        const idMap = new Map<string, string>();
        for (const voter of parsed.voters) {
          const id = `voter-${nextVoterId++}`;
          idMap.set(voter.id, id);
          voters.push({ ...voter, id });
        }

        for (const geocoded of parsed.geocodedVoters) {
          const id = idMap.get(geocoded.id);
          if (!id) continue;
          geocodedVoters.push({ ...geocoded, id });
        }
      }
    } else {
      const parsed = parseCSV(body.csvText, inlineHistoryMap, repPrimaryData);
      voters = parsed.voters;
      geocodedVoters = parsed.geocodedVoters;
      errors = parsed.errors;
    }

    // Party breakdown for debugging
    const rCount = voters.filter((v) => v.primaryParty === "R").length;
    const dCount = voters.filter((v) => v.primaryParty === "D").length;
    const unknownCount = voters.filter((v) => !v.primaryParty).length;

    return NextResponse.json({
      voters,
      geocodedVoters,
      errors,
      count: voters.length,
      repPrimaryCount: repPrimaryData?.names.size ?? 0,
      rCount,
      dCount,
      unknownCount,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to parse CSV: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 }
    );
  }
}
