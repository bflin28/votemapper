"use client";

import { useEffect, useState } from "react";
import type { CampaignRow } from "@/lib/db";
import { useVoterStore } from "@/store/voter-store";
import MapContainer from "@/components/Map/MapContainer";
import VoterTable from "@/components/VoterTable";
import CampaignSidebar from "@/components/CampaignSidebar";

type View = "map" | "table";

export default function CampaignView({ campaign }: { campaign: CampaignRow }) {
  const [view, setView] = useState<View>("map");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const store = useVoterStore.getState();
    const d = campaign.data;

    // Hydrate store with campaign data (bypass the pipeline stage setters)
    useVoterStore.setState({
      voters: d.voters || [],
      geocodedVoters: d.geocodedVoters || [],
      unmatchedVoters: d.unmatchedVoters || [],
      routes: d.routes || [],
      stage: d.routes?.length ? "optimized" : d.geocodedVoters?.length ? "geocoded" : "imported",
      numWalkers: d.numWalkers || store.numWalkers,
      selectedWalkerId: null,
      error: null,
      progress: null,
      importErrors: [],
    });

    setHydrated(true);
  }, [campaign]);

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-400">Loading campaign...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <CampaignSidebar campaign={campaign} />
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-3 py-1.5">
          <button
            onClick={() => setView("map")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              view === "map"
                ? "bg-slate-900 text-white"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Map
          </button>
          <button
            onClick={() => setView("table")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              view === "table"
                ? "bg-slate-900 text-white"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Table
          </button>
        </div>
        <main className="flex-1 min-h-0">
          {view === "map" ? <MapContainer /> : <VoterTable />}
        </main>
      </div>
    </div>
  );
}
