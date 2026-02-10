"use client";

import { useState } from "react";
import { useVoterStore } from "@/store/voter-store";
import { WalkerRoute } from "@/lib/types";

function WalkerCard({
  route,
  isSelected,
  onToggle,
}: {
  route: WalkerRoute;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-lg border transition-colors ${
        isSelected
          ? "border-zinc-300 bg-zinc-50"
          : "border-zinc-100 bg-white"
      }`}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 p-2.5"
      >
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: route.color }}
        />
        <span className="text-xs font-medium text-zinc-700">
          Walker {route.walkerId + 1}
        </span>
        <span className="ml-auto text-xs text-zinc-400">
          {route.doorCount} doors
        </span>
        <span className="text-xs text-zinc-400">
          {route.totalDistanceKm} km
        </span>
      </button>

      {isSelected && (
        <div className="border-t border-zinc-100 px-2.5 pb-2.5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="py-1.5 text-xs text-indigo-600 hover:text-indigo-800"
          >
            {expanded ? "Hide addresses" : "Show addresses"}
          </button>

          {expanded && (
            <ol className="flex flex-col gap-0.5">
              {route.orderedVoters.map((voter, idx) => (
                <li
                  key={voter.id}
                  className="flex items-start gap-1.5 text-xs text-zinc-500"
                >
                  <span className="w-4 shrink-0 text-right text-zinc-300">
                    {idx + 1}.
                  </span>
                  <div>
                    <span className="font-medium text-zinc-600">
                      {voter.firstName} {voter.lastName}
                    </span>
                    <span className="ml-1 text-zinc-400">
                      {voter.address}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

export default function WalkerList() {
  const { routes, selectedWalkerId, setSelectedWalkerId } = useVoterStore();

  if (routes.length === 0) return null;

  const totalDoors = routes.reduce((s, r) => s + r.doorCount, 0);
  const totalDist = routes.reduce((s, r) => s + r.totalDistanceKm, 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-700">Route Summary</h3>
        <span className="text-xs text-zinc-400">
          {totalDoors} doors / {totalDist.toFixed(1)} km total
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {routes.map((route) => (
          <WalkerCard
            key={route.walkerId}
            route={route}
            isSelected={selectedWalkerId === route.walkerId}
            onToggle={() =>
              setSelectedWalkerId(
                selectedWalkerId === route.walkerId
                  ? null
                  : route.walkerId
              )
            }
          />
        ))}
      </div>
    </div>
  );
}
