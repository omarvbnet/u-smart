/** How components are rendered on the digital twin canvas. */
export type VisualizationMode = 'engineering' | 'product' | '3d';

/** Engineer workspace vs immersive client walkthrough. */
export type ExperienceMode = 'engineer' | 'client';

export const VISUALIZATION_MODES: VisualizationMode[] = ['engineering', 'product', '3d'];
