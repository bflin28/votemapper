import clustersKmeans from "@turf/clusters-kmeans";
import { featureCollection, point } from "@turf/helpers";
import { GeocodedVoter } from "./types";
import { NUM_WALKERS } from "./constants";

export function clusterVoters(
  voters: GeocodedVoter[],
  numClusters: number = NUM_WALKERS
): Map<number, GeocodedVoter[]> {
  const features = featureCollection(
    voters.map((v) =>
      point([v.lng, v.lat], { voterId: v.id })
    )
  );

  const clustered = clustersKmeans(features, {
    numberOfClusters: Math.min(numClusters, voters.length),
  });

  const clusters = new Map<number, GeocodedVoter[]>();
  const voterMap = new Map(voters.map((v) => [v.id, v]));

  for (const feature of clustered.features) {
    const clusterId = feature.properties?.cluster ?? 0;
    const voterId = feature.properties?.voterId;
    const voter = voterMap.get(voterId);
    if (!voter) continue;

    if (!clusters.has(clusterId)) {
      clusters.set(clusterId, []);
    }
    clusters.get(clusterId)!.push(voter);
  }

  return clusters;
}
