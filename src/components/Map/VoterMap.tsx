"use client";

import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useVoterStore } from "@/store/voter-store";
import { ARMSTRONG_COUNTY_CENTER, DEFAULT_ZOOM } from "@/lib/constants";
import RouteLayer from "./RouteLayer";
import MapLegend from "./MapLegend";
import { Election, Household } from "@/lib/types";
import { useEffect, useMemo } from "react";
import {
  groupHouseholds,
  getTopElections,
  shortElectionLabel,
  voterScore,
  engagementTier,
  ENGAGEMENT_COLORS,
} from "@/lib/scoring";
import { PARTY_COLORS, planDayColor } from "@/lib/constants";
import { totalRouteDistance } from "@/lib/distance-matrix";
import { optimizeRouteOrder } from "@/lib/route-optimizer";

function markerSize(memberCount: number): number {
  if (memberCount >= 3) return 18;
  if (memberCount === 2) return 14;
  return 10;
}

function createHouseholdIcon(size: number, color: string, borderColor: string, highValue = false): L.DivIcon {
  const effectiveSize = highValue ? size + 6 : size;
  const ringSize = effectiveSize * 2;

  const dot = `<div style="
    width: ${effectiveSize}px;
    height: ${effectiveSize}px;
    border-radius: 50%;
    background: ${color};
    border: 2px solid ${borderColor};
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    transition: transform 0.15s ease;
  "></div>`;

  if (!highValue) {
    return L.divIcon({
      className: "custom-marker",
      html: dot,
      iconSize: [effectiveSize, effectiveSize],
      iconAnchor: [effectiveSize / 2, effectiveSize / 2],
      popupAnchor: [0, -effectiveSize / 2 - 2],
    });
  }

  const html = `<div style="position:relative;width:${effectiveSize}px;height:${effectiveSize}px;">
    <div class="marker-pulse-ring" style="
      position:absolute;
      top:${-(ringSize - effectiveSize) / 2}px;
      left:${-(ringSize - effectiveSize) / 2}px;
      width:${ringSize}px;
      height:${ringSize}px;
      border-radius:50%;
      background:rgba(245,158,11,0.3);
      pointer-events:none;
    "></div>
    ${dot}
  </div>`;

  return L.divIcon({
    className: "custom-marker",
    html,
    iconSize: [effectiveSize, effectiveSize],
    iconAnchor: [effectiveSize / 2, effectiveSize / 2],
    popupAnchor: [0, -effectiveSize / 2 - 2],
  });
}

function createPlanEndpointIcon(color: string, label: "S" | "F"): L.DivIcon {
  const bg = label === "S" ? "#059669" : "#dc2626";
  const border = color || "#18181b";

  return L.divIcon({
    className: "plan-endpoint-marker",
    html: `<div style="
      width: 20px;
      height: 20px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${bg};
      color: white;
      font-size: 10px;
      font-weight: 700;
      border: 2px solid ${border};
      box-shadow: 0 1px 4px rgba(0,0,0,0.35);
    ">${label}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
}

function offsetFinishPosition(
  start: [number, number],
  finish: [number, number]
): [number, number] {
  if (start[0] !== finish[0] || start[1] !== finish[1]) return finish;
  // Nudge finish marker a few meters east so both endpoints are visible.
  return [finish[0], finish[1] + 0.00008];
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (positions.length === 0) return;
    const bounds = L.latLngBounds(positions.map((p) => p as L.LatLngTuple));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [positions, map]);

  return null;
}

function HouseholdPopup({
  household,
  topElections,
  planAssignments,
}: {
  household: Household;
  topElections: Election[];
  planAssignments: Record<string, number> | null;
}) {
  const hasElectionData = topElections.length > 0;

  return (
    <div className="text-xs min-w-[200px]">
      <p className="font-semibold mb-1">{household.address}</p>
      <p className="text-zinc-500 mb-2">
        {household.city}, {household.state} {household.zip}
      </p>

      {hasElectionData && (
        <div className="flex items-center gap-0 mb-1 pl-[calc(8px+6px)]">
          <div className="flex-1" />
          <div className="flex gap-1.5">
            {topElections.map((e) => (
              <span key={e.date} className="text-[9px] text-zinc-400 w-[18px] text-center leading-tight">
                {shortElectionLabel(e)}
              </span>
            ))}
          </div>
        </div>
      )}

      {household.members.map((member) => {
        const score = voterScore(member);
        const tier = engagementTier(score);
        const color = ENGAGEMENT_COLORS[tier];
        const memberDates = new Set(member.elections.map((e) => e.date));
        const planDay = planAssignments ? planAssignments[member.id] : undefined;

        return (
          <div key={member.id} className="flex items-center gap-1.5 py-0.5">
            <span
              className="inline-block h-2 w-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="flex-1 truncate">
              {member.firstName} {member.lastName}
              {planDay != null && (
                <span className="ml-1 text-[9px] font-medium text-indigo-600">
                  Day {planDay}
                </span>
              )}
              {member.registrationStatus && (
                <span className={`ml-1 text-[9px] font-medium ${member.registrationStatus === "Active" ? "text-emerald-600" : "text-red-500"}`}>
                  {member.registrationStatus}
                </span>
              )}
            </span>
            {hasElectionData ? (
              <div className="flex gap-1.5 flex-shrink-0">
                {topElections.map((e) => (
                  <span
                    key={e.date}
                    className="inline-block w-[18px] text-center"
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: memberDates.has(e.date) ? "#18181b" : "transparent",
                        border: memberDates.has(e.date) ? "none" : "1.5px solid #d4d4d8",
                      }}
                    />
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-zinc-400 ml-auto flex-shrink-0">
                {member.voteCount} election{member.voteCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function VoterMap() {
  const {
    geocodedVoters,
    routes,
    selectedWalkerId,
    filters,
    finalizedPlan,
    planBuilding,
    campaignListIds,
  } = useVoterStore();

  const hasFinalizedPlan = Boolean(
    finalizedPlan && Object.keys(finalizedPlan.assignments).length > 0
  );
  const hasPlanBuildingList = planBuilding && campaignListIds.length > 0;
  const hasActivePlan = hasFinalizedPlan || hasPlanBuildingList;

  const planAssignments = finalizedPlan?.assignments ?? null;
  const activePlanDay = finalizedPlan?.activeDay ?? "all";
  const finalizedTravelMode = finalizedPlan?.travelMode ?? "walking";
  const showPlanRouteOverlays = hasFinalizedPlan && activePlanDay !== "all";
  const campaignListIdSet = useMemo(
    () => new Set(campaignListIds),
    [campaignListIds]
  );

  const filteredVoters = useMemo(() => {
    let voters = geocodedVoters;

    if (hasActivePlan) {
      voters = voters.filter((v) => {
        if (hasFinalizedPlan && planAssignments) {
          return planAssignments[v.id] != null;
        }
        return campaignListIdSet.has(v.id);
      });
    } else {
      if (filters.registrationStatus.length > 0) {
        const statuses = new Set(filters.registrationStatus);
        voters = voters.filter((v) => v.registrationStatus && statuses.has(v.registrationStatus));
      }

      if (filters.selectedElections.length > 0) {
        voters = voters.filter((v) =>
          filters.selectedElections.every((date) =>
            v.elections.some((e) => e.date === date)
          )
        );
      }

      if (filters.engagementTier !== "all") {
        voters = voters.filter((v) => engagementTier(voterScore(v)) === filters.engagementTier);
      }

      if (filters.primaryParty !== "all") {
        voters = voters.filter((v) => {
          if (filters.primaryParty === "unknown") return !v.primaryParty;
          return v.primaryParty === filters.primaryParty;
        });
      }
    }

    if (hasFinalizedPlan && planAssignments) {
      voters = voters.filter((v) => {
        const day = planAssignments[v.id];
        if (day == null) return false;
        if (activePlanDay === "all") return true;
        return day === activePlanDay;
      });
    }

    return voters;
  }, [
    geocodedVoters,
    filters,
    hasActivePlan,
    hasFinalizedPlan,
    planAssignments,
    activePlanDay,
    campaignListIdSet,
  ]);

  const households = useMemo(
    () => groupHouseholds(filteredVoters),
    [filteredVoters]
  );

  const topElections = useMemo(
    () => getTopElections(geocodedVoters, 5),
    [geocodedVoters]
  );

  const isOptimized = routes.length > 0 && !hasActivePlan;

  const voterColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const route of routes) {
      for (const voter of route.voters) {
        map.set(voter.id, route.color);
      }
    }
    return map;
  }, [routes]);

  const selectedVoterIds = useMemo(() => {
    if (hasActivePlan) return null;
    if (selectedWalkerId === null) return null;
    const route = routes.find((r) => r.walkerId === selectedWalkerId);
    if (!route) return null;
    return new Set(route.voters.map((v) => v.id));
  }, [routes, selectedWalkerId, hasActivePlan]);

  const visibleHouseholds = useMemo(() => {
    if (!selectedVoterIds) return households;
    return households
      .map((hh) => {
        const filteredMembers = hh.members.filter((m) => selectedVoterIds.has(m.id));
        if (filteredMembers.length === 0) return null;
        return { ...hh, members: filteredMembers, memberCount: filteredMembers.length };
      })
      .filter((hh): hh is Household => hh !== null);
  }, [households, selectedVoterIds]);

  const fitPositions = useMemo(
    () => visibleHouseholds.map((hh) => [hh.lat, hh.lng] as [number, number]),
    [visibleHouseholds]
  );

  const planDayRoutes = useMemo(() => {
    if (!showPlanRouteOverlays || !planAssignments) return [];

    const dayGroups = new Map<number, typeof filteredVoters>();
    for (const voter of filteredVoters) {
      const day = planAssignments[voter.id];
      if (day == null) continue;
      const existing = dayGroups.get(day);
      if (existing) {
        existing.push(voter);
      } else {
        dayGroups.set(day, [voter]);
      }
    }

    const routes = Array.from(dayGroups.entries())
      .sort(([a], [b]) => a - b)
      .map(([day, dayVoters]) => {
        if (dayVoters.length === 0) return null;

        const order = optimizeRouteOrder(dayVoters, { mode: finalizedTravelMode });
        const orderedVoters = order.map((idx) => dayVoters[idx]);
        const positions = orderedVoters.map((voter) => [voter.lat, voter.lng] as [number, number]);
        const distanceKm = totalRouteDistance(dayVoters, order);

        return {
          day,
          color: planDayColor(day),
          positions,
          doorCount: dayVoters.length,
          distanceKm: Math.round(distanceKm * 100) / 100,
        };
      })
      .filter((route): route is {
        day: number;
        color: string;
        positions: [number, number][];
        doorCount: number;
        distanceKm: number;
      } => Boolean(route));

    return routes;
  }, [
    showPlanRouteOverlays,
    planAssignments,
    filteredVoters,
    finalizedTravelMode,
  ]);

  function getHouseholdIcon(hh: Household): L.DivIcon {
    const size = markerSize(hh.memberCount);

    if (hasFinalizedPlan && planAssignments) {
      const dayCounts = new Map<number, number>();
      for (const member of hh.members) {
        const day = planAssignments[member.id];
        if (day == null) continue;
        dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
      }

      let majorityDay = 1;
      let maxCount = 0;
      for (const [day, count] of dayCounts.entries()) {
        if (count > maxCount) {
          majorityDay = day;
          maxCount = count;
        }
      }

      return createHouseholdIcon(size, planDayColor(majorityDay), "white");
    }

    if (isOptimized) {
      // Post-optimization: use majority walker color
      const colorCounts = new Map<string, number>();
      for (const member of hh.members) {
        const c = voterColorMap.get(member.id) || "#6366f1";
        colorCounts.set(c, (colorCounts.get(c) || 0) + 1);
      }
      let majorityColor = "#6366f1";
      let maxCount = 0;
      for (const [c, count] of colorCounts) {
        if (count > maxCount) {
          majorityColor = c;
          maxCount = count;
        }
      }
      return createHouseholdIcon(size, majorityColor, "white");
    }

    // Pre-optimization: party-based color (majority party of household members)
    const partyCounts: Record<string, number> = { R: 0, D: 0, unknown: 0 };
    for (const member of hh.members) {
      const key = member.primaryParty || "unknown";
      partyCounts[key] = (partyCounts[key] || 0) + 1;
    }
    let majorityParty = "unknown";
    let maxCount = 0;
    for (const [p, count] of Object.entries(partyCounts)) {
      if (count > maxCount) {
        majorityParty = p;
        maxCount = count;
      }
    }
    return createHouseholdIcon(size, PARTY_COLORS[majorityParty], "white");
  }

  return (
    <MapContainer
      center={ARMSTRONG_COUNTY_CENTER}
      zoom={DEFAULT_ZOOM}
      className="h-full w-full"
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {geocodedVoters.length > 0 && <FitBounds positions={fitPositions} />}

      {visibleHouseholds.map((hh) => (
        <Marker
          key={hh.id}
          position={[hh.lat, hh.lng]}
          icon={getHouseholdIcon(hh)}
        >
          <Popup>
            <HouseholdPopup
              household={hh}
              topElections={topElections}
              planAssignments={planAssignments}
            />
          </Popup>
        </Marker>
      ))}

      {planDayRoutes.map((route) => (
        <Polyline
          key={`plan-day-${route.day}`}
          positions={route.positions}
          pathOptions={{
            color: route.color,
            weight: 3,
            opacity: 0.9,
          }}
        >
          <Tooltip sticky>
            Day {route.day}: {route.doorCount} doors, {route.distanceKm} km
          </Tooltip>
        </Polyline>
      ))}

      {planDayRoutes.flatMap((route) => {
        const start = route.positions[0];
        const rawFinish = route.positions[route.positions.length - 1];
        const finish = rawFinish ? offsetFinishPosition(start, rawFinish) : null;
        if (!start || !finish) return [];

        return [
          <Marker
            key={`plan-day-${route.day}-start`}
            position={start}
            icon={createPlanEndpointIcon(route.color, "S")}
            zIndexOffset={1500}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
              Day {route.day} Start
            </Tooltip>
          </Marker>,
          <Marker
            key={`plan-day-${route.day}-finish`}
            position={finish}
            icon={createPlanEndpointIcon(route.color, "F")}
            zIndexOffset={1500}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
              Day {route.day} Finish
            </Tooltip>
          </Marker>,
        ];
      })}

      {!hasFinalizedPlan && <RouteLayer />}
      <MapLegend />
    </MapContainer>
  );
}
