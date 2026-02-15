export const agents = Object.keys(modelsJson as Record<string, unknown>);

type RunRequestedState = Record<string, boolean>;

type DashboardState = {
  prompt: string;
  repoUrlInput: string;
  activeRepoUrl: string | null;
  runRequested: RunRequestedState;
  isStoppingAgents: boolean;
};

const createRequestedState = (requested: boolean): RunRequestedState =>
  agents.reduce((acc, agent) => {
    acc[agent] = requested;
    return acc;
  }, {} as RunRequestedState);

export const createRunRequestedState = () => createRequestedState(false);
export const createLaunchedRequestedState = () => createRequestedState(true);

export const useDashboardStore = create<DashboardState>()(() => ({
  prompt: "",
  repoUrlInput: "",
  activeRepoUrl: null,
  runRequested: createRunRequestedState(),
  isStoppingAgents: false,
}));

export const setPrompt = (prompt: string) => {
  useDashboardStore.setState({ prompt });
};

export const setRepoUrlInput = (repoUrlInput: string) => {
  useDashboardStore.setState({ repoUrlInput });
};

export const setActiveRepoUrl = (activeRepoUrl: string | null) => {
  useDashboardStore.setState({ activeRepoUrl });
};

export const setIsStoppingAgents = (isStoppingAgents: boolean) => {
  useDashboardStore.setState({ isStoppingAgents });
};

export const launchAgent = (agent: string) => {
  useDashboardStore.setState((state) => ({
    runRequested: {
      ...state.runRequested,
      [agent]: true,
    },
  }));
};

export const launchAllAgents = () => {
  useDashboardStore.setState({ runRequested: createLaunchedRequestedState() });
};

export const resetRunRequested = () => {
  useDashboardStore.setState({ runRequested: createRunRequestedState() });
};

export const selectPrompt = (state: DashboardState) => state.prompt;

export const selectRepoUrlInput = (state: DashboardState) => state.repoUrlInput;

export const selectRunRequested = (state: DashboardState) => state.runRequested;

export const selectIsStoppingAgents = (state: DashboardState) =>
  state.isStoppingAgents;

export const selectTrimmedRepoUrlInput = (state: DashboardState) =>
  state.repoUrlInput.trim();

export const selectTrimmedPrompt = (state: DashboardState) =>
  state.prompt.trim();

export const selectIsRepoReady = (state: DashboardState) => {
  const trimmedRepoUrlInput = state.repoUrlInput.trim();
  return (
    trimmedRepoUrlInput.length > 0 &&
    state.activeRepoUrl === trimmedRepoUrlInput
  );
};

export const selectLaunchedAgentCount = (state: DashboardState) =>
  Object.values(state.runRequested).filter(Boolean).length;

import { create } from "zustand";
import modelsJson from "./models.json";
