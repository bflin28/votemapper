"use client";

import dynamic from "next/dynamic";

const VoterMap = dynamic(() => import("./VoterMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-100">
      <p className="text-sm text-zinc-500">Loading map...</p>
    </div>
  ),
});

export default function MapContainer() {
  return <VoterMap />;
}
