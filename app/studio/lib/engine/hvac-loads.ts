/**
 * Deterministic HVAC load engine (simplified ASHRAE-style factors).
 */
import type { DesignRoom } from '../model';
import type { BuildingType, HvacSystemType } from '../project';

export type RoomHvacLoad = {
  roomId: string;
  label: string;
  zone: DesignRoom['zone'];
  areaM2: number;
  occupancy: number;
  coolingKw: number;
  heatingKw: number;
  btu: number;
  freshAirLps: number;
};

export type HvacLoadReport = {
  rooms: RoomHvacLoad[];
  totalCoolingKw: number;
  totalHeatingKw: number;
  totalBtu: number;
  recommendedSystems: HvacSystemType[];
  eer: number;
  annualKwhEstimate: number;
  assumptions: string[];
};

const COOL_W_M2: Record<DesignRoom['zone'], number> = {
  general: 100, bedroom: 80, kitchen: 180, bathroom: 120, office: 120, corridor: 60, mechanical: 40,
};
const HEAT_W_M2: Record<DesignRoom['zone'], number> = {
  general: 70, bedroom: 60, kitchen: 90, bathroom: 80, office: 75, corridor: 50, mechanical: 30,
};

function areaM2(r: DesignRoom): number {
  return (r.width / 50) * (r.height / 50);
}

export function calculateHvacLoads(rooms: DesignRoom[], buildingType: BuildingType): HvacLoadReport {
  const assumptions = [
    'Cooling/heating W/m² from simplified ASHRAE-style tables (24°C setpoint, 35°C outdoor assumed).',
    'Fresh air: 8 L/s per person (CIBSE baseline).',
    'Annual energy: 1200 equivalent full-load hours — confirm for local climate.',
  ];

  const roomLoads = rooms.map((r) => {
    const area = areaM2(r);
    const occ = r.zone === 'bedroom' ? 2 : r.zone === 'kitchen' ? 2 : Math.max(1, Math.floor(area / 15));
    const cooling = (COOL_W_M2[r.zone] * area * 1.25) / 1000;
    const heating = (HEAT_W_M2[r.zone] * area) / 1000;
    return {
      roomId: r.id,
      label: r.label,
      zone: r.zone,
      areaM2: Math.round(area * 10) / 10,
      occupancy: occ,
      coolingKw: Math.round(cooling * 100) / 100,
      heatingKw: Math.round(heating * 100) / 100,
      btu: Math.round(cooling * 3412),
      freshAirLps: Math.round(occ * 8 * 10) / 10,
    };
  });

  const totalCoolingKw = roomLoads.reduce((s, r) => s + r.coolingKw, 0);
  const eer = 3.5;
  let recommendedSystems: HvacSystemType[] = ['split'];
  if (buildingType === 'hotel' || totalCoolingKw > 80) recommendedSystems = ['vrf', 'ahu'];
  else if (totalCoolingKw > 35) recommendedSystems = ['vrf'];
  else if (buildingType === 'industrial') recommendedSystems = ['chiller'];

  return {
    rooms: roomLoads,
    totalCoolingKw: Math.round(totalCoolingKw * 100) / 100,
    totalHeatingKw: Math.round(roomLoads.reduce((s, r) => s + r.heatingKw, 0) * 100) / 100,
    totalBtu: Math.round(totalCoolingKw * 3412),
    recommendedSystems,
    eer,
    annualKwhEstimate: Math.round((totalCoolingKw / eer) * 1200),
    assumptions,
  };
}
