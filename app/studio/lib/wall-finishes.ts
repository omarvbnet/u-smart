/**
 * Wall types, decorations, ceiling finishes, and color presets for plan + 3D.
 */
import type { StudioLocale } from './i18n';
import type { LocalizedText } from './catalog';

export type WallType = 'concrete' | 'brick' | 'drywall' | 'glass' | 'partition' | 'stone' | 'wood';
export type WallDecoration =
  | 'none'
  | 'paint'
  | 'wallpaper'
  | 'tile'
  | 'exposed_brick'
  | 'wood_panel'
  | 'baseboard'
  | 'crown_molding';
export type CeilingType = 'flat' | 'suspended' | 'coffered' | 'exposed' | 'acoustic';
export type CeilingDecoration = 'none' | 'paint' | 'acoustic_tile' | 'wood_slats';

const lt = (ar: string, en: string, ku: string, tr: string): LocalizedText => ({ ar, en, ku, tr });

export const WALL_TYPES: { id: WallType; label: LocalizedText; defaultColor: string }[] = [
  { id: 'concrete', label: lt('خرسانة', 'Concrete', 'کۆنکرît', 'Beton'), defaultColor: '#94a3b8' },
  { id: 'brick', label: lt('طوب', 'Brick', 'خشت', 'Tuğla'), defaultColor: '#b45309' },
  { id: 'drywall', label: lt('جبس', 'Drywall', 'دیواروویش', 'Alçıpan'), defaultColor: '#f1f5f9' },
  { id: 'glass', label: lt('زجاج', 'Glass', 'شووشە', 'Cam'), defaultColor: '#7dd3fc' },
  { id: 'partition', label: lt('فاصل', 'Partition', 'دیوار جیاکەر', 'Bölme'), defaultColor: '#cbd5e1' },
  { id: 'stone', label: lt('حجر', 'Stone', 'برد', 'Taş'), defaultColor: '#78716c' },
  { id: 'wood', label: lt('خشب', 'Wood', 'دار', 'Ahşap'), defaultColor: '#a16207' },
];

export const WALL_DECORATIONS: { id: WallDecoration; label: LocalizedText }[] = [
  { id: 'none', label: lt('بدون', 'None', 'هیچ', 'Yok') },
  { id: 'paint', label: lt('دهان', 'Paint', 'بویا', 'Boya') },
  { id: 'wallpaper', label: lt('ورق جدران', 'Wallpaper', 'کاغەزی دیوار', 'Duvar kağıdı') },
  { id: 'tile', label: lt('بلاط', 'Tile', 'کاشی', 'Fayans') },
  { id: 'exposed_brick', label: lt('طوب ظاهر', 'Exposed brick', 'خشتی دەرکەوتوو', 'Açık tuğla') },
  { id: 'wood_panel', label: lt('ألواح خشب', 'Wood panel', 'پانێلی دار', 'Ahşap panel') },
  { id: 'baseboard', label: lt('إطار أرضي', 'Baseboard', 'لاستیکی خوارەوە', 'Süpürgelik') },
  { id: 'crown_molding', label: lt('إطار سقف', 'Crown molding', 'لاستیکی سەرەوە', 'Kartonpiyer') },
];

export const CEILING_TYPES: { id: CeilingType; label: LocalizedText; defaultColor: string }[] = [
  { id: 'flat', label: lt('مسطح', 'Flat', 'تخت', 'Düz'), defaultColor: '#ffffff' },
  { id: 'suspended', label: lt('معلق', 'Suspended', 'وەسڵاو', 'Asma tavan'), defaultColor: '#f8fafc' },
  { id: 'coffered', label: lt('كassettes', 'Coffered', 'چوارگۆشەیی', 'Kaset tavan'), defaultColor: '#e2e8f0' },
  { id: 'exposed', label: lt('مكشوف', 'Exposed', 'دەرکەوتوو', 'Açık'), defaultColor: '#64748b' },
  { id: 'acoustic', label: lt('صوتي', 'Acoustic', 'دەنگی', 'Akustik'), defaultColor: '#f1f5f9' },
];

export const CEILING_DECORATIONS: { id: CeilingDecoration; label: LocalizedText }[] = [
  { id: 'none', label: lt('بدون', 'None', 'هیچ', 'Yok') },
  { id: 'paint', label: lt('دهان', 'Paint', 'بویا', 'Boya') },
  { id: 'acoustic_tile', label: lt('بلاط صوتي', 'Acoustic tile', 'کاشی دەنگی', 'Akustik fayans') },
  { id: 'wood_slats', label: lt('شرائح خشب', 'Wood slats', 'تەختەی دار', 'Ahşap lamine') },
];

export const WALL_COLOR_SWATCHES = [
  '#ffffff',
  '#f8fafc',
  '#e2e8f0',
  '#fef3c7',
  '#fecaca',
  '#bbf7d0',
  '#bae6fd',
  '#ddd6fe',
  '#78716c',
  '#1e293b',
  '#0ea5e9',
  '#16a34a',
];

export type CeilingMeta = {
  ceilingType?: CeilingType;
  color?: string;
  decoration?: CeilingDecoration;
};

export function labelForWallType(id: WallType | undefined, locale: StudioLocale): string {
  return WALL_TYPES.find((w) => w.id === id)?.label[locale] ?? WALL_TYPES.find((w) => w.id === id)?.label.en ?? id ?? '—';
}

export function labelForDecoration(id: WallDecoration | undefined, locale: StudioLocale): string {
  return WALL_DECORATIONS.find((d) => d.id === id)?.label[locale] ?? id ?? '—';
}

export function labelForCeilingType(id: CeilingType | undefined, locale: StudioLocale): string {
  return CEILING_TYPES.find((c) => c.id === id)?.label[locale] ?? id ?? '—';
}

export function defaultWallColor(wallType: WallType | undefined, outdoor?: boolean): string {
  if (outdoor) return '#64748b';
  return WALL_TYPES.find((w) => w.id === wallType)?.defaultColor ?? '#94a3b8';
}

export function resolveWallColor(w: {
  color?: string;
  wallType?: WallType;
  outdoor?: boolean;
}): string {
  return w.color ?? defaultWallColor(w.wallType, w.outdoor);
}

export function wallPlanStyle(w: {
  color?: string;
  wallType?: WallType;
  decoration?: WallDecoration;
  outdoor?: boolean;
}): { backgroundColor: string; opacity: number; borderStyle: string } {
  const color = resolveWallColor(w);
  const glass = w.wallType === 'glass';
  const tile = w.decoration === 'tile';
  return {
    backgroundColor: color,
    opacity: glass ? 0.45 : tile ? 0.92 : 0.82,
    borderStyle: w.decoration === 'exposed_brick' ? 'dashed' : 'solid',
  };
}

export function wall3dMaterial(
  w: {
    color?: string;
    wallType?: WallType;
    decoration?: WallDecoration;
    outdoor?: boolean;
  },
  opts?: { interiorView?: boolean; focusView?: boolean },
): {
  color: string;
  roughness: number;
  metalness: number;
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
} {
  const color = resolveWallColor(w);
  const glass = w.wallType === 'glass';
  const stone = w.wallType === 'stone' || w.wallType === 'brick';
  if (opts?.focusView) {
    return {
      color,
      roughness: glass ? 0.08 : stone ? 0.88 : 0.7,
      metalness: glass ? 0.25 : 0,
      transparent: glass,
      opacity: glass ? 0.42 : 0.92,
      depthWrite: !glass,
    };
  }
  if (opts?.interiorView) {
    return {
      color,
      roughness: glass ? 0.04 : stone ? 0.85 : 0.65,
      metalness: glass ? 0.35 : 0,
      transparent: true,
      opacity: glass ? 0.18 : w.wallType === 'partition' ? 0.28 : 0.38,
      depthWrite: false,
    };
  }
  return {
    color,
    roughness: glass ? 0.05 : stone ? 0.95 : 0.75,
    metalness: glass ? 0.2 : 0,
    transparent: glass,
    opacity: glass ? 0.35 : 1,
    depthWrite: !glass,
  };
}

export function ceiling3dMaterial(
  meta: CeilingMeta | undefined,
  opts?: { interiorView?: boolean; focusView?: boolean },
): { color: string; roughness: number; transparent: boolean; opacity: number; depthWrite: boolean } {
  const type = meta?.ceilingType ?? 'flat';
  const preset = CEILING_TYPES.find((c) => c.id === type);
  const base = {
    color: meta?.color ?? preset?.defaultColor ?? '#ffffff',
    roughness: type === 'acoustic' ? 0.95 : type === 'coffered' ? 0.6 : 0.85,
  };
  if (opts?.focusView) {
    return { ...base, transparent: false, opacity: 0.95, depthWrite: true };
  }
  if (opts?.interiorView) {
    return { ...base, transparent: true, opacity: 0.22, depthWrite: false };
  }
  return { ...base, transparent: false, opacity: 1, depthWrite: true };
}
