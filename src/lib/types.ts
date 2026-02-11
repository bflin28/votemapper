export interface Election {
  date: string;
  type: string;
}

export type PrimaryVotingMethod = "EV" | "ED" | "AV";

export interface RepPrimaryVoteRecord {
  year: number;
  method: PrimaryVotingMethod;
}

export interface Voter {
  id: string;
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  party?: string;
  age?: number;
  voteCount: number;
  lastVoted: string | null;
  elections: Election[];
  registrationStatus: string | null;
  primaryParty?: "R" | "D" | null;
  repPrimaryVotes?: RepPrimaryVoteRecord[];
}

export interface GeocodedVoter extends Voter {
  lat: number;
  lng: number;
  geocodeStatus: "matched" | "unmatched";
}

export interface WalkerRoute {
  walkerId: number;
  color: string;
  voters: GeocodedVoter[];
  orderedVoters: GeocodedVoter[];
  totalDistanceKm: number;
  doorCount: number;
}

export interface Household {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  members: GeocodedVoter[];
  score: number;
  memberCount: number;
}

export type PipelineStage =
  | "idle"
  | "importing"
  | "imported"
  | "geocoding"
  | "geocoded"
  | "optimizing"
  | "optimized";
