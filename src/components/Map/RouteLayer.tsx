"use client";

import { Polyline, Tooltip } from "react-leaflet";
import { useVoterStore } from "@/store/voter-store";

export default function RouteLayer() {
  const { routes, selectedWalkerId } = useVoterStore();

  if (routes.length === 0) return null;

  return (
    <>
      {routes.map((route) => {
        const isSelected =
          selectedWalkerId === null || selectedWalkerId === route.walkerId;
        const positions = route.orderedVoters.map(
          (v) => [v.lat, v.lng] as [number, number]
        );

        if (positions.length < 2) return null;

        return (
          <Polyline
            key={route.walkerId}
            positions={positions}
            pathOptions={{
              color: route.color,
              weight: isSelected ? 3 : 1,
              opacity: isSelected ? 0.8 : 0.15,
            }}
          >
            <Tooltip sticky>
              Walker {route.walkerId + 1}: {route.doorCount} doors,{" "}
              {route.totalDistanceKm} km
            </Tooltip>
          </Polyline>
        );
      })}
    </>
  );
}
