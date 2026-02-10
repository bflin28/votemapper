import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const voterFile = formData.get("voterFile") as File | null;
    const historyFile = formData.get("historyFile") as File | null;

    if (!voterFile) {
      return NextResponse.json(
        { error: "No voter file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!voterFile.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json(
        { error: "Voter file must be a .csv file" },
        { status: 400 }
      );
    }

    // Validate file size (10MB limit)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (voterFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Voter file exceeds 10MB limit" },
        { status: 400 }
      );
    }

    if (historyFile) {
      if (!historyFile.name.toLowerCase().endsWith(".csv")) {
        return NextResponse.json(
          { error: "History file must be a .csv file" },
          { status: 400 }
        );
      }
      if (historyFile.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "History file exceeds 10MB limit" },
          { status: 400 }
        );
      }
    }

    const voterCsv = await voterFile.text();
    const historyCsv = historyFile ? await historyFile.text() : null;

    // Quick count of non-empty lines (minus header)
    const lines = voterCsv.split("\n").filter((l) => l.trim().length > 0);
    const voterCount = Math.max(0, lines.length - 1);

    return NextResponse.json({
      voterCsv,
      historyCsv,
      voterCount,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
