import type { CatalogEntry } from './types';

/** IEC-style single-line / floor-plan symbol identifiers. */
export type EngineeringSymbolId =
  | 'lighting'
  | 'socket'
  | 'switch'
  | 'distribution_board'
  | 'mcb'
  | 'mccb'
  | 'rcd'
  | 'fuse'
  | 'spd'
  | 'source'
  | 'motor'
  | 'hvac_indoor'
  | 'hvac_outdoor'
  | 'hvac_plant'
  | 'knx_device'
  | 'hdl_device'
  | 'sensor'
  | 'camera'
  | 'access_control'
  | 'cable'
  | 'generic';

export function engineeringSymbolFor(entry: CatalogEntry): EngineeringSymbolId {
  switch (entry.domain) {
    case 'load':
      if (entry.category === 'LIGHTING') return 'lighting';
      if (entry.category === 'SOCKET') return 'socket';
      if (entry.category === 'PANEL') return 'distribution_board';
      if (entry.category === 'MOTOR') return 'motor';
      return 'generic';
    case 'protection':
      if (entry.protectionType === 'MCB' || entry.protectionType === 'RCBO') return 'mcb';
      if (entry.protectionType === 'MCCB' || entry.protectionType === 'ACB') return 'mccb';
      if (entry.protectionType === 'RCCB') return 'rcd';
      if (entry.protectionType === 'FUSE') return 'fuse';
      if (entry.protectionType === 'SPD') return 'spd';
      return 'mcb';
    case 'source':
      return 'source';
    case 'hvac':
      if (entry.hvacType === 'SPLIT' || entry.hvacType === 'VRF' || entry.hvacType === 'FCU') return 'hvac_indoor';
      if (entry.hvacType === 'CHILLER' || entry.hvacType === 'AHU' || entry.hvacType === 'PACKAGE') return 'hvac_plant';
      return 'hvac_outdoor';
    case 'sensor':
      return 'sensor';
    case 'smarthome': {
      const dc = entry.deviceClass.toLowerCase();
      if (dc.includes('touch') || dc.includes('input') || dc.includes('scene')) return 'switch';
      if (dc.includes('camera')) return 'camera';
      if (dc.includes('access') || dc.includes('hotel')) return 'access_control';
      return entry.protocol === 'KNX' ? 'knx_device' : 'hdl_device';
    }
    case 'cable':
      return 'cable';
    default:
      return 'generic';
  }
}
