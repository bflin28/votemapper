"use client";

import { useMemo } from "react";
import { useVoterStore } from "@/store/voter-store";
import { getTopElections, shortElectionLabel } from "@/lib/scoring";

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-md border border-zinc-200 overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-2 py-1.5 text-[11px] font-medium transition-colors ${
            value === opt.value
              ? "bg-indigo-600 text-white"
              : "bg-white text-zinc-500 hover:bg-zinc-50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ToggleFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const selectedSet = new Set(selected);

  function toggle(value: string) {
    if (selectedSet.has(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <div>
      <label className="mb-1.5 block font-semibold text-zinc-700">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selectedSet.has(opt);
          return (
            <button
              key={opt}
              onClick={() => toggle(opt)}
              className={`rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
                active
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ElectionFilter({
  voters,
  selected,
  onChange,
}: {
  voters: import("@/lib/types").Voter[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const elections = useMemo(() => getTopElections(voters, 12), [voters]);
  const selectedSet = new Set(selected);

  function toggle(date: string) {
    if (selectedSet.has(date)) {
      onChange(selected.filter((d) => d !== date));
    } else {
      onChange([...selected, date]);
    }
  }

  if (elections.length === 0) return null;

  return (
    <div>
      <label className="mb-1.5 block font-semibold text-zinc-700">
        Voted In
      </label>
      <div className="flex flex-wrap gap-1.5">
        {elections.map((e) => {
          const active = selectedSet.has(e.date);
          return (
            <button
              key={e.date}
              onClick={() => toggle(e.date)}
              className={`rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
                active
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              }`}
            >
              {shortElectionLabel(e)}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <p className="mt-1.5 text-[10px] text-zinc-400">
          Showing voters who participated in all selected elections
        </p>
      )}
    </div>
  );
}

export default function Sidebar() {
  const {
    voters,
    geocodedVoters,
    unmatchedVoters,
    routes,
    progress,
    error,
    importErrors,
    filters,
    setFilters,
    clearFilters,
    reset,
  } = useVoterStore();

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.registrationStatus.length > 0) count++;
    if (filters.selectedElections.length > 0) count++;
    if (filters.engagementTier !== "all") count++;
    if (filters.primaryParty !== "all") count++;
    return count;
  }, [filters]);

  function handleExportCSV() {
    if (routes.length === 0) return;

    const header = "walker,order,first_name,last_name,address,city,state,zip,lat,lng\n";
    const rows = routes.flatMap((route) =>
      route.orderedVoters.map((v, idx) =>
        [
          route.walkerId + 1,
          idx + 1,
          v.firstName,
          v.lastName,
          `"${v.address}"`,
          v.city,
          v.state,
          v.zip,
          v.lat,
          v.lng,
        ].join(",")
      )
    );

    const csv = header + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "walker-assignments.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full w-80 flex-col border-r border-zinc-200 bg-white">
      {/* Header */}
      <div className="border-b border-zinc-200 px-4 py-3">
        <h1 className="text-sm font-semibold text-zinc-900">VoteMapper</h1>
        <p className="text-xs text-zinc-400">
          Optimal door-knocking routes
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Error banner */}
        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-600">
            {error}
          </div>
        )}

        {/* Progress banner */}
        {progress && (
          <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-600">
            Processing: {progress.current} / {progress.total}
          </div>
        )}

        {voters.length > 0 ? (
          <div className="mb-4 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
            <p className="text-xs text-zinc-600">
              {voters.length} voters loaded
              {importErrors.length > 0 && (
                <span className="text-amber-500">
                  {" "}({importErrors.length} warnings)
                </span>
              )}
            </p>
            {geocodedVoters.length > 0 && (
              <p className="mt-1 text-[11px] text-zinc-500">
                Geocoded: {geocodedVoters.length}/{voters.length} ({((geocodedVoters.length / voters.length) * 100).toFixed(0)}%)
                {unmatchedVoters.length > 0 && (
                  <span className="text-amber-500"> &middot; {unmatchedVoters.length} unmatched</span>
                )}
              </p>
            )}
          </div>
        ) : (
          <div className="mb-4 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
            Select campaign data in the Plan tab to load voters.
          </div>
        )}

        <div className="flex flex-col gap-4 text-xs">
          {voters.length === 0 ? (
            <p className="text-zinc-400">Load campaign data to enable filters.</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Filters
                </h2>
                {activeFilterCount > 0 && (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </div>

              <div>
                <label className="mb-1.5 block font-semibold text-zinc-700">
                  Party
                </label>
                <SegmentedControl
                  options={[
                    { label: "All", value: "all" as const },
                    { label: "Rep", value: "R" as const },
                    { label: "Dem/Other", value: "D" as const },
                    { label: "Unknown", value: "unknown" as const },
                  ]}
                  value={filters.primaryParty}
                  onChange={(v) => setFilters({ primaryParty: v })}
                />
              </div>

              <ToggleFilter
                label="Registration Status"
                options={["Active", "Suspended", "Cancelled"]}
                selected={filters.registrationStatus}
                onChange={(v) => setFilters({ registrationStatus: v })}
              />

              <ElectionFilter
                voters={voters}
                selected={filters.selectedElections}
                onChange={(v) => setFilters({ selectedElections: v })}
              />

              <div>
                <label className="mb-1.5 block font-semibold text-zinc-700">
                  Engagement
                </label>
                <SegmentedControl
                  options={[
                    { label: "All", value: "all" as const },
                    { label: "High", value: "high" as const },
                    { label: "Med", value: "medium" as const },
                    { label: "Low", value: "low" as const },
                    { label: "None", value: "none" as const },
                  ]}
                  value={filters.engagementTier}
                  onChange={(v) => setFilters({ engagementTier: v })}
                />
              </div>

              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-50"
                >
                  Clear all filters
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex gap-2 border-t border-zinc-200 p-3">
        {routes.length > 0 && (
          <button
            onClick={handleExportCSV}
            className="flex-1 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            Export CSV
          </button>
        )}
        <button
          onClick={reset}
          className="rounded-md px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-600"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
