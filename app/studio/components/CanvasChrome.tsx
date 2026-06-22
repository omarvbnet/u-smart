'use client';

import { FloorPlanToolbar } from './FloorPlanToolbar';
import { FloorSwitcher } from './FloorSwitcher';
import { MapOverlayToolbar } from './MapOverlayToolbar';
import { VisualizationToolbar } from './VisualizationToolbar';
import { Twin3DControls } from './Twin3DControls';
import { DesignAssistantPanel } from './DesignAssistantPanel';
import { ClientExperienceBar } from './ClientExperienceBar';

type CanvasChromeProps = {
  /** 2d = engineering/product plan; 3d = digital twin */
  variant: '2d' | '3d';
};

/** Unified canvas overlays — avoids toolbar overlap across view modes. */
export function CanvasChrome({ variant }: CanvasChromeProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex flex-col gap-2 p-2 sm:p-3">
      <header className="flex flex-wrap items-start gap-2">
        {variant === '2d' && (
          <div className="pointer-events-auto min-w-0 flex-1 basis-[min(100%,28rem)]">
            <FloorPlanToolbar docked />
          </div>
        )}
        <div className="pointer-events-auto mx-auto flex-shrink-0">
          <VisualizationToolbar docked />
        </div>
        <div className="pointer-events-auto ms-auto flex-shrink-0">
          <FloorSwitcher />
        </div>
      </header>

      <div className="flex-1" />

      <footer className="flex flex-wrap items-end gap-2">
        <div className="pointer-events-auto min-w-0 flex-1 basis-[min(100%,40rem)]">
          <MapOverlayToolbar docked />
        </div>
        {variant === '3d' && (
          <div className="pointer-events-auto ms-auto max-w-[min(100%,22rem)]">
            <Twin3DControls docked />
          </div>
        )}
      </footer>

      <DesignAssistantPanel />
      <ClientExperienceBar />
    </div>
  );
}
