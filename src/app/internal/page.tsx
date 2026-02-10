"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar/Sidebar";
import MapContainer from "@/components/Map/MapContainer";
import VoterTable from "@/components/VoterTable";
import { useVoterStore } from "@/store/voter-store";

type View = "map" | "table";

export default function InternalTool() {
  const [view, setView] = useState<View>("map");
  const hasVoters = useVoterStore((s) => s.voters.length > 0);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        {/* View toggle — only shown when voters are imported */}
        {hasVoters && (
          <div className="flex items-center gap-1 border-b border-zinc-200 bg-white px-3 py-1.5">
            <button
              onClick={() => setView("map")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                view === "map"
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Map
            </button>
            <button
              onClick={() => setView("table")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                view === "table"
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Table
            </button>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 min-h-0">
          {view === "map" ? <MapContainer /> : <VoterTable />}
        </main>
      </div>
    </div>
  );
}
