'use client';

import type { EngineeringSymbolId } from '../lib/catalog/symbols';

type Props = {
  symbol: EngineeringSymbolId;
  color?: string;
  size?: number;
  selected?: boolean;
  active?: boolean;
  label?: string;
};

/** IEC-inspired floor-plan symbols (2D technical drafting style). */
export function EngineeringSymbol({ symbol, color = '#1e293b', size = 44, selected, active, label }: Props) {
  const stroke = selected ? '#22d3ee' : color;
  const fill = active ? 'rgba(34,211,238,0.25)' : 'rgba(255,255,255,0.92)';

  const wrap = (body: React.ReactNode) => (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox="0 0 44 44" className="overflow-visible">
        {selected && <rect x={0.5} y={0.5} width={43} height={43} fill="none" stroke="#22d3ee" strokeWidth={1.5} strokeDasharray="3 2" rx={4} />}
        {body}
        {active && <circle cx={22} cy={22} r={20} fill="none" stroke="#22c55e" strokeWidth={1} opacity={0.7} />}
      </svg>
      {label && <span className="mt-0.5 max-w-[56px] truncate text-[7px] font-medium text-[var(--studio-text)]">{label}</span>}
    </div>
  );

  switch (symbol) {
    case 'lighting':
      return wrap(
        <>
          <circle cx={22} cy={18} r={10} fill={fill} stroke={stroke} strokeWidth={1.5} />
          <path d="M14 28 L30 28 L26 36 L18 36 Z" fill={fill} stroke={stroke} strokeWidth={1.5} />
          {active && <circle cx={22} cy={18} r={6} fill="#fde047" opacity={0.9} />}
        </>,
      );
    case 'socket':
      return wrap(
        <>
          <rect x={10} y={10} width={24} height={24} rx={3} fill={fill} stroke={stroke} strokeWidth={1.5} />
          <circle cx={18} cy={22} r={2.5} fill={stroke} />
          <circle cx={26} cy={22} r={2.5} fill={stroke} />
        </>,
      );
    case 'switch':
      return wrap(
        <>
          <rect x={12} y={8} width={20} height={28} rx={2} fill={fill} stroke={stroke} strokeWidth={1.5} />
          <circle cx={22} cy={22} r={5} fill="none" stroke={stroke} strokeWidth={1.5} />
        </>,
      );
    case 'distribution_board':
      return wrap(
        <>
          <rect x={6} y={6} width={32} height={32} fill={fill} stroke={stroke} strokeWidth={1.5} />
          {[14, 22, 30].map((y) => <line key={y} x1={6} y1={y} x2={38} y2={y} stroke={stroke} strokeWidth={0.8} />)}
          {[14, 22, 30].map((x) => <line key={x} x1={x} y1={6} x2={x} y2={38} stroke={stroke} strokeWidth={0.8} />)}
        </>,
      );
    case 'mcb':
      return wrap(
        <>
          <rect x={14} y={8} width={16} height={28} fill={fill} stroke={stroke} strokeWidth={1.5} />
          <path d="M18 32 L26 20" stroke={stroke} strokeWidth={1.5} />
        </>,
      );
    case 'mccb':
    case 'rcd':
      return wrap(
        <>
          <rect x={10} y={8} width={24} height={28} fill={fill} stroke={stroke} strokeWidth={1.5} />
          <text x={22} y={26} textAnchor="middle" fontSize={8} fill={stroke} fontFamily="system-ui">{symbol === 'rcd' ? 'Δ' : 'MCCB'}</text>
        </>,
      );
    case 'fuse':
      return wrap(<rect x={16} y={10} width={12} height={24} fill={fill} stroke={stroke} strokeWidth={1.5} />);
    case 'spd':
      return wrap(
        <>
          <path d="M22 8 L14 36 L30 36 Z" fill={fill} stroke={stroke} strokeWidth={1.5} />
          <path d="M22 16 L22 28 M18 24 L26 24" stroke={stroke} strokeWidth={1.5} />
        </>,
      );
    case 'source':
      return wrap(
        <>
          <circle cx={22} cy={22} r={14} fill={fill} stroke={stroke} strokeWidth={1.5} />
          <text x={22} y={26} textAnchor="middle" fontSize={9} fill={stroke} fontFamily="system-ui">G</text>
        </>,
      );
    case 'motor':
      return wrap(
        <>
          <circle cx={22} cy={22} r={14} fill={fill} stroke={stroke} strokeWidth={1.5} />
          <text x={22} y={26} textAnchor="middle" fontSize={10} fill={stroke} fontFamily="system-ui">M</text>
        </>,
      );
    case 'hvac_indoor':
      return wrap(
        <>
          <rect x={6} y={14} width={32} height={16} rx={2} fill={fill} stroke={stroke} strokeWidth={1.5} />
          <path d="M10 22 H34" stroke={stroke} strokeWidth={1} strokeDasharray="2 2" />
        </>,
      );
    case 'hvac_outdoor':
    case 'hvac_plant':
      return wrap(
        <>
          <rect x={8} y={10} width={28} height={24} fill={fill} stroke={stroke} strokeWidth={1.5} />
          <circle cx={22} cy={22} r={8} fill="none" stroke={stroke} strokeWidth={1.5} />
        </>,
      );
    case 'knx_device':
      return wrap(
        <>
          <rect x={10} y={10} width={24} height={24} fill={fill} stroke={stroke} strokeWidth={1.5} />
          <text x={22} y={26} textAnchor="middle" fontSize={7} fill={stroke} fontFamily="system-ui">KNX</text>
        </>,
      );
    case 'hdl_device':
      return wrap(
        <>
          <rect x={10} y={10} width={24} height={24} fill={fill} stroke={stroke} strokeWidth={1.5} />
          <text x={22} y={26} textAnchor="middle" fontSize={7} fill={stroke} fontFamily="system-ui">HDL</text>
        </>,
      );
    case 'sensor':
      return wrap(
        <>
          <circle cx={22} cy={22} r={12} fill={fill} stroke={stroke} strokeWidth={1.5} />
          <path d="M22 14 A8 8 0 0 1 22 30" fill="none" stroke={stroke} strokeWidth={1.2} />
        </>,
      );
    case 'camera':
      return wrap(
        <>
          <rect x={10} y={14} width={24} height={16} rx={2} fill={fill} stroke={stroke} strokeWidth={1.5} />
          <circle cx={22} cy={22} r={4} fill="none" stroke={stroke} strokeWidth={1.2} />
        </>,
      );
    case 'access_control':
      return wrap(
        <>
          <rect x={14} y={8} width={16} height={28} fill={fill} stroke={stroke} strokeWidth={1.5} />
          <circle cx={22} cy={26} r={2} fill={stroke} />
        </>,
      );
    default:
      return wrap(<rect x={12} y={12} width={20} height={20} fill={fill} stroke={stroke} strokeWidth={1.5} />);
  }
}
