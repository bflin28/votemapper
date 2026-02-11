"use client";

import { useState, useMemo } from "react";
import { useVoterStore } from "@/store/voter-store";
import { Election, GeocodedVoter, Voter } from "@/lib/types";
import {
  voterScore,
  engagementTier,
  ENGAGEMENT_COLORS,
  getTopElections,
  shortElectionLabel,
} from "@/lib/scoring";
import { haversineDistance } from "@/lib/distance-matrix";
import {
  MAX_PLAN_DAYS,
  PLAN_PREVIEW_LIMIT,
  toDateInputValue,
  parseDateInput,
  addDays,
  formatCampaignDate,
  mergeUniqueIds,
  csvValue,
  orderVotersByWalkingPath,
  buildBalancedGeoPlanAssignments,
  buildDayPlans,
} from "@/lib/plan-utils";
import { matchesPrimaryMethodFilter } from "@/lib/primary-vote";

type SortKey = "name" | "voteCount" | "lastVoted";
type SortDir = "asc" | "desc";

const GROSS_TARGET_MISMATCH_RATIO = 0.25;
const GROSS_TARGET_MISMATCH_MIN_VOTERS = 25;

interface VoterTableProps {
  planMode?: boolean;
}

export default function VoterTable({ planMode = false }: VoterTableProps) {
  const voters = useVoterStore((s) => s.voters);
  const geocodedVoters = useVoterStore((s) => s.geocodedVoters);
  const filters = useVoterStore((s) => s.filters);
  const finalizedPlan = useVoterStore((s) => s.finalizedPlan);
  const setFinalizedPlan = useVoterStore((s) => s.setFinalizedPlan);
  const campaignListIds = useVoterStore((s) => s.campaignListIds);
  const campaignDays = useVoterStore((s) => s.campaignDays);
  const campaignStartDate = useVoterStore((s) => s.campaignStartDate);
  const doorsPerDay = useVoterStore((s) => s.doorsPerDay);
  const setCampaignDays = useVoterStore((s) => s.setCampaignDays);
  const setDoorsPerDay = useVoterStore((s) => s.setDoorsPerDay);
  const addToCampaignList = useVoterStore((s) => s.addToCampaignList);
  const removeFromCampaignList = useVoterStore((s) => s.removeFromCampaignList);
  const clearCampaignList = useVoterStore((s) => s.clearCampaignList);
  const resetPlanBuilding = useVoterStore((s) => s.resetPlanBuilding);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showOnlyUnplanned, setShowOnlyUnplanned] = useState(false);
  const [showTargetAdjustDialog, setShowTargetAdjustDialog] = useState(false);
  const [showRouteModeDialog, setShowRouteModeDialog] = useState(false);
  const [pendingFinalizeDays, setPendingFinalizeDays] = useState<number | null>(null);

  const isPlanFinalized = Boolean(finalizedPlan);
  const finalizedTravelMode = finalizedPlan?.travelMode ?? "walking";

  const topElections = useMemo(() => getTopElections(voters, 8), [voters]);
  const selectedPrimaryMethods = useMemo(
    () => filters.primaryVotingMethods ?? [],
    [filters.primaryVotingMethods]
  );

  const filtered = useMemo(() => {
    let result = voters;

    if (filters.registrationStatus.length > 0) {
      const statuses = new Set(filters.registrationStatus);
      result = result.filter((v) => v.registrationStatus && statuses.has(v.registrationStatus));
    }
    if (filters.selectedElections.length > 0) {
      result = result.filter((v) =>
        filters.selectedElections.every((date) => v.elections.some((e) => e.date === date))
      );
    }
    if (filters.engagementTier !== "all") {
      result = result.filter(
        (v) => engagementTier(voterScore(v)) === filters.engagementTier
      );
    }
    if (filters.primaryParty !== "all") {
      result = result.filter((v) => {
        if (filters.primaryParty === "unknown") return !v.primaryParty;
        return v.primaryParty === filters.primaryParty;
      });
    }
    if (selectedPrimaryMethods.length > 0) {
      result = result.filter((voter) =>
        matchesPrimaryMethodFilter(
          voter,
          selectedPrimaryMethods,
          filters.selectedElections
        )
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (v) =>
          `${v.firstName} ${v.lastName}`.toLowerCase().includes(q) ||
          v.address.toLowerCase().includes(q)
      );
    }

    return result;
  }, [voters, filters, selectedPrimaryMethods, search]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = `${a.lastName} ${a.firstName}`.localeCompare(
            `${b.lastName} ${b.firstName}`
          );
          break;
        case "voteCount":
          cmp = a.voteCount - b.voteCount;
          break;
        case "lastVoted": {
          const aTime = a.lastVoted ? new Date(a.lastVoted).getTime() : 0;
          const bTime = b.lastVoted ? new Date(b.lastVoted).getTime() : 0;
          cmp = aTime - bTime;
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const voterById = useMemo(
    () => new Map(voters.map((voter) => [voter.id, voter])),
    [voters]
  );
  const geocodedById = useMemo(
    () => new Map(geocodedVoters.map((voter) => [voter.id, voter])),
    [geocodedVoters]
  );

  const validSelectedIds = useMemo(
    () => selectedIds.filter((id) => voterById.has(id)),
    [selectedIds, voterById]
  );

  const selectedIdSet = useMemo(
    () => new Set(validSelectedIds),
    [validSelectedIds]
  );

  const campaignList = useMemo(
    () =>
      campaignListIds
        .map((id) => voterById.get(id))
        .filter((voter): voter is Voter => Boolean(voter)),
    [campaignListIds, voterById]
  );

  const campaignListIdSet = useMemo(
    () => new Set(campaignList.map((voter) => voter.id)),
    [campaignList]
  );

  const selectedInListCount = useMemo(
    () => validSelectedIds.filter((id) => campaignListIdSet.has(id)).length,
    [validSelectedIds, campaignListIdSet]
  );

  const selectedUnplannedIds = useMemo(
    () => validSelectedIds.filter((id) => !campaignListIdSet.has(id)),
    [validSelectedIds, campaignListIdSet]
  );

  const tableVoters = useMemo(() => {
    if (!planMode || !showOnlyUnplanned) return sorted;
    return sorted.filter((voter) => !campaignListIdSet.has(voter.id));
  }, [sorted, planMode, showOnlyUnplanned, campaignListIdSet]);

  const visibleIds = useMemo(
    () => tableVoters.map((voter) => voter.id),
    [tableVoters]
  );

  const visibleIdSet = useMemo(
    () => new Set(visibleIds),
    [visibleIds]
  );

  const visibleUnplannedIds = useMemo(
    () => visibleIds.filter((id) => !campaignListIdSet.has(id)),
    [visibleIds, campaignListIdSet]
  );

  const selectedVisibleCount = useMemo(
    () => validSelectedIds.filter((id) => visibleIdSet.has(id)).length,
    [validSelectedIds, visibleIdSet]
  );

  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

  const normalizedCampaignDays = Math.max(
    1,
    Math.min(MAX_PLAN_DAYS, Number.isFinite(campaignDays) ? campaignDays : 1)
  );
  const normalizedDoorsPerDay = Math.max(
    1,
    Number.isFinite(doorsPerDay) ? Math.round(doorsPerDay) : 1
  );
  const currentTarget = normalizedCampaignDays * normalizedDoorsPerDay;
  const targetMismatch = Math.abs(campaignList.length - currentTarget);
  const targetMismatchRatio =
    currentTarget > 0 ? targetMismatch / currentTarget : 0;
  const isGrosslyOffTarget =
    campaignList.length > 0 &&
    targetMismatch >= GROSS_TARGET_MISMATCH_MIN_VOTERS &&
    targetMismatchRatio >= GROSS_TARGET_MISMATCH_RATIO;

  const dayPlans = useMemo(() => {
    if (!planMode || !isPlanFinalized || campaignList.length === 0) return [];
    const assignments = finalizedPlan?.assignments;
    if (!assignments) {
      return buildDayPlans(campaignList, campaignStartDate, normalizedCampaignDays);
    }

    const byDay = new Map<number, Voter[]>();
    for (let day = 1; day <= normalizedCampaignDays; day++) {
      byDay.set(day, []);
    }

    for (const voter of campaignList) {
      const assigned = assignments[voter.id];
      const day =
        typeof assigned === "number" &&
        assigned >= 1 &&
        assigned <= normalizedCampaignDays
          ? assigned
          : 1;
      byDay.get(day)!.push(voter);
    }

    const startDate = parseDateInput(campaignStartDate);
    return Array.from({ length: normalizedCampaignDays }, (_, idx) => {
      const dayNumber = idx + 1;
      const date = addDays(startDate, idx);
      const unorderedVoters = byDay.get(dayNumber) || [];
      const orderedVoters = orderVotersByWalkingPath(
        unorderedVoters,
        geocodedById,
        finalizedTravelMode
      );
      return {
        dayNumber,
        dateValue: toDateInputValue(date),
        dateLabel: formatCampaignDate(date),
        voters: orderedVoters,
      };
    });
  }, [
    campaignList,
    campaignStartDate,
    normalizedCampaignDays,
    planMode,
    isPlanFinalized,
    finalizedPlan,
    finalizedTravelMode,
    geocodedById,
  ]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null;
    return sortDir === "asc" ? " \u2191" : " \u2193";
  }

  function toggleRowSelection(id: string) {
    setSelectedIds((prev) => {
      const cleaned = prev.filter((current) => voterById.has(current));
      if (cleaned.includes(id)) {
        return cleaned.filter((current) => current !== id);
      }
      return [...cleaned, id];
    });
  }

  function toggleSelectVisible() {
    setSelectedIds((prev) => {
      const cleaned = prev.filter((id) => voterById.has(id));
      if (allVisibleSelected) {
        return cleaned.filter((id) => !visibleIdSet.has(id));
      }
      return mergeUniqueIds(cleaned, visibleIds);
    });
  }

  function handleAddFiltered() {
    if (visibleUnplannedIds.length === 0) return;
    addToCampaignList(visibleUnplannedIds);
  }

  function handleAddSelected() {
    if (selectedUnplannedIds.length === 0) return;
    addToCampaignList(selectedUnplannedIds);
  }

  function handleRemoveSelected() {
    if (validSelectedIds.length === 0) return;
    removeFromCampaignList(validSelectedIds);
  }

  function finalizePlan() {
    if (campaignList.length === 0) return;
    if (isGrosslyOffTarget) {
      setShowTargetAdjustDialog(true);
      return;
    }
    openRouteModeDialog(normalizedCampaignDays);
  }

  function openRouteModeDialog(days: number) {
    setPendingFinalizeDays(days);
    setShowRouteModeDialog(true);
  }

  function finalizePlanWith(days: number, travelMode: "walking" | "driving") {
    const assignments = buildBalancedGeoPlanAssignments(
      campaignList,
      geocodedVoters,
      days
    );

    setFinalizedPlan({
      assignments,
      days,
      startDate: campaignStartDate,
      travelMode,
    });
  }

  function finalizeWithAdjustedTarget(nextDays: number, nextDoorsPerDay: number) {
    setCampaignDays(nextDays);
    setDoorsPerDay(nextDoorsPerDay);
    setShowTargetAdjustDialog(false);
    openRouteModeDialog(nextDays);
  }

  function finalizeWithCurrentTarget() {
    setShowTargetAdjustDialog(false);
    openRouteModeDialog(normalizedCampaignDays);
  }

  function handleRouteModeSelect(mode: "walking" | "driving") {
    const daysToUse = pendingFinalizeDays ?? normalizedCampaignDays;
    setShowRouteModeDialog(false);
    setPendingFinalizeDays(null);
    finalizePlanWith(daysToUse, mode);
  }

  function handleRouteModeCancel() {
    setShowRouteModeDialog(false);
    setPendingFinalizeDays(null);
  }

  function handleBackToPlanWizard() {
    if (campaignList.length > 0 && typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Go back to the plan wizard? This will clear your current campaign list."
      );
      if (!confirmed) return;
    }
    resetPlanBuilding();
  }

  function exportCampaignPlanCSV() {
    if (campaignList.length === 0) return;

    const header = [
      "day",
      "date",
      "order",
      "path_order",
      "first_name",
      "last_name",
      "address",
      "city",
      "state",
      "zip",
      "lat",
      "lng",
      "segment_km",
      "cumulative_km",
      "party",
      "vote_count",
      "last_voted",
    ].join(",");

    const rows = dayPlans.flatMap((plan) =>
      plan.voters.map((voter, idx) => {
        const geocoded = geocodedById.get(voter.id);
        const pathOrder = geocoded ? idx + 1 : "";

        let segmentKm = "";
        let cumulativeKm = "";
        if (geocoded) {
          const priorGeocoded = plan.voters
            .slice(0, idx)
            .map((candidate) => geocodedById.get(candidate.id))
            .filter((candidate): candidate is GeocodedVoter => Boolean(candidate));

          if (priorGeocoded.length === 0) {
            segmentKm = "0";
            cumulativeKm = "0";
          } else {
            const prev = priorGeocoded[priorGeocoded.length - 1];
            const segment = haversineDistance(prev.lat, prev.lng, geocoded.lat, geocoded.lng);
            segmentKm = segment.toFixed(3);

            let cumulative = 0;
            for (let i = 1; i < priorGeocoded.length; i++) {
              cumulative += haversineDistance(
                priorGeocoded[i - 1].lat,
                priorGeocoded[i - 1].lng,
                priorGeocoded[i].lat,
                priorGeocoded[i].lng
              );
            }
            cumulative += segment;
            cumulativeKm = cumulative.toFixed(3);
          }
        }

        return [
          plan.dayNumber,
          plan.dateValue,
          idx + 1,
          pathOrder,
          csvValue(voter.firstName),
          csvValue(voter.lastName),
          csvValue(voter.address),
          csvValue(voter.city),
          csvValue(voter.state),
          csvValue(voter.zip),
          geocoded ? geocoded.lat.toFixed(6) : "",
          geocoded ? geocoded.lng.toFixed(6) : "",
          segmentKm,
          cumulativeKm,
          csvValue(voter.party),
          csvValue(voter.voteCount),
          csvValue(voter.lastVoted),
        ].join(",");
      })
    );

    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "campaign-plan.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (voters.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-400">
        Import voter data to view the table.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 bg-white">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="border-b border-zinc-200 px-4 py-2">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Search by name or address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-lg rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-700 placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <span className="text-xs text-zinc-400">
              {tableVoters.length} of {voters.length} voters
            </span>
            {planMode && (
              <>
                <span className="text-xs text-zinc-400">
                  {selectedVisibleCount} selected
                </span>
                <span className="text-xs text-zinc-500">
                  Campaign list {campaignList.length}
                </span>
              </>
            )}
          </div>

          {planMode && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowOnlyUnplanned((prev) => !prev)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  showOnlyUnplanned
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {showOnlyUnplanned ? "Showing Unplanned" : "Only Unplanned"}
              </button>
              <button
                type="button"
                onClick={handleAddFiltered}
                disabled={visibleUnplannedIds.length === 0}
                className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add Filtered ({visibleUnplannedIds.length})
              </button>
              <button
                type="button"
                onClick={handleAddSelected}
                disabled={selectedUnplannedIds.length === 0}
                className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add Selected ({selectedUnplannedIds.length})
              </button>

              <button
                type="button"
                onClick={finalizePlan}
                disabled={campaignList.length === 0 || isPlanFinalized}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  isPlanFinalized
                    ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                }`}
              >
                {isPlanFinalized ? "Plan Finalized" : "Finalize Plan"}
              </button>
            </div>
          )}

          {planMode && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRemoveSelected}
                disabled={selectedInListCount === 0}
                className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Remove Selected ({selectedInListCount})
              </button>
              <button
                type="button"
                onClick={clearCampaignList}
                disabled={campaignList.length === 0}
                className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Clear List
              </button>
              <button
                type="button"
                onClick={handleBackToPlanWizard}
                className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
              >
                Back to Plan Wizard
              </button>
              <span className="text-[11px] text-zinc-400">
                Change days and start date in the wizard.
              </span>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-zinc-50 text-left">
              <tr className="border-b border-zinc-200">
                {planMode && (
                  <th className="w-8 px-2 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all visible voters"
                      checked={allVisibleSelected}
                      onChange={toggleSelectVisible}
                      className="h-3.5 w-3.5 rounded border-zinc-300 text-indigo-600"
                    />
                  </th>
                )}
                <th className="w-8 px-4 py-2" />
                <th
                  className="cursor-pointer px-3 py-2 font-medium text-zinc-500 hover:text-zinc-900 select-none"
                  onClick={() => toggleSort("name")}
                >
                  Name{sortIndicator("name")}
                </th>
                <th className="px-3 py-2 font-medium text-zinc-500">Address</th>
                <th className="px-3 py-2 font-medium text-zinc-500">Party</th>
                <th className="px-3 py-2 font-medium text-zinc-500">Age</th>
                <th className="px-3 py-2 font-medium text-zinc-500">Status</th>
                <th
                  className="cursor-pointer px-3 py-2 font-medium text-zinc-500 hover:text-zinc-900 select-none"
                  onClick={() => toggleSort("voteCount")}
                >
                  Votes{sortIndicator("voteCount")}
                </th>
                <th
                  className="cursor-pointer px-3 py-2 font-medium text-zinc-500 hover:text-zinc-900 select-none"
                  onClick={() => toggleSort("lastVoted")}
                >
                  Last Voted{sortIndicator("lastVoted")}
                </th>
                <th className="w-8 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {tableVoters.map((voter) => (
                <VoterRow
                  key={voter.id}
                  voter={voter}
                  topElections={topElections}
                  selected={selectedIdSet.has(voter.id)}
                  inCampaignList={campaignListIdSet.has(voter.id)}
                  planningEnabled={planMode}
                  expanded={expandedId === voter.id}
                  onToggleSelection={() => toggleRowSelection(voter.id)}
                  onToggle={() =>
                    setExpandedId((prev) =>
                      prev === voter.id ? null : voter.id
                    )
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {planMode && (
        <aside className="w-80 shrink-0 border-l border-zinc-200 bg-zinc-50/40">
          <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
            <div>
              <h3 className="text-xs font-semibold text-zinc-900">Campaign Plan</h3>
              <p className="text-[11px] text-zinc-500">
                {campaignList.length} voters across {normalizedCampaignDays} day
                {normalizedCampaignDays === 1 ? "" : "s"}
              </p>
            </div>
            <button
              type="button"
              onClick={exportCampaignPlanCSV}
              disabled={campaignList.length === 0 || !isPlanFinalized}
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Export CSV
            </button>
          </div>

          <div className="h-full overflow-y-auto p-3">
            {campaignList.length === 0 ? (
              <p className="text-xs text-zinc-400">
                Filter voters, select rows, and add them to the campaign list.
              </p>
            ) : !isPlanFinalized ? (
              <p className="text-xs text-zinc-400">
                Set your days and start date, then click <span className="font-medium text-zinc-500">Finalize Plan</span> to generate day assignments.
              </p>
            ) : (
              <div className="flex flex-col gap-3 pb-12">
                {dayPlans.map((plan) => (
                  <section
                    key={`${plan.dayNumber}-${plan.dateValue}`}
                    className="rounded-md border border-zinc-200 bg-white"
                  >
                    <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
                      <div>
                        <p className="text-xs font-semibold text-zinc-800">
                          Day {plan.dayNumber}
                        </p>
                        <p className="text-[11px] text-zinc-500">{plan.dateLabel}</p>
                      </div>
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600">
                        {plan.voters.length}
                      </span>
                    </div>

                    {plan.voters.length > 0 ? (
                      <ul className="flex flex-col gap-1 px-3 py-2">
                        {plan.voters.slice(0, PLAN_PREVIEW_LIMIT).map((voter) => (
                          <li key={voter.id} className="text-[11px] text-zinc-600">
                            {voter.firstName} {voter.lastName}
                          </li>
                        ))}
                        {plan.voters.length > PLAN_PREVIEW_LIMIT && (
                          <li className="text-[11px] text-zinc-400">
                            +{plan.voters.length - PLAN_PREVIEW_LIMIT} more
                          </li>
                        )}
                      </ul>
                    ) : (
                      <p className="px-3 py-2 text-[11px] text-zinc-400">
                        No voters assigned.
                      </p>
                    )}
                  </section>
                ))}
              </div>
            )}
          </div>
        </aside>
      )}

      {planMode && showTargetAdjustDialog && (
        <TargetAdjustDialog
          campaignListCount={campaignList.length}
          currentTarget={currentTarget}
          initialDays={normalizedCampaignDays}
          initialDoorsPerDay={normalizedDoorsPerDay}
          onCancel={() => setShowTargetAdjustDialog(false)}
          onKeepCurrent={finalizeWithCurrentTarget}
          onAdjustAndFinalize={finalizeWithAdjustedTarget}
        />
      )}

      {planMode && showRouteModeDialog && (
        <RouteModeDialog
          onCancel={handleRouteModeCancel}
          onSelectWalking={() => handleRouteModeSelect("walking")}
          onSelectDriving={() => handleRouteModeSelect("driving")}
        />
      )}
    </div>
  );
}

function TargetAdjustDialog({
  campaignListCount,
  currentTarget,
  initialDays,
  initialDoorsPerDay,
  onCancel,
  onKeepCurrent,
  onAdjustAndFinalize,
}: {
  campaignListCount: number;
  currentTarget: number;
  initialDays: number;
  initialDoorsPerDay: number;
  onCancel: () => void;
  onKeepCurrent: () => void;
  onAdjustAndFinalize: (days: number, doorsPerDay: number) => void;
}) {
  const [daysInput, setDaysInput] = useState(String(initialDays));
  const [doorsPerDayInput, setDoorsPerDayInput] = useState(String(initialDoorsPerDay));

  const parsedDays = Number(daysInput);
  const parsedDoorsPerDay = Number(doorsPerDayInput);
  const normalizedDays = Number.isFinite(parsedDays)
    ? Math.max(1, Math.min(MAX_PLAN_DAYS, Math.round(parsedDays)))
    : initialDays;
  const normalizedDoorsPerDay = Number.isFinite(parsedDoorsPerDay)
    ? Math.max(1, Math.round(parsedDoorsPerDay))
    : initialDoorsPerDay;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/35 p-4">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-5 shadow-xl">
        <h3 className="text-sm font-semibold text-zinc-900">
          Campaign Target Is Off
        </h3>
        <p className="mt-1 text-xs text-zinc-600">
          You selected {campaignListCount} planned voters, but your current target is{" "}
          {currentTarget} ({initialDays} days × {initialDoorsPerDay}/day).
        </p>
        <p className="mt-1 text-xs text-zinc-600">
          Do you want to adjust days or doors per day before finalizing?
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-600">
            Days
            <input
              type="number"
              min={1}
              max={MAX_PLAN_DAYS}
              value={daysInput}
              onChange={(e) => setDaysInput(e.target.value)}
              className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600">
            Doors / day
            <input
              type="number"
              min={1}
              value={doorsPerDayInput}
              onChange={(e) => setDoorsPerDayInput(e.target.value)}
              className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </label>
        </div>

        <p className="mt-3 rounded-md bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700">
          New target: ~{normalizedDays * normalizedDoorsPerDay} voters
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onKeepCurrent}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            Keep Current
          </button>
          <button
            type="button"
            onClick={() => onAdjustAndFinalize(normalizedDays, normalizedDoorsPerDay)}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
          >
            Adjust & Finalize
          </button>
        </div>
      </div>
    </div>
  );
}

function RouteModeDialog({
  onCancel,
  onSelectWalking,
  onSelectDriving,
}: {
  onCancel: () => void;
  onSelectWalking: () => void;
  onSelectDriving: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/35 p-4">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-5 shadow-xl">
        <h3 className="text-sm font-semibold text-zinc-900">
          Finalize Route Mode
        </h3>
        <p className="mt-1 text-xs text-zinc-600">
          Choose how route ordering should be optimized for this plan.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onSelectWalking}
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Walking
            <span className="mt-1 block text-[11px] font-normal text-zinc-500">
              Keep current straight-distance routing.
            </span>
          </button>
          <button
            type="button"
            onClick={onSelectDriving}
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Driving
            <span className="mt-1 block text-[11px] font-normal text-zinc-500">
              Add light penalty for left turns.
            </span>
          </button>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function VoterRow({
  voter,
  topElections,
  selected,
  inCampaignList,
  planningEnabled,
  expanded,
  onToggleSelection,
  onToggle,
}: {
  voter: Voter;
  topElections: Election[];
  selected: boolean;
  inCampaignList: boolean;
  planningEnabled: boolean;
  expanded: boolean;
  onToggleSelection: () => void;
  onToggle: () => void;
}) {
  const score = voterScore(voter);
  const tier = engagementTier(score);
  const color = ENGAGEMENT_COLORS[tier];

  return (
    <>
      <tr
        className={`cursor-pointer border-b border-zinc-100 transition-colors ${
          planningEnabled && inCampaignList
            ? "bg-indigo-50/40 hover:bg-indigo-50/70"
            : "hover:bg-zinc-50"
        }`}
        onClick={onToggle}
      >
        {planningEnabled && (
          <td
            className="px-2 py-2"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelection}
              className="h-3.5 w-3.5 rounded border-zinc-300 text-indigo-600"
              aria-label={`Select ${voter.firstName} ${voter.lastName}`}
            />
          </td>
        )}

        {/* Engagement dot */}
        <td className="px-4 py-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
        </td>

        {/* Name */}
        <td className="px-3 py-2 font-medium text-zinc-900">
          <span>{voter.firstName} {voter.lastName}</span>
          {planningEnabled && inCampaignList && (
            <span className="ml-2 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
              Planned
            </span>
          )}
        </td>

        {/* Address */}
        <td className="px-3 py-2 text-zinc-500">
          {voter.address}, {voter.city}
        </td>

        {/* Party */}
        <td className="px-3 py-2 text-zinc-500">{voter.party === "R" ? "Rep" : voter.party === "D" ? "Dem/Other" : voter.party || "\u2014"}</td>

        {/* Age */}
        <td className="px-3 py-2 text-zinc-500">{voter.age || "\u2014"}</td>

        {/* Registration status */}
        <td className="px-3 py-2">
          {voter.registrationStatus ? (
            <span
              className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                voter.registrationStatus === "Active"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-600"
              }`}
            >
              {voter.registrationStatus}
            </span>
          ) : (
            "\u2014"
          )}
        </td>

        {/* Vote count */}
        <td className="px-3 py-2 text-zinc-500">{voter.voteCount}</td>

        {/* Last voted */}
        <td className="px-3 py-2 text-zinc-500">
          {voter.lastVoted
            ? new Date(voter.lastVoted).toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              })
            : "\u2014"}
        </td>

        {/* Chevron */}
        <td className="px-3 py-2 text-zinc-400">
          <svg
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </td>
      </tr>

      {/* Expanded detail */}
      {expanded && (
        <tr className="border-b border-zinc-100 bg-zinc-50/50">
          <td colSpan={planningEnabled ? 10 : 9} className="px-6 py-3">
            <ElectionDetail voter={voter} topElections={topElections} />
          </td>
        </tr>
      )}
    </>
  );
}

function ElectionDetail({
  voter,
  topElections,
}: {
  voter: Voter;
  topElections: Election[];
}) {
  const uniqueElections = useMemo(() => {
    const seen = new Set<string>();
    return voter.elections.filter((e) => {
      const key = `${e.date}|${e.type || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [voter.elections]);

  const voterDates = new Set(voter.elections.map((e) => e.date));
  const hasTopElections = topElections.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Election participation grid */}
      {hasTopElections && (
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            Recent Elections
          </p>
          <div className="flex items-center gap-3">
            {topElections.map((e) => (
              <div key={e.date} className="flex flex-col items-center gap-1">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{
                    backgroundColor: voterDates.has(e.date)
                      ? "#18181b"
                      : "transparent",
                    border: voterDates.has(e.date)
                      ? "none"
                      : "1.5px solid #d4d4d8",
                  }}
                />
                <span className="text-[9px] text-zinc-400">
                  {shortElectionLabel(e)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full election list */}
      {uniqueElections.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            All Elections ({uniqueElections.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {uniqueElections
              .slice()
              .sort(
                (a, b) =>
                  new Date(b.date).getTime() - new Date(a.date).getTime()
              )
              .map((e, idx) => (
                <span
                  key={`${e.date}-${e.type || "unknown"}-${idx}`}
                  className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600"
                >
                  {shortElectionLabel(e)}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Additional details */}
      <div className="flex gap-6 text-[10px] text-zinc-400">
        <span>
          Full address: {voter.address}, {voter.city}, {voter.state}{" "}
          {voter.zip}
        </span>
        {voter.party && <span>Party: {voter.party === "R" ? "Rep" : voter.party === "D" ? "Dem/Other" : voter.party}</span>}
        {voter.age && <span>Age: {voter.age}</span>}
      </div>
    </div>
  );
}
