export const agents = Object.keys(modelsJson as Record<string, unknown>);

type RunRequestedState = Record<string, boolean>;

type DashboardState = {
  prompt: string;
  repoUrl: string;
  setupRepoUrl: string | null;
  runRequested: RunRequestedState;
  stopping: boolean;
};

type DashboardActions = {
  setPrompt: (prompt: string) => void;
  setRepoUrl: (repoUrl: string) => void;
  setSetupRepoUrl: (setupRepoUrl: string | null) => void;
  setStopping: (stopping: boolean) => void;
  launchAgent: (agent: string) => void;
  launchAllAgents: () => void;
  resetRunRequested: () => void;
};

type DashboardStore = DashboardState & DashboardActions;

const createRequestedState = (requested: boolean): RunRequestedState =>
  agents.reduce((acc, agent) => {
    acc[agent] = requested;
    return acc;
  }, {} as RunRequestedState);

export const createRunRequestedState = () => createRequestedState(false);
export const createLaunchedRequestedState = () => createRequestedState(true);

export const useDashboardStore = create<DashboardStore>()((set) => ({
  prompt: "",
  repoUrl: "",
  setupRepoUrl: null,
  runRequested: createRunRequestedState(),
  stopping: false,
  setPrompt: (prompt) => set({ prompt }),
  setRepoUrl: (repoUrl) => set({ repoUrl }),
  setSetupRepoUrl: (setupRepoUrl) => set({ setupRepoUrl }),
  setStopping: (stopping) => set({ stopping }),
  launchAgent: (agent) =>
    set((state) => ({
      runRequested: {
        ...state.runRequested,
        [agent]: true,
      },
    })),
  launchAllAgents: () => set({ runRequested: createLaunchedRequestedState() }),
  resetRunRequested: () => set({ runRequested: createRunRequestedState() }),
}));

const selectDashboardState = (state: DashboardStore) => ({
  prompt: state.prompt,
  repoUrl: state.repoUrl,
  setupRepoUrl: state.setupRepoUrl,
  runRequested: state.runRequested,
  stopping: state.stopping,
});

const selectDashboardActions = (state: DashboardStore) => ({
  setPrompt: state.setPrompt,
  setRepoUrl: state.setRepoUrl,
  setSetupRepoUrl: state.setSetupRepoUrl,
  setStopping: state.setStopping,
  launchAgent: state.launchAgent,
  launchAllAgents: state.launchAllAgents,
  resetRunRequested: state.resetRunRequested,
});

export const useDashboardState = () =>
  useDashboardStore(useShallow(selectDashboardState));

export const useDashboardActions = () =>
  useDashboardStore(useShallow(selectDashboardActions));

export const selectTrimmedRepoUrl = (state: DashboardStore) =>
  state.repoUrl.trim();

export const selectTrimmedPrompt = (state: DashboardStore) =>
  state.prompt.trim();

export const selectIsRepoSetup = (state: DashboardStore) => {
  const trimmedRepoUrl = state.repoUrl.trim();
  return trimmedRepoUrl.length > 0 && state.setupRepoUrl === trimmedRepoUrl;
};

export const selectLaunchedAgentCount = (state: DashboardStore) =>
  Object.values(state.runRequested).filter(Boolean).length;

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import modelsJson from "./models.json";
