"use client";

import { useVoterStore } from "@/store/voter-store";
import { ENGAGEMENT_COLORS, EngagementTier } from "@/lib/scoring";
import { PARTY_COLORS, planDayColor } from "@/lib/constants";

const TIER_LABELS: { tier: EngagementTier; label: string }[] = [
  { tier: "high", label: "High" },
  { tier: "medium", label: "Medium" },
  { tier: "low", label: "Low" },
  { tier: "none", label: "No history" },
];

const SIZE_LABELS = [
  { count: 1, size: 10 },
  { count: 2, size: 14 },
  { count: "3+", size: 18 },
];

function EngagementLegend() {
  return (
    <div className="leaflet-bottom leaflet-right" style={{ pointerEvents: "auto" }}>
      <div className="leaflet-control m-2 rounded-lg border border-zinc-200 bg-white p-3 shadow-md">
        <h3 className="text-xs font-semibold text-zinc-700 mb-2">Engagement</h3>

        <div className="flex flex-col gap-1 mb-3">
          {TIER_LABELS.map(({ tier, label }) => (
            <div key={tier} className="flex items-center gap-2 text-xs">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: ENGAGEMENT_COLORS[tier] }}
              />
              <span className="text-zinc-600">{label}</span>
            </div>
          ))}
        </div>

        <h3 className="text-xs font-semibold text-zinc-700 mb-2">Household size</h3>
        <div className="flex items-end gap-3 mb-3">
          {SIZE_LABELS.map(({ count, size }) => (
            <div key={String(count)} className="flex flex-col items-center gap-1">
              <span
                className="inline-block rounded-full bg-zinc-400"
                style={{ width: size, height: size }}
              />
              <span className="text-[10px] text-zinc-500">{count}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span
            className="inline-block h-3 w-3 rounded-full bg-emerald-500"
            style={{ border: "2px solid #f59e0b" }}
          />
          <span className="text-zinc-600">High-value household</span>
        </div>
      </div>
    </div>
  );
}

const PARTY_LABELS: { key: string; label: string }[] = [
  { key: "R", label: "Republican" },
  { key: "D", label: "Democrat / Other" },
  { key: "unknown", label: "Unknown" },
];

function PartyLegend() {
  return (
    <div className="leaflet-bottom leaflet-right" style={{ pointerEvents: "auto" }}>
      <div className="leaflet-control m-2 rounded-lg border border-zinc-200 bg-white p-3 shadow-md">
        <h3 className="text-xs font-semibold text-zinc-700 mb-2">Party</h3>

        <div className="flex flex-col gap-1 mb-3">
          {PARTY_LABELS.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2 text-xs">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: PARTY_COLORS[key] }}
              />
              <span className="text-zinc-600">{label}</span>
            </div>
          ))}
        </div>

        <h3 className="text-xs font-semibold text-zinc-700 mb-2">Household size</h3>
        <div className="flex items-end gap-3">
          {SIZE_LABELS.map(({ count, size }) => (
            <div key={String(count)} className="flex flex-col items-center gap-1">
              <span
                className="inline-block rounded-full bg-zinc-400"
                style={{ width: size, height: size }}
              />
              <span className="text-[10px] text-zinc-500">{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WalkerLegend() {
  const { routes, selectedWalkerId, setSelectedWalkerId } = useVoterStore();

  return (
    <div className="leaflet-bottom leaflet-right" style={{ pointerEvents: "auto" }}>
      <div className="leaflet-control m-2 rounded-lg border border-zinc-200 bg-white p-3 shadow-md">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-700">Walkers</h3>
          {selectedWalkerId !== null && (
            <button
              onClick={() => setSelectedWalkerId(null)}
              className="text-xs text-indigo-600 hover:text-indigo-800"
            >
              Show all
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1">
          {routes.map((route) => (
            <button
              key={route.walkerId}
              onClick={() =>
                setSelectedWalkerId(
                  selectedWalkerId === route.walkerId ? null : route.walkerId
                )
              }
              className={`flex items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${
                selectedWalkerId === route.walkerId
                  ? "bg-zinc-100 font-medium"
                  : "hover:bg-zinc-50"
              }`}
            >
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: route.color }}
              />
              <span className="text-zinc-700">#{route.walkerId + 1}</span>
              <span className="text-zinc-400">
                {route.doorCount}d / {route.totalDistanceKm}km
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlanLegend() {
  const { finalizedPlan, setFinalizedPlanActiveDay } = useVoterStore();

  if (!finalizedPlan) return null;

  const dayNumbers = Array.from({ length: finalizedPlan.days }, (_, i) => i + 1);

  return (
    <div className="leaflet-bottom leaflet-right" style={{ pointerEvents: "auto" }}>
      <div className="leaflet-control m-2 rounded-lg border border-zinc-200 bg-white p-3 shadow-md">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-700">Campaign Plan</h3>
          <span className="text-[10px] text-zinc-400">{Object.keys(finalizedPlan.assignments).length} voters</span>
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => setFinalizedPlanActiveDay("all")}
            className={`rounded px-2 py-1 text-left text-xs transition-colors ${
              finalizedPlan.activeDay === "all"
                ? "bg-zinc-100 font-medium text-zinc-800"
                : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            All Days
          </button>
          {dayNumbers.map((day) => (
            <button
              key={day}
              onClick={() => setFinalizedPlanActiveDay(day)}
              className={`flex items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${
                finalizedPlan.activeDay === day
                  ? "bg-zinc-100 font-medium text-zinc-800"
                  : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: planDayColor(day) }}
              />
              <span>Day {day}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MapLegend() {
  const { routes, geocodedVoters, colorMode, finalizedPlan } = useVoterStore();

  if (finalizedPlan && Object.keys(finalizedPlan.assignments).length > 0) {
    return <PlanLegend />;
  }

  if (routes.length > 0) return <WalkerLegend />;
  if (geocodedVoters.length > 0) {
    return colorMode === "party" ? <PartyLegend /> : <EngagementLegend />;
  }
  return null;
}
