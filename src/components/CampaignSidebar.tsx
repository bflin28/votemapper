"use client";

import { useMemo, useState } from "react";
import { useVoterStore, VoterFilters } from "@/store/voter-store";
import type { CampaignRow } from "@/lib/db";
import { getTopElections, shortElectionLabel } from "@/lib/scoring";
import WalkerList from "./Sidebar/WalkerList";

type Tab = "walkers" | "filters";

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
    <div className="flex rounded-md border border-slate-200 overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-2 py-1.5 text-[11px] font-medium transition-colors ${
            value === opt.value
              ? "bg-blue-600 text-white"
              : "bg-white text-slate-500 hover:bg-slate-50"
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
      <label className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selectedSet.has(opt);
          return (
            <button
              key={opt}
              onClick={() => toggle(opt)}
              className={`rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
                active
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
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
      <label className="mb-1.5 block text-xs font-semibold text-slate-700">
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
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {shortElectionLabel(e)}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <p className="mt-1.5 text-[10px] text-slate-400">
          Showing voters who participated in all selected elections
        </p>
      )}
    </div>
  );
}

export default function CampaignSidebar({ campaign }: { campaign: CampaignRow }) {
  const [activeTab, setActiveTab] = useState<Tab>("walkers");
  const {
    voters,
    geocodedVoters,
    routes,
    filters,
    setFilters,
    clearFilters,
  } = useVoterStore();

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.registrationStatus.length > 0) count++;
    if (filters.selectedElections.length > 0) count++;
    if (filters.engagementTier !== "all") count++;
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

  const areaLabel = campaign.precinct
    ? `${campaign.precinct}, ${campaign.county}, ${campaign.state}`
    : `${campaign.county}, ${campaign.state}`;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "walkers", label: "Walkers" },
    { id: "filters", label: "Filters", badge: activeFilterCount },
  ];

  return (
    <div className="flex h-full w-80 flex-col border-r border-slate-200 bg-white">
      {/* Header */}
      <div className="border-b border-slate-200 px-4 py-3">
        <h1 className="text-sm font-semibold text-slate-900">{campaign.title}</h1>
        <p className="text-xs text-slate-400">{areaLabel}</p>
        <div className="mt-2 flex gap-3 text-[11px] text-slate-500">
          <span>{geocodedVoters.length} voters</span>
          <span>{routes.length} routes</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "walkers" && <WalkerList />}

        {activeTab === "filters" && (
          <div className="flex flex-col gap-4 text-xs">
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
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
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
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-500 transition-colors hover:bg-slate-50"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {routes.length > 0 && (
        <div className="border-t border-slate-200 p-3">
          <button
            onClick={handleExportCSV}
            className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Export CSV
          </button>
        </div>
      )}
    </div>
  );
}
