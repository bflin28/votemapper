"use client";

import { useEffect, useMemo, useState } from "react";
import { useVoterStore } from "@/store/voter-store";
import { Voter, GeocodedVoter } from "@/lib/types";
import { haversineDistance } from "@/lib/distance-matrix";
import { getTopElections, shortElectionLabel } from "@/lib/scoring";
import {
  PLAN_PREVIEW_LIMIT,
  toDateInputValue,
  parseDateInput,
  addDays,
  formatCampaignDate,
  csvValue,
  orderVotersByWalkingPath,
} from "@/lib/plan-utils";
import VoterTable from "@/components/VoterTable";

export default function PlanView() {
  const hasHydrated = useVoterStore((s) => s.hasHydrated);
  const planBuilding = useVoterStore((s) => s.planBuilding);
  const finalizedPlan = useVoterStore((s) => s.finalizedPlan);

  if (!hasHydrated) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-50 text-sm text-zinc-400">
        Loading campaign planner...
      </div>
    );
  }

  if (finalizedPlan) {
    return <PlanSummary />;
  }

  if (planBuilding) {
    return <VoterTable planMode />;
  }

  return <PlanWizard />;
}

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

interface ScrapeCounty {
  county: string;
  countyKey: string;
  precincts: ScrapeFile[];
}

type WizardStep = "landing" | "data" | "days" | "doors";

function PlanWizard() {
  const voters = useVoterStore((s) => s.voters);
  const setVoters = useVoterStore((s) => s.setVoters);
  const setGeocodedVoters = useVoterStore((s) => s.setGeocodedVoters);
  const setStage = useVoterStore((s) => s.setStage);
  const setError = useVoterStore((s) => s.setError);
  const selectedScrapes = useVoterStore((s) => s.selectedScrapes);
  const setSelectedScrapes = useVoterStore((s) => s.setSelectedScrapes);
  const startPlanBuilding = useVoterStore((s) => s.startPlanBuilding);

  const [step, setStep] = useState<WizardStep>("landing");
  const [counties, setCounties] = useState<ScrapeCounty[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [days, setDays] = useState(3);
  const [startDate, setStartDate] = useState(() => toDateInputValue(new Date()));
  const [doorsPerDay, setDoorsPerDay] = useState(20);
  const [importing, setImporting] = useState(false);

  const availableFileNames = useMemo(
    () => new Set(counties.flatMap((county) => county.precincts.map((precinct) => precinct.name))),
    [counties]
  );

  useEffect(() => {
    let active = true;

    async function loadCatalog() {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const res = await fetch("/api/scrapes");
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load data catalog");
        }

        const nextCounties: ScrapeCounty[] = Array.isArray(data.counties)
          ? data.counties
          : [];
        if (!active) return;

        setCounties(nextCounties);
        const validPersisted = selectedScrapes.filter((name) => {
          return nextCounties.some((county) =>
            county.precincts.some((precinct) => precinct.name === name)
          );
        });
        if (validPersisted.length > 0) {
          setSelectedFiles(validPersisted);
        }
      } catch (error) {
        if (!active) return;
        setCounties([]);
        setCatalogError(error instanceof Error ? error.message : "Failed to load data catalog");
      } finally {
        if (active) {
          setCatalogLoading(false);
        }
      }
    }

    void loadCatalog();
    return () => {
      active = false;
    };
  }, [selectedScrapes]);

  function togglePrecinctSelection(filename: string) {
    setSelectedFiles((prev) =>
      prev.includes(filename)
        ? prev.filter((name) => name !== filename)
        : [...prev, filename]
    );
  }

  function selectAllCountyPrecincts(precincts: ScrapeFile[]) {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      for (const precinct of precincts) {
        next.add(precinct.name);
      }
      return Array.from(next);
    });
  }

  function clearCountyPrecincts(precincts: ScrapeFile[]) {
    const toRemove = new Set(precincts.map((precinct) => precinct.name));
    setSelectedFiles((prev) => prev.filter((name) => !toRemove.has(name)));
  }

  async function handleStart() {
    const validSelection = selectedFiles.filter((name) => availableFileNames.has(name));
    if (validSelection.length === 0) {
      setStep("data");
      return;
    }

    const persistedSelection = selectedScrapes.filter((name) => availableFileNames.has(name));
    const shouldImport =
      voters.length === 0 ||
      validSelection.length !== persistedSelection.length ||
      validSelection.some((name) => !persistedSelection.includes(name));

    if (shouldImport) {
      setImporting(true);
      setStage("importing");
      setError(null);

      try {
        const res = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filenames: validSelection }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Import failed");
          setStage("idle");
          return;
        }

        if (!Array.isArray(data.voters) || data.voters.length === 0) {
          setError("No voters were found for the selected county/precinct data.");
          setStage("idle");
          return;
        }

        setSelectedScrapes(validSelection);
        setVoters(data.voters, Array.isArray(data.errors) ? data.errors : []);

        if (Array.isArray(data.geocodedVoters) && data.geocodedVoters.length > 0) {
          const geocodedIds = new Set(data.geocodedVoters.map((v: GeocodedVoter) => v.id));
          const unmatched = data.voters.filter((v: Voter) => !geocodedIds.has(v.id));
          setGeocodedVoters(data.geocodedVoters, unmatched);
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : "Import failed");
        setStage("idle");
        return;
      } finally {
        setImporting(false);
      }
    } else {
      setSelectedScrapes(validSelection);
    }

    startPlanBuilding({ days, startDate, doorsPerDay });
  }

  const stepIndex =
    step === "data" ? 0 : step === "days" ? 1 : step === "doors" ? 2 : -1;

  return (
    <div className="flex h-full items-center justify-center bg-zinc-50">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
        {step === "landing" && (
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50">
              <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-zinc-900">
              Create a Campaign Plan
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              Plan your door-knocking campaign in a few simple steps
            </p>
            {voters.length > 0 && (
              <p className="mt-3 text-xs text-zinc-400">
                {voters.length} voters currently loaded
              </p>
            )}
            <button
              type="button"
              onClick={() => setStep("data")}
              className="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Get Started
            </button>
          </div>
        )}

        {step === "data" && (
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold text-zinc-900">
              Select campaign data
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Choose county and precincts to import
            </p>

            <div className="mt-6 max-h-64 space-y-3 overflow-y-auto pr-1">
              {catalogLoading ? (
                <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                  Loading available counties and precincts...
                </p>
              ) : catalogError ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                  {catalogError}
                </p>
              ) : counties.length === 0 ? (
                <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                  No county precinct CSV data was found in `data/`.
                </p>
              ) : (
                counties.map((county) => {
                  const countySelectedCount = county.precincts.filter((precinct) =>
                    selectedFiles.includes(precinct.name)
                  ).length;

                  return (
                    <section
                      key={county.countyKey}
                      className="rounded-md border border-zinc-200 bg-white"
                    >
                      <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
                        <div>
                          <p className="text-xs font-semibold text-zinc-800">
                            {county.county} County
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            {countySelectedCount} of {county.precincts.length} selected
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          <button
                            type="button"
                            onClick={() => selectAllCountyPrecincts(county.precincts)}
                            className="text-zinc-500 transition-colors hover:text-zinc-700"
                          >
                            Select all
                          </button>
                          <button
                            type="button"
                            onClick={() => clearCountyPrecincts(county.precincts)}
                            className="text-zinc-500 transition-colors hover:text-zinc-700"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div className="divide-y divide-zinc-100">
                        {county.precincts.map((precinct) => {
                          const selected = selectedFiles.includes(precinct.name);
                          return (
                            <button
                              key={precinct.name}
                              type="button"
                              onClick={() => togglePrecinctSelection(precinct.name)}
                              className={`flex w-full items-center justify-between px-3 py-2 text-left transition-colors ${
                                selected ? "bg-indigo-50" : "hover:bg-zinc-50"
                              }`}
                            >
                              <span className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  readOnly
                                  checked={selected}
                                  className="h-3.5 w-3.5 rounded border-zinc-300 text-indigo-600"
                                />
                                <span className="text-xs font-medium text-zinc-700">
                                  Precinct {precinct.precinct}
                                </span>
                              </span>
                              <span className="text-[10px] text-zinc-400">
                                {precinct.voterCount.toLocaleString()} voters
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })
              )}
            </div>

            <p className="mt-3 text-xs text-zinc-500">
              {selectedFiles.length} precinct
              {selectedFiles.length === 1 ? "" : "s"} selected
            </p>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setStep("landing")}
                className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep("days")}
                disabled={
                  catalogLoading ||
                  counties.length === 0 ||
                  selectedFiles.filter((name) => availableFileNames.has(name)).length === 0
                }
                className="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === "days" && (
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold text-zinc-900">
              How many days will you campaign?
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Choose the number of days and your start date
            </p>

            <div className="mt-6 flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  Number of days
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={days}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) setDays(Math.max(1, Math.min(30, Math.round(v))));
                  }}
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  Start date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setStep("data")}
                className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep("doors")}
                className="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === "doors" && (
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold text-zinc-900">
              How many doors can you knock per day?
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              This helps estimate your campaign capacity
            </p>

            <div className="mt-6">
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Doors per day
              </label>
              <input
                type="number"
                min={1}
                value={doorsPerDay}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setDoorsPerDay(Math.max(1, Math.round(v)));
                }}
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>

            <div className="mt-4 rounded-md bg-indigo-50 px-4 py-3">
              <p className="text-sm font-medium text-indigo-700">
                Target: ~{days * doorsPerDay} voters total
              </p>
              <p className="text-xs text-indigo-600/70">
                {days} day{days !== 1 ? "s" : ""} &times; {doorsPerDay} doors/day
              </p>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setStep("days")}
                className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleStart}
                disabled={importing}
                className="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importing ? "Importing..." : "Start Building"}
              </button>
            </div>
          </div>
        )}

        {/* Step dots */}
        {stepIndex >= 0 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === stepIndex ? "bg-indigo-600" : "bg-zinc-200"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PlanSummary() {
  const voters = useVoterStore((s) => s.voters);
  const geocodedVoters = useVoterStore((s) => s.geocodedVoters);
  const finalizedPlan = useVoterStore((s) => s.finalizedPlan)!;
  const campaignListIds = useVoterStore((s) => s.campaignListIds);
  const campaignDays = useVoterStore((s) => s.campaignDays);
  const campaignStartDate = useVoterStore((s) => s.campaignStartDate);
  const clearFinalizedPlan = useVoterStore((s) => s.clearFinalizedPlan);
  const setPlanBuilding = useVoterStore((s) => s.setPlanBuilding);
  const resetPlanBuilding = useVoterStore((s) => s.resetPlanBuilding);

  const voterById = useMemo(
    () => new Map(voters.map((v) => [v.id, v])),
    [voters]
  );
  const geocodedById = useMemo(
    () => new Map(geocodedVoters.map((v) => [v.id, v])),
    [geocodedVoters]
  );

  const campaignList = useMemo(
    () =>
      campaignListIds
        .map((id) => voterById.get(id))
        .filter((v): v is Voter => Boolean(v)),
    [campaignListIds, voterById]
  );

  const normalizedDays = Math.max(1, Math.min(30, campaignDays));
  const finalizedTravelMode = finalizedPlan.travelMode ?? "walking";
  const recentElections = useMemo(
    () => getTopElections(campaignList, 5),
    [campaignList]
  );

  const dayPlans = useMemo(() => {
    if (campaignList.length === 0) return [];
    const assignments = finalizedPlan.assignments;

    const byDay = new Map<number, Voter[]>();
    for (let day = 1; day <= normalizedDays; day++) {
      byDay.set(day, []);
    }

    for (const voter of campaignList) {
      const assigned = assignments[voter.id];
      const day =
        typeof assigned === "number" && assigned >= 1 && assigned <= normalizedDays
          ? assigned
          : 1;
      byDay.get(day)!.push(voter);
    }

    const startDate = parseDateInput(campaignStartDate);
    return Array.from({ length: normalizedDays }, (_, idx) => {
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
    normalizedDays,
    finalizedPlan,
    geocodedById,
    finalizedTravelMode,
  ]);

  const dayPrintSheets = useMemo(() => {
    return dayPlans.map((plan) => {
      const stopMap = new Map<
        string,
        {
          stopNumber: number;
          address: string;
          city: string;
          state: string;
          zip: string;
          voters: Voter[];
        }
      >();

      for (const voter of plan.voters) {
        const key = `${voter.address.toLowerCase().trim()}|${voter.city.toLowerCase().trim()}|${voter.state.toLowerCase().trim()}|${voter.zip.trim()}`;
        const existing = stopMap.get(key);
        if (existing) {
          existing.voters.push(voter);
        } else {
          stopMap.set(key, {
            stopNumber: stopMap.size + 1,
            address: voter.address,
            city: voter.city,
            state: voter.state,
            zip: voter.zip,
            voters: [voter],
          });
        }
      }

      return {
        ...plan,
        stops: Array.from(stopMap.values()),
      };
    });
  }, [dayPlans]);

  const startDateObj = parseDateInput(campaignStartDate);
  const endDateObj = addDays(startDateObj, normalizedDays - 1);
  const dateRange = `${formatCampaignDate(startDateObj)} \u2013 ${formatCampaignDate(endDateObj)}`;

  function handleEditPlan() {
    clearFinalizedPlan();
    setPlanBuilding(true);
  }

  function exportCampaignPlanCSV() {
    if (campaignList.length === 0) return;

    const header = [
      "day", "date", "order", "path_order", "first_name", "last_name",
      "address", "city", "state", "zip", "lat", "lng",
      "segment_km", "cumulative_km", "party", "vote_count", "last_voted",
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
            .map((c) => geocodedById.get(c.id))
            .filter((c): c is GeocodedVoter => Boolean(c));

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
                priorGeocoded[i - 1].lat, priorGeocoded[i - 1].lng,
                priorGeocoded[i].lat, priorGeocoded[i].lng
              );
            }
            cumulative += segment;
            cumulativeKm = cumulative.toFixed(3);
          }
        }

        return [
          plan.dayNumber, plan.dateValue, idx + 1, pathOrder,
          csvValue(voter.firstName), csvValue(voter.lastName),
          csvValue(voter.address), csvValue(voter.city),
          csvValue(voter.state), csvValue(voter.zip),
          geocoded ? geocoded.lat.toFixed(6) : "",
          geocoded ? geocoded.lng.toFixed(6) : "",
          segmentKm, cumulativeKm,
          csvValue(voter.party), csvValue(voter.voteCount),
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

  function printDaySheets() {
    if (typeof window === "undefined") return;
    window.print();
  }

  return (
    <div className="flex h-full flex-col bg-zinc-50 print:bg-white">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white px-6 py-4 print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Campaign Plan</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {dateRange} &middot; {campaignList.length} voters
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={printDaySheets}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              Print Sheets
            </button>
            <button
              type="button"
              onClick={exportCampaignPlanCSV}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Day cards grid */}
      <div className="flex-1 overflow-y-auto p-6 print:hidden">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dayPlans.map((plan) => (
            <section
              key={`${plan.dayNumber}-${plan.dateValue}`}
              className="rounded-lg border border-zinc-200 bg-white"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-800">
                    Day {plan.dayNumber}
                  </p>
                  <p className="text-xs text-zinc-500">{plan.dateLabel}</p>
                </div>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600">
                  {plan.voters.length}
                </span>
              </div>

              {plan.voters.length > 0 ? (
                <ul className="flex flex-col gap-1 px-4 py-3">
                  {plan.voters.slice(0, PLAN_PREVIEW_LIMIT).map((voter) => (
                    <li key={voter.id} className="text-xs text-zinc-600">
                      {voter.firstName} {voter.lastName}
                    </li>
                  ))}
                  {plan.voters.length > PLAN_PREVIEW_LIMIT && (
                    <li className="text-xs text-zinc-400">
                      +{plan.voters.length - PLAN_PREVIEW_LIMIT} more
                    </li>
                  )}
                </ul>
              ) : (
                <p className="px-4 py-3 text-xs text-zinc-400">No voters assigned.</p>
              )}
            </section>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-200 bg-white px-6 py-3 print:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleEditPlan}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            Edit Plan
          </button>
          <button
            type="button"
            onClick={resetPlanBuilding}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Print-only detailed sheets */}
      <div className="hidden print:block print:bg-white print:px-[0.25in] print:py-[0.2in]">
        <div
          className="mx-auto w-full max-w-[7.6in]"
          style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
        >
          <header className="mb-4 rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
              Campaign Plan Day Sheets
            </h1>
            <p className="mt-1 text-xs text-zinc-600">
              {dateRange}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
              <span className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-zinc-700">
                {campaignList.length} voters
              </span>
              <span className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-zinc-700">
                {dayPrintSheets.length} days
              </span>
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
                {finalizedTravelMode === "driving" ? "Driving Mode" : "Walking Mode"}
              </span>
            </div>
          </header>

          {dayPrintSheets.map((plan, dayIdx) => (
            <section
              key={`print-day-${plan.dayNumber}-${plan.dateValue}`}
              className="mb-6"
              style={{ breakAfter: dayIdx === dayPrintSheets.length - 1 ? "auto" : "page" }}
            >
              <div className="mb-3 flex items-center justify-between rounded-lg border border-zinc-300 bg-white px-3 py-2">
                <div>
                  <h2 className="text-base font-semibold text-zinc-900">
                    Day {plan.dayNumber} - {plan.dateLabel}
                  </h2>
                  <p className="mt-0.5 text-xs text-zinc-600">
                    Ordered stops with household voter history
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">
                    {plan.stops.length} stops
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">
                    {plan.voters.length} voters
                  </span>
                </div>
              </div>

              {plan.stops.length === 0 ? (
                <p className="text-xs text-zinc-500">No assigned voters for this day.</p>
              ) : (
                <div className="space-y-3">
                  {plan.stops.map((stop) => (
                    <article
                      key={`stop-${plan.dayNumber}-${stop.stopNumber}`}
                      className="rounded-lg border border-zinc-300 bg-white p-3"
                      style={{ breakInside: "avoid" }}
                    >
                      <div className="mb-2 flex items-start gap-2">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
                          {stop.stopNumber}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">{stop.address}</p>
                          <p className="text-xs text-zinc-600">
                            {stop.city}, {stop.state} {stop.zip}
                          </p>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full border-separate border-spacing-0 text-[11px]">
                          <thead>
                            <tr className="text-left text-zinc-600">
                              <th className="border-b border-zinc-200 px-1 py-1.5 font-semibold">Voter</th>
                              {recentElections.map((election) => (
                                <th
                                  key={`${plan.dayNumber}-${stop.stopNumber}-${election.date}`}
                                  className="border-b border-zinc-200 px-1 py-1.5 font-semibold"
                                >
                                  {shortElectionLabel(election)}
                                </th>
                              ))}
                              <th className="border-b border-zinc-200 px-1 py-1.5 font-semibold">Last 5</th>
                              <th className="border-b border-zinc-200 px-1 py-1.5 font-semibold">Total Votes</th>
                              <th className="border-b border-zinc-200 px-1 py-1.5 font-semibold">Last Voted</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stop.voters.map((voter) => {
                              const votedRecentCount = recentElections.reduce((sum, election) => {
                                const voted = voter.elections.some((entry) => entry.date === election.date);
                                return sum + (voted ? 1 : 0);
                              }, 0);
                              const recentPct =
                                recentElections.length > 0
                                  ? (votedRecentCount / recentElections.length) * 100
                                  : 0;
                              const lastVotedLabel = voter.lastVoted
                                ? new Date(voter.lastVoted).toLocaleDateString("en-US")
                                : "-";

                              return (
                                <tr key={voter.id} className="text-zinc-700">
                                  <td className="border-b border-zinc-100 px-1 py-1.5">
                                    <span className="font-medium">
                                      {voter.firstName} {voter.lastName}
                                    </span>
                                  </td>
                                  {recentElections.map((election) => {
                                    const voted = voter.elections.some((entry) => entry.date === election.date);
                                    return (
                                      <td key={`${voter.id}-${election.date}`} className="border-b border-zinc-100 px-1 py-1.5">
                                        <span
                                          className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[9px] ${
                                            voted
                                              ? "border-emerald-600 bg-emerald-600 text-white"
                                              : "border-zinc-300 bg-white text-zinc-300"
                                          }`}
                                        >
                                          {voted ? "✓" : ""}
                                        </span>
                                      </td>
                                    );
                                  })}
                                  <td className="border-b border-zinc-100 px-1 py-1.5">
                                    <div className="flex items-center gap-1.5">
                                      <div className="h-1.5 w-10 overflow-hidden rounded-full bg-zinc-200">
                                        <div
                                          className="h-full rounded-full bg-emerald-500"
                                          style={{ width: `${recentPct}%` }}
                                        />
                                      </div>
                                      <span>
                                        {recentElections.length > 0 ? `${votedRecentCount}/${recentElections.length}` : "-"}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="border-b border-zinc-100 px-1 py-1.5">
                                    <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">
                                      {voter.voteCount}
                                    </span>
                                  </td>
                                  <td className="border-b border-zinc-100 px-1 py-1.5">
                                    {lastVotedLabel}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
