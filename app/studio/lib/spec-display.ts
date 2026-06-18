import { CATALOG, type CatalogEntry } from './catalog';

/** Human-readable spec rows per domain (properties panel + hover cards). */
export function specRows(entry: CatalogEntry): { label: string; value: string }[] {
  switch (entry.domain) {
    case 'cable':
      return [
        { label: 'CSA', value: `${entry.csaMm2} mm²` },
        { label: 'Ampacity', value: `${entry.ampacityA} A` },
        { label: 'Cores', value: `${entry.coreCount}` },
        { label: 'V rating', value: `${entry.voltageRating} V` },
        { label: 'R', value: `${entry.resistanceOhmPerKm} Ω/km` },
        { label: 'Cost/m', value: `${entry.costPerMeter}` },
      ];
    case 'protection':
      return [
        { label: 'In', value: `${entry.ratedCurrentA} A` },
        { label: 'Poles', value: `${entry.poles}P` },
        { label: 'Icu', value: `${entry.breakingCapacityKA} kA` },
        { label: 'Curve', value: entry.tripCurve },
        ...(entry.residualSensitivityMa ? [{ label: 'IΔn', value: `${entry.residualSensitivityMa} mA` }] : []),
      ];
    case 'source':
      return [
        { label: 'Type', value: entry.sourceType },
        { label: 'Voltage', value: `${entry.voltage} V` },
        { label: 'kVA', value: `${entry.ratedKva}` },
        { label: 'PF', value: `${entry.powerFactor}` },
        { label: 'η', value: `${(entry.efficiency * 100).toFixed(0)}%` },
        { label: 'Isc', value: `${entry.scContributionKA} kA` },
      ];
    case 'load':
      return [
        { label: 'Power', value: `${entry.powerW} W` },
        { label: 'Voltage', value: `${entry.voltage} V` },
        { label: 'Phases', value: `${entry.phases}` },
        { label: 'PF', value: `${entry.powerFactor}` },
        { label: 'Demand', value: `${entry.demandFactor}` },
      ];
    case 'hvac':
      return [
        { label: 'Cooling', value: `${entry.coolingKw} kW` },
        { label: 'Heating', value: `${entry.heatingKw} kW` },
        { label: 'Input', value: `${entry.inputKw} kW` },
        { label: 'COP', value: `${entry.cop}` },
        { label: 'EER', value: `${entry.eer}` },
        { label: 'BTU', value: `${Math.round(entry.coolingKw * 3412)}` },
      ];
    case 'sensor':
      return [
        { label: 'Type', value: entry.sensorType },
        { label: 'Protocol', value: entry.protocol },
        { label: 'Voltage', value: `${entry.voltage} V` },
        { label: 'Current', value: `${entry.currentMa} mA` },
      ];
    case 'smarthome':
      return [
        { label: 'Protocol', value: entry.protocol },
        { label: 'Class', value: entry.deviceClass },
        { label: 'Channels', value: `${entry.channels}` },
        ...(entry.channelCurrentA ? [{ label: 'Ch current', value: `${entry.channelCurrentA} A` }] : []),
        { label: 'Bus', value: `${entry.busCurrentMa} mA` },
      ];
    default:
      return [];
  }
}

export function catalogAlternatives(entry: CatalogEntry, limit = 12): CatalogEntry[] {
  return CATALOG.filter((e) => e.domain === entry.domain && e.id !== entry.id).slice(0, limit);
}
