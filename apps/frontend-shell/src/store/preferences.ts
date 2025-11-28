import { create } from "zustand";
import type { MatchMode } from "@alchemizt/contracts";

interface PreferencesState {
  hostHandle: string;
  participantHandle: string;
  mode: MatchMode;
  puzzleId: string;
  setHostHandle: (handle: string) => void;
  setParticipantHandle: (handle: string) => void;
  setMode: (mode: MatchMode) => void;
  setPuzzleId: (puzzleId: string) => void;
}

const DEFAULT_STATE: Omit<PreferencesState, keyof PreferencesActions> = {
  hostHandle: "chemist-host",
  participantHandle: "chemist-01",
  mode: "speedrun",
  puzzleId: "pz-carbonyl-01",
} as const;

type PreferencesActions = Pick<
  PreferencesState,
  | "setHostHandle"
  | "setParticipantHandle"
  | "setMode"
  | "setPuzzleId"
>;

export const usePreferencesStore = create<PreferencesState>((set) => ({
  ...DEFAULT_STATE,
  setHostHandle: (hostHandle) => set({ hostHandle }),
  setParticipantHandle: (participantHandle) => set({ participantHandle }),
  setMode: (mode) => set({ mode }),
  setPuzzleId: (puzzleId) => set({ puzzleId }),
}));

