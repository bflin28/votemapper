import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function GET() {
  try {
    const dataDir = path.join(process.cwd(), "data");

    let entries: string[];
    try {
      entries = await fs.readdir(dataDir);
    } catch {
      return NextResponse.json({ files: [] });
    }

    const csvFiles = entries.filter(
      (f) =>
        f.endsWith(".csv") &&
        !f.endsWith("-history.csv") &&
        f.toLowerCase().includes("tx-falls")
    );

    const files = await Promise.all(
      csvFiles.map(async (name) => {
        const stat = await fs.stat(path.join(dataDir, name));
        const sizeKB = Math.round(stat.size / 1024);
        return {
          name,
          size: sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`,
          modified: stat.mtime.toISOString().split("T")[0],
        };
      })
    );

    files.sort((a, b) => b.modified.localeCompare(a.modified));

    return NextResponse.json({ files });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to list scrapes: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 }
    );
  }
}
