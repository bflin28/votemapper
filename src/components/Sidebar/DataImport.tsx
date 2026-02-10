"use client";

import { useEffect, useRef, useState } from "react";
import { useVoterStore } from "@/store/voter-store";

interface ScrapeFile {
  name: string;
  size: string;
  modified: string;
}

export default function DataImport() {
  const [scrapes, setScrapes] = useState<ScrapeFile[]>([]);
  const [loadingScrapes, setLoadingScrapes] = useState(true);
  const [selectedScrapes, setSelectedScrapes] = useState<string[]>([]);
  const requestIdRef = useRef(0);
  const selectedScrapesRef = useRef<string[]>([]);
  const { setVoters, setGeocodedVoters, setStage, setError, stage } = useVoterStore();

  const isImporting = stage === "importing";

  useEffect(() => {
    fetch("/api/scrapes")
      .then((res) => res.json())
      .then((data) => setScrapes(data.files ?? []))
      .catch(() => setScrapes([]))
      .finally(() => setLoadingScrapes(false));
  }, []);

  async function handleImportResult(res: Response, requestId: number): Promise<void> {
    const data = await res.json();
    if (requestId !== requestIdRef.current) return;

    if (!res.ok) {
      setError(data.error || "Import failed");
      setStage("idle");
      return;
    }

    setVoters(data.voters, data.errors);

    if (data.geocodedVoters?.length > 0) {
      const geocodedIds = new Set(data.geocodedVoters.map((v: { id: string }) => v.id));
      const unmatched = data.voters.filter((v: { id: string }) => !geocodedIds.has(v.id));
      setGeocodedVoters(data.geocodedVoters, unmatched);
    }
  }

  async function applySelection(nextSelected: string[]) {
    selectedScrapesRef.current = nextSelected;
    setSelectedScrapes(nextSelected);

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (nextSelected.length === 0) {
      setError(null);
      setVoters([], []);
      setStage("idle");
      return;
    }

    setStage("importing");
    setError(null);

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filenames: nextSelected }),
      });
      await handleImportResult(res, requestId);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : "Import failed");
      setStage("idle");
    }
  }

  function toggleScrapeSelection(name: string) {
    const current = selectedScrapesRef.current;
    const next = current.includes(name)
      ? current.filter((existing) => existing !== name)
      : [...current, name];
    void applySelection(next);
  }

  function selectAllScrapes() {
    void applySelection(scrapes.map((file) => file.name));
  }

  function clearSelection() {
    void applySelection([]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-zinc-500">TX Falls CSVs</label>
        {scrapes.length > 0 && (
          <div className="flex items-center gap-2 text-[11px]">
            <button
              type="button"
              onClick={selectAllScrapes}
              disabled={selectedScrapes.length === scrapes.length}
              className="text-zinc-500 hover:text-zinc-700 disabled:cursor-not-allowed disabled:text-zinc-300"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={selectedScrapes.length === 0}
              className="text-zinc-500 hover:text-zinc-700 disabled:cursor-not-allowed disabled:text-zinc-300"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {loadingScrapes ? (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-center text-xs text-zinc-400">
          Loading scrapes...
        </div>
      ) : scrapes.length > 0 ? (
        <div className="max-h-56 overflow-y-auto rounded-md border border-zinc-200 bg-white">
          {scrapes.map((file) => {
            const selected = selectedScrapes.includes(file.name);
            return (
              <button
                key={file.name}
                type="button"
                onClick={() => toggleScrapeSelection(file.name)}
                className={`flex w-full items-center justify-between gap-3 border-b border-zinc-100 px-3 py-2 text-left transition-colors last:border-b-0 ${
                  selected ? "bg-indigo-50" : "hover:bg-zinc-50"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <input
                    type="checkbox"
                    readOnly
                    checked={selected}
                    className="h-3.5 w-3.5 rounded border-zinc-300 text-indigo-600"
                  />
                  <span className="truncate text-xs font-medium text-zinc-700">{file.name}</span>
                </span>
                <span className="shrink-0 text-[10px] text-zinc-400">
                  {file.size} | {file.modified}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-center text-xs text-zinc-400">
          No TX Falls CSV files found in `data/`.
        </div>
      )}

      <p className="text-[11px] text-zinc-400">
        {isImporting
          ? `Importing ${selectedScrapes.length} CSV${selectedScrapes.length !== 1 ? "s" : ""}...`
          : "Selecting a CSV imports it immediately."}
      </p>
    </div>
  );
}
