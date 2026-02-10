import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Voter, GeocodedVoter, WalkerRoute, PipelineStage } from "@/lib/types";
import { NUM_WALKERS } from "@/lib/constants";

export interface VoterFilters {
  registrationStatus: string[];
  selectedElections: string[];
  engagementTier: "all" | "high" | "medium" | "low" | "none";
  primaryParty: "all" | "R" | "D" | "unknown";
}

export type ColorMode = "engagement" | "party";

export interface FinalizedCampaignPlan {
  assignments: Record<string, number>;
  days: number;
  startDate: string;
  activeDay: "all" | number;
}

const DEFAULT_FILTERS: VoterFilters = {
  registrationStatus: [],
  selectedElections: [],
  engagementTier: "all",
  primaryParty: "all",
};

interface VoterStore {
  // Data
  voters: Voter[];
  geocodedVoters: GeocodedVoter[];
  unmatchedVoters: Voter[];
  routes: WalkerRoute[];

  // UI state
  stage: PipelineStage;
  progress: { current: number; total: number } | null;
  error: string | null;
  selectedWalkerId: number | null;
  importErrors: string[];
  numWalkers: number;
  filters: VoterFilters;
  colorMode: ColorMode;
  finalizedPlan: FinalizedCampaignPlan | null;

  // Actions
  setVoters: (voters: Voter[], errors?: string[]) => void;
  setGeocodedVoters: (geocoded: GeocodedVoter[], unmatched: Voter[]) => void;
  setRoutes: (routes: WalkerRoute[]) => void;
  setStage: (stage: PipelineStage) => void;
  setProgress: (current: number, total: number) => void;
  clearProgress: () => void;
  setError: (error: string | null) => void;
  setSelectedWalkerId: (id: number | null) => void;
  setNumWalkers: (n: number) => void;
  setFilters: (filters: Partial<VoterFilters>) => void;
  setColorMode: (mode: ColorMode) => void;
  setFinalizedPlan: (plan: {
    assignments: Record<string, number>;
    days: number;
    startDate: string;
  }) => void;
  setFinalizedPlanActiveDay: (day: "all" | number) => void;
  clearFinalizedPlan: () => void;
  clearFilters: () => void;
  reset: () => void;
}

const initialState = {
  voters: [],
  geocodedVoters: [],
  unmatchedVoters: [],
  routes: [],
  stage: "idle" as PipelineStage,
  progress: null,
  error: null,
  selectedWalkerId: null,
  importErrors: [],
  numWalkers: NUM_WALKERS,
  filters: { ...DEFAULT_FILTERS },
  colorMode: "engagement" as ColorMode,
  finalizedPlan: null as FinalizedCampaignPlan | null,
};

export const useVoterStore = create<VoterStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setVoters: (voters, errors = []) =>
        set({
          voters,
          importErrors: errors,
          stage: "imported",
          error: null,
          // Clear downstream data
          geocodedVoters: [],
          unmatchedVoters: [],
          routes: [],
          selectedWalkerId: null,
          finalizedPlan: null,
        }),

      setGeocodedVoters: (geocoded, unmatched) =>
        set({
          geocodedVoters: geocoded,
          unmatchedVoters: unmatched,
          stage: "geocoded",
          progress: null,
        }),

      setRoutes: (routes) =>
        set({
          routes,
          stage: "optimized",
          progress: null,
        }),

      setStage: (stage) => set({ stage }),
      setProgress: (current, total) => set({ progress: { current, total } }),
      clearProgress: () => set({ progress: null }),
      setError: (error) => set({ error, progress: null }),
      setSelectedWalkerId: (id) => set({ selectedWalkerId: id }),
      setNumWalkers: (n) => {
        const updates: Partial<VoterStore> = { numWalkers: n };
        if (get().stage === "optimized") {
          updates.routes = [];
          updates.stage = "geocoded";
          updates.selectedWalkerId = null;
        }
        set(updates);
      },
      setFilters: (partial) =>
        set((state) => ({ filters: { ...state.filters, ...partial } })),
      setColorMode: (mode) => set({ colorMode: mode }),
      setFinalizedPlan: (plan) =>
        set({
          finalizedPlan: {
            assignments: { ...plan.assignments },
            days: plan.days,
            startDate: plan.startDate,
            activeDay: "all",
          },
        }),
      setFinalizedPlanActiveDay: (day) =>
        set((state) =>
          state.finalizedPlan
            ? { finalizedPlan: { ...state.finalizedPlan, activeDay: day } }
            : {}
        ),
      clearFinalizedPlan: () => set({ finalizedPlan: null }),
      clearFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),
      reset: () => set(initialState),
    }),
    {
      name: "vote-mapper-storage",
      partialize: (state) => ({
        voters: state.voters,
        geocodedVoters: state.geocodedVoters,
        unmatchedVoters: state.unmatchedVoters,
        routes: state.routes,
        stage: state.stage,
        importErrors: state.importErrors,
        numWalkers: state.numWalkers,
        finalizedPlan: state.finalizedPlan,
      }),
    }
  )
);
