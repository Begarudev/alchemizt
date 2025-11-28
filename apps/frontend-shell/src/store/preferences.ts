import { create } from "zustand";
import type { MatchMode } from "@alchemizt/contracts";

interface PreferencesState {
  hostHandle: string;
  participantHandle: string;
  mode: MatchMode;
  puzzleId: string;
  countdownSeconds: number;
  totalSeconds: number;
  setHostHandle: (handle: string) => void;
  setParticipantHandle: (handle: string) => void;
  setMode: (mode: MatchMode) => void;
  setPuzzleId: (puzzleId: string) => void;
  setCountdownSeconds: (seconds: number) => void;
  setTotalSeconds: (seconds: number) => void;
}

const DEFAULT_STATE: Omit<PreferencesState, keyof PreferencesActions> = {
  hostHandle: "chemist-host",
  participantHandle: "chemist-01",
  mode: "speedrun",
  puzzleId: "pz_001",
  countdownSeconds: 5,
  totalSeconds: 300,
} as const;

type PreferencesActions = Pick<
  PreferencesState,
  | "setHostHandle"
  | "setParticipantHandle"
  | "setMode"
  | "setPuzzleId"
  | "setCountdownSeconds"
  | "setTotalSeconds"
>;

export const usePreferencesStore = create<PreferencesState>((set) => ({
  ...DEFAULT_STATE,
  setHostHandle: (hostHandle) => set({ hostHandle }),
  setParticipantHandle: (participantHandle) => set({ participantHandle }),
  setMode: (mode) => set({ mode }),
  setPuzzleId: (puzzleId) => set({ puzzleId }),
  setCountdownSeconds: (countdownSeconds) => set({ countdownSeconds }),
  setTotalSeconds: (totalSeconds) => set({ totalSeconds }),
}));

