import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Voter, GeocodedVoter, WalkerRoute, PipelineStage, PrimaryVotingMethod } from "@/lib/types";
import { NUM_WALKERS } from "@/lib/constants";

export interface VoterFilters {
  registrationStatus: string[];
  selectedElections: string[];
  engagementTier: "all" | "high" | "medium" | "low" | "none";
  primaryParty: "all" | "R" | "D" | "unknown";
  primaryVotingMethods: PrimaryVotingMethod[];
}

export interface FinalizedCampaignPlan {
  assignments: Record<string, number>;
  days: number;
  startDate: string;
  activeDay: "all" | number;
  travelMode: "walking" | "driving";
}

const DEFAULT_FILTERS: VoterFilters = {
  registrationStatus: [],
  selectedElections: [],
  engagementTier: "all",
  primaryParty: "all",
  primaryVotingMethods: [],
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
  selectedScrapes: string[];
  finalizedPlan: FinalizedCampaignPlan | null;

  // Campaign plan wizard state
  campaignDays: number;
  doorsPerDay: number;
  campaignStartDate: string;
  campaignListIds: string[];
  planBuilding: boolean;
  hasHydrated: boolean;

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
  setSelectedScrapes: (scrapes: string[]) => void;
  setFinalizedPlan: (plan: {
    assignments: Record<string, number>;
    days: number;
    startDate: string;
    travelMode?: "walking" | "driving";
  }) => void;
  setFinalizedPlanActiveDay: (day: "all" | number) => void;
  clearFinalizedPlan: () => void;
  clearFilters: () => void;
  setCampaignDays: (days: number) => void;
  setCampaignStartDate: (date: string) => void;
  setDoorsPerDay: (doors: number) => void;
  setCampaignListIds: (ids: string[]) => void;
  addToCampaignList: (ids: string[]) => void;
  removeFromCampaignList: (ids: string[]) => void;
  clearCampaignList: () => void;
  setPlanBuilding: (active: boolean) => void;
  setHasHydrated: (hydrated: boolean) => void;
  startPlanBuilding: (config: { days: number; startDate: string; doorsPerDay: number }) => void;
  resetPlanBuilding: () => void;
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
  selectedScrapes: [] as string[],
  finalizedPlan: null as FinalizedCampaignPlan | null,
  campaignDays: 3,
  doorsPerDay: 20,
  campaignStartDate: "",
  campaignListIds: [] as string[],
  planBuilding: false,
  hasHydrated: false,
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
          planBuilding: false,
          campaignListIds: [],
          campaignDays: 3,
          campaignStartDate: "",
          doorsPerDay: 20,
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
        set((state) => ({
          filters: {
            ...DEFAULT_FILTERS,
            ...state.filters,
            ...partial,
          },
        })),
      setSelectedScrapes: (scrapes) => set({ selectedScrapes: scrapes }),
      setFinalizedPlan: (plan) =>
        set({
          finalizedPlan: {
            assignments: { ...plan.assignments },
            days: plan.days,
            startDate: plan.startDate,
            activeDay: "all",
            travelMode: plan.travelMode ?? "walking",
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
      setCampaignDays: (days) =>
        set({
          campaignDays: Math.max(1, Math.min(30, Math.round(days))),
          finalizedPlan: null,
        }),
      setCampaignStartDate: (date) =>
        set({ campaignStartDate: date, finalizedPlan: null }),
      setDoorsPerDay: (doors) =>
        set({ doorsPerDay: Math.max(1, Math.round(doors)) }),
      setCampaignListIds: (ids) => set({ campaignListIds: ids }),
      addToCampaignList: (ids) =>
        set((state) => {
          const existing = new Set(state.campaignListIds);
          const next = [...state.campaignListIds];
          for (const id of ids) {
            if (!existing.has(id)) {
              existing.add(id);
              next.push(id);
            }
          }
          return { campaignListIds: next, finalizedPlan: null };
        }),
      removeFromCampaignList: (ids) =>
        set((state) => {
          const toRemove = new Set(ids);
          return {
            campaignListIds: state.campaignListIds.filter((id) => !toRemove.has(id)),
            finalizedPlan: null,
          };
        }),
      clearCampaignList: () =>
        set({ campaignListIds: [], finalizedPlan: null }),
      setPlanBuilding: (active) => set({ planBuilding: active }),
      setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),
      startPlanBuilding: (config) =>
        set({
          campaignDays: Math.max(1, Math.min(30, Math.round(config.days))),
          campaignStartDate: config.startDate,
          doorsPerDay: Math.max(1, Math.round(config.doorsPerDay)),
          planBuilding: true,
          campaignListIds: [],
          finalizedPlan: null,
        }),
      resetPlanBuilding: () =>
        set({
          campaignDays: 3,
          doorsPerDay: 20,
          campaignStartDate: "",
          campaignListIds: [],
          planBuilding: false,
          finalizedPlan: null,
        }),
      reset: () => set({ ...initialState, hasHydrated: true }),
    }),
    {
      name: "vote-mapper-storage",
      merge: (persistedState, currentState) => {
        const persisted = (persistedState || {}) as Partial<VoterStore>;
        return {
          ...currentState,
          numWalkers:
            typeof persisted.numWalkers === "number"
              ? persisted.numWalkers
              : currentState.numWalkers,
          selectedScrapes: Array.isArray(persisted.selectedScrapes)
            ? persisted.selectedScrapes
            : currentState.selectedScrapes,
          campaignDays:
            typeof persisted.campaignDays === "number"
              ? persisted.campaignDays
              : currentState.campaignDays,
          campaignStartDate:
            typeof persisted.campaignStartDate === "string"
              ? persisted.campaignStartDate
              : currentState.campaignStartDate,
          doorsPerDay:
            typeof persisted.doorsPerDay === "number"
              ? persisted.doorsPerDay
              : currentState.doorsPerDay,
          filters: {
            ...DEFAULT_FILTERS,
            ...(persisted.filters || {}),
          },
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.resetPlanBuilding();
        state?.setHasHydrated(true);
      },
      partialize: (state) => ({
        numWalkers: state.numWalkers,
        selectedScrapes: state.selectedScrapes,
        filters: state.filters,
        campaignDays: state.campaignDays,
        campaignStartDate: state.campaignStartDate,
        doorsPerDay: state.doorsPerDay,
      }),
    }
  )
);
