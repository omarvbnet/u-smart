import {
  Boxes,
  Home,
  Wifi,
  Smartphone,
  ShieldCheck,
  Cpu,
  Cloud,
  Zap,
  Code,
  Database,
  Server,
  Globe,
  Layers,
  Gauge,
  Lightbulb,
  Cable,
  Building2,
  Factory,
  Car,
  type LucideIcon,
} from 'lucide-react';

const SERVICE_ICON_MAP: Record<string, LucideIcon> = {
  Boxes,
  Home,
  Wifi,
  Smartphone,
  ShieldCheck,
  Cpu,
  Cloud,
  Zap,
  Code,
  Database,
  Server,
  Globe,
  Layers,
  Gauge,
  Lightbulb,
  Cable,
  Building2,
  Factory,
  Car,
};

export const SERVICE_ICON_NAMES = Object.keys(SERVICE_ICON_MAP).sort();

export function getServiceIcon(name: string | null | undefined): LucideIcon {
  if (!name || typeof name !== 'string') return Boxes;
  const key = name.trim();
  return SERVICE_ICON_MAP[key] ?? Boxes;
}
