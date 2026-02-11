"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar/Sidebar";
import MapContainer from "@/components/Map/MapContainer";
import VoterTable from "@/components/VoterTable";
import PlanView from "@/components/PlanView";
import { useVoterStore } from "@/store/voter-store";

type View = "map" | "table" | "plan";

export default function InternalTool() {
  const [view, setView] = useState<View>("plan");
  const hasVoters = useVoterStore((s) => s.voters.length > 0);
  const planBuilding = useVoterStore((s) => s.planBuilding);
  const finalizedPlan = useVoterStore((s) => s.finalizedPlan);

  const showSidebar = view !== "plan" || planBuilding || Boolean(finalizedPlan);

  return (
    <div className="flex h-screen w-screen overflow-hidden print:block print:h-auto print:w-auto print:overflow-visible">
      {showSidebar && (
        <div className="print:hidden">
          <Sidebar />
        </div>
      )}
      <div className="flex flex-1 flex-col print:block print:h-auto">
        {/* View toggle — only shown when voters are imported */}
        {hasVoters && (
          <div className="flex items-center gap-1 border-b border-zinc-200 bg-white px-3 py-1.5 print:hidden">
            <button
              onClick={() => setView("plan")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                view === "plan"
                  ? "bg-indigo-600 text-white"
                  : "text-indigo-600 hover:bg-indigo-50"
              }`}
            >
              Plan
            </button>
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
        <main className="flex-1 min-h-0 print:h-auto print:min-h-0 print:overflow-visible">
          {view === "map" && <MapContainer />}
          {view === "table" && <VoterTable />}
          {view === "plan" && <PlanView />}
        </main>
      </div>
    </div>
  );
}
