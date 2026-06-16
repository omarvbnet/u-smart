/**
 * Purpose-based interactive controls. Each component exposes the controls that
 * match its real-world function (a breaker trips/closes, a dimmer dims, a
 * curtain opens, an AC has a setpoint, a sensor can be triggered, etc.).
 */
import type { CatalogEntry, LocalizedText } from './catalog';

export type ControlKind = 'toggle' | 'slider' | 'setpoint' | 'trigger';

export type ControlDef = {
  key: 'on' | 'level' | 'setpoint' | 'active';
  kind: ControlKind;
  label: LocalizedText;
  min?: number;
  max?: number;
  unit?: string;
  /** Default value: boolean for toggle/trigger, number for slider/setpoint. */
  default: boolean | number;
};

const L = (ar: string, en: string, ku: string, tr: string): LocalizedText => ({ ar, en, ku, tr });

const ON = L('تشغيل', 'Power', 'هێز', 'Güç');
const CLOSED = L('القاطع مغلق', 'Breaker closed', 'برەیکەر داخراو', 'Kesici kapalı');

export function controlsForEntry(entry: CatalogEntry): ControlDef[] {
  switch (entry.domain) {
    case 'source':
      return [{ key: 'on', kind: 'toggle', label: ON, default: true }];
    case 'protection':
      if (entry.protectionType === 'SPD') return [];
      return [{ key: 'on', kind: 'toggle', label: CLOSED, default: true }];
    case 'load':
      if (entry.category === 'LIGHTING')
        return [
          { key: 'on', kind: 'toggle', label: ON, default: true },
          { key: 'level', kind: 'slider', label: L('السطوع', 'Brightness', 'ڕووناکی', 'Parlaklık'), min: 0, max: 100, unit: '%', default: 100 },
        ];
      return [{ key: 'on', kind: 'toggle', label: ON, default: true }];
    case 'hvac':
      return [
        { key: 'on', kind: 'toggle', label: ON, default: true },
        { key: 'setpoint', kind: 'setpoint', label: L('درجة الحرارة', 'Setpoint', 'پلەی گەرمی', 'Ayar sıcaklığı'), min: 16, max: 30, unit: '°C', default: 24 },
      ];
    case 'sensor':
      return [{ key: 'active', kind: 'trigger', label: L('تفعيل الحساس', 'Trigger sensor', 'کارپێکردنی هەستەوەر', 'Sensörü tetikle'), default: false }];
    case 'smarthome': {
      const dc = entry.deviceClass.toLowerCase();
      if (dc.includes('dimmer'))
        return [{ key: 'level', kind: 'slider', label: L('مستوى الإضاءة', 'Dim level', 'ئاستی ڕووناکی', 'Karartma'), min: 0, max: 100, unit: '%', default: 100 }];
      if (dc.includes('curtain'))
        return [{ key: 'level', kind: 'slider', label: L('فتح الستارة', 'Curtain open', 'کردنەوەی پەردە', 'Perde açıklığı'), min: 0, max: 100, unit: '%', default: 0 }];
      if (entry.channelCurrentA != null)
        return [{ key: 'on', kind: 'toggle', label: L('تشغيل القنوات', 'Channels on', 'کەناڵەکان', 'Kanallar'), default: false }];
      if (dc.includes('panel') || dc.includes('touch') || dc.includes('scene') || dc.includes('input'))
        return [{ key: 'active', kind: 'trigger', label: L('ضغط', 'Press', 'پەستان', 'Bas'), default: false }];
      return [{ key: 'on', kind: 'toggle', label: ON, default: true }];
    }
    default:
      return [];
  }
}

export type ControlState = { on?: boolean; level?: number; setpoint?: number; active?: boolean };

export function defaultControlState(entry: CatalogEntry): ControlState {
  const state: ControlState = {};
  for (const c of controlsForEntry(entry)) {
    if (c.kind === 'toggle' || c.kind === 'trigger') state[c.key as 'on' | 'active'] = c.default as boolean;
    else state[c.key as 'level' | 'setpoint'] = c.default as number;
  }
  return state;
}
