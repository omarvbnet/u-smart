'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { ExperienceMode, VisualizationMode } from '../lib/visualization/modes';

export type CanvasUiState = {
  simulating: boolean;
  visualizationMode: VisualizationMode;
  experienceMode: ExperienceMode;
};

const CanvasUiContext = createContext<CanvasUiState>({
  simulating: false,
  visualizationMode: 'engineering',
  experienceMode: 'engineer',
});

export function CanvasUiProvider({ value, children }: { value: CanvasUiState; children: ReactNode }) {
  return <CanvasUiContext.Provider value={value}>{children}</CanvasUiContext.Provider>;
}

export function useCanvasUi() {
  return useContext(CanvasUiContext);
}
