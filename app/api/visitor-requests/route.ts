import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { notifyTicketsVisitorRequest } from '@/lib/email';
import {
  CLEAN_ENERGY_IP_LABELS,
  isCleanEnergyIpKey,
  type CleanEnergyDesignSnapshot,
} from '@/lib/clean-energy-request';

/** Parse number from string or number - accepts "1,234.56", "1234,56", "1234", 1234, etc. */
function parseFlexibleNumber(val: unknown): number | undefined {
  if (val == null) return undefined;
  if (typeof val === 'number' && !isNaN(val)) return val;
  let s = String(val).trim().replace(/\s/g, '');
  if (!s) return undefined;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = s.replace(/,/g, '.');
  } else if (lastDot >= 0) {
    s = s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
}

const BUILDING_TYPES = ['home', 'villa', 'hotel', 'complex', 'other'];
const SMART_HOME_TECHNIQUES = ['knx', 'buspro', 'zigbee'];
const PROGRAMMING_TECHNIQUES = ['nodejs', 'flutter', 'python', 'mysql', 'postgresql', 'nosql'];
const PROGRAMMING_SLUGS = ['custom-software', 'programming'];
const ENTERPRISE_NETWORKING_TECHNIQUES = ['maintenance', 'fiber', 'cable_systemization', 'closures', 'splice', 'qgis', 'asbuilt_design'];
const ENTERPRISE_NETWORKING_SLUGS = ['enterprise-networking'];
const CLEAN_ENERGY_SLUGS = ['clean-energy'];

const prisma = new PrismaClient();

const CLEAN_SNAPSHOT_NUM_KEYS: (keyof CleanEnergyDesignSnapshot)[] = [
  'runtimeHours',
  'usageCurrentA',
  'efficiency',
  'safetyFactor',
  'energyConsumedKwh',
  'batteryKwh',
  'batterySafeKwh',
  'solarPanels615W',
  'totalSolarKw',
  'chargeTimeHours',
  'minInverterW',
  'inverterSafeW',
  'maxCurrentA',
  'safeCurrentA',
  'estimatedPriceUsd',
];

function sanitizeCleanEnergyDesignSnapshot(raw: unknown): Partial<CleanEnergyDesignSnapshot> | undefined {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  const out: Partial<CleanEnergyDesignSnapshot> = {};
  for (const key of CLEAN_SNAPSHOT_NUM_KEYS) {
    const v = num(o[key as string]);
    if (v !== undefined) (out as Record<string, number>)[key as string] = v;
  }
  if (o.inverterPowerW === null) {
    (out as { inverterPowerW?: number | null }).inverterPowerW = null;
  } else {
    const v = num(o.inverterPowerW);
    if (v !== undefined) (out as { inverterPowerW?: number | null }).inverterPowerW = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function cleanEnergyEmailExtraRows(
  ipKeys: string[],
  snap: Partial<CleanEnergyDesignSnapshot> | undefined
): { label: string; value: string | number }[] {
  const rows: { label: string; value: string | number }[] = [];
  const ipLabels = ipKeys.filter(isCleanEnergyIpKey).map((k) => CLEAN_ENERGY_IP_LABELS[k]);
  if (ipLabels.length) rows.push({ label: 'IP ratings', value: ipLabels.join(', ') });
  if (!snap) return rows;
  if (snap.runtimeHours != null) rows.push({ label: 'Calc: runtime (h)', value: snap.runtimeHours });
  if (snap.usageCurrentA != null) rows.push({ label: 'Calc: usage current (A)', value: snap.usageCurrentA });
  if (snap.inverterPowerW != null) rows.push({ label: 'Calc: inverter (W)', value: snap.inverterPowerW });
  if (snap.energyConsumedKwh != null) rows.push({ label: 'Calc: energy consumed (kWh)', value: snap.energyConsumedKwh });
  if (snap.batteryKwh != null) rows.push({ label: 'Calc: battery needed (kWh)', value: snap.batteryKwh });
  if (snap.batterySafeKwh != null) rows.push({ label: 'Calc: battery safe (kWh)', value: snap.batterySafeKwh });
  if (snap.solarPanels615W != null) rows.push({ label: 'Calc: solar panels (615 W)', value: snap.solarPanels615W });
  if (snap.totalSolarKw != null) rows.push({ label: 'Calc: total solar (kW)', value: snap.totalSolarKw });
  if (snap.chargeTimeHours != null) rows.push({ label: 'Calc: charge time (h)', value: snap.chargeTimeHours });
  if (snap.minInverterW != null) rows.push({ label: 'Calc: min inverter (W)', value: snap.minInverterW });
  if (snap.inverterSafeW != null) rows.push({ label: 'Calc: recommended inverter (W)', value: snap.inverterSafeW });
  if (snap.maxCurrentA != null) rows.push({ label: 'Calc: max current (A)', value: snap.maxCurrentA });
  if (snap.safeCurrentA != null) rows.push({ label: 'Calc: safe current (A)', value: snap.safeCurrentA });
  if (snap.estimatedPriceUsd != null) rows.push({ label: 'Calc: estimated price ($)', value: snap.estimatedPriceUsd });
  return rows;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const onlySlugsParam = searchParams.get('onlySlugs')?.trim() || '';
    const excludeSlug = searchParams.get('excludeSlug')?.trim() || '';
    let where: { serviceSlug?: { in?: string[]; not?: string } } = {};
    if (onlySlugsParam) {
      const slugs = onlySlugsParam.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (slugs.length > 0) where = { serviceSlug: { in: slugs } };
    } else if (excludeSlug) {
      where = { serviceSlug: { not: excludeSlug } };
    }
    const list = await prisma.visitorRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, requests: list });
  } catch (error) {
    console.error('GET /api/visitor-requests:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch requests' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const serviceSlug = typeof body.serviceSlug === 'string' ? body.serviceSlug.trim().toLowerCase() : 'smart-home-automation';
    const isProgramming = PROGRAMMING_SLUGS.includes(serviceSlug);
    const isEnterpriseNetworking = ENTERPRISE_NETWORKING_SLUGS.includes(serviceSlug);
    const isCleanEnergy = CLEAN_ENERGY_SLUGS.includes(serviceSlug);
    const buildingType = typeof body.buildingType === 'string' ? body.buildingType.trim().toLowerCase() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const province = typeof body.province === 'string' ? body.province.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const currentAmps = parseFlexibleNumber(body.currentAmps);
    const kwh = parseFlexibleNumber(body.kwh);
    const price = body.price != null ? parseFlexibleNumber(body.price) : undefined;
    let technique = typeof body.technique === 'string' ? body.technique.trim().toLowerCase() : '';
    let cleanEnergyIpRatings: string[] = [];
    let cleanEnergyDesignSanitized: Partial<CleanEnergyDesignSnapshot> | undefined;

    if (isCleanEnergy) {
      technique = 'request';
      const ipRaw: unknown[] = Array.isArray(body.ipRatings) ? body.ipRatings : [];
      const ipStrings = ipRaw.filter((x): x is string => typeof x === 'string' && Boolean(x.trim()));
      cleanEnergyIpRatings = [...new Set(ipStrings.map((x) => x.trim().toLowerCase()).filter(isCleanEnergyIpKey))];
      cleanEnergyDesignSanitized = sanitizeCleanEnergyDesignSnapshot(body.designSnapshot);
      if (!phone || !email) {
        return NextResponse.json(
          { success: false, message: 'Phone and email are required' },
          { status: 400 }
        );
      }
      if (cleanEnergyIpRatings.length === 0) {
        return NextResponse.json(
          { success: false, message: 'Select at least one IP rating (IP 65, IP 21, IP 66, or IP 54)' },
          { status: 400 }
        );
      }
      if (currentAmps == null || isNaN(currentAmps) || currentAmps <= 0) {
        return NextResponse.json(
          { success: false, message: 'Valid current (Amps) is required' },
          { status: 400 }
        );
      }
      if (kwh == null || isNaN(kwh) || kwh <= 0) {
        return NextResponse.json(
          { success: false, message: 'Valid kWh capacity is required' },
          { status: 400 }
        );
      }
    } else if (isEnterpriseNetworking) {
      const techniquesRaw = Array.isArray(body.techniques) ? body.techniques : [];
      const techniques = techniquesRaw
        .filter((t: unknown) => typeof t === 'string' && t.trim())
        .map((t: string) => t.trim().toLowerCase())
        .filter((t: string) => ENTERPRISE_NETWORKING_TECHNIQUES.includes(t));
      if (techniques.length === 0) {
        return NextResponse.json(
          { success: false, message: 'At least one technique is required' },
          { status: 400 }
        );
      }
      technique = techniques.join(',');
    }

    if (!isCleanEnergy && (!phone || !province || !technique)) {
      return NextResponse.json(
        { success: false, message: isEnterpriseNetworking ? 'Phone, province and at least one technique are required' : 'Phone, province and technique are required' },
        { status: 400 }
      );
    }

    if (isProgramming) {
      if (!PROGRAMMING_TECHNIQUES.includes(technique)) {
        return NextResponse.json(
          { success: false, message: 'Invalid programming technique' },
          { status: 400 }
        );
      }
    } else if (!isEnterpriseNetworking && !isCleanEnergy) {
      if (!buildingType) {
        return NextResponse.json(
          { success: false, message: 'Building type is required' },
          { status: 400 }
        );
      }
      if (!BUILDING_TYPES.includes(buildingType)) {
        return NextResponse.json(
          { success: false, message: 'Invalid building type' },
          { status: 400 }
        );
      }
      if (!SMART_HOME_TECHNIQUES.includes(technique)) {
        return NextResponse.json(
          { success: false, message: 'Invalid technique' },
          { status: 400 }
        );
      }
    }

    const cleanEnergyMeta = isCleanEnergy
      ? JSON.stringify({
          _cleanEnergy: true,
          estimatedPrice: price != null ? Number(price) : null,
          ipRatings: cleanEnergyIpRatings,
          ...(cleanEnergyDesignSanitized && Object.keys(cleanEnergyDesignSanitized).length > 0
            ? { designSnapshot: cleanEnergyDesignSanitized }
            : {}),
        })
      : null;

    const request = await prisma.visitorRequest.create({
      data: {
        buildingType: isProgramming || isEnterpriseNetworking || isCleanEnergy ? 'n/a' : buildingType,
        phone,
        province: isCleanEnergy ? (province || 'n/a') : province,
        technique,
        name: body.name?.trim() || null,
        company: isCleanEnergy ? cleanEnergyMeta : (body.company?.trim() || null),
        email: isCleanEnergy ? email : (body.email?.trim() || null),
        serviceSlug,
        ...(isCleanEnergy && {
          currentAmps: currentAmps!,
          kwh: kwh!,
        }),
      },
    });

    const baseUrl = (() => {
      const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || '';
      return raw.startsWith('http') ? raw : (raw ? `https://${raw}` : 'https://usmart-iot.com');
    })();
    const ticketUrl = `${baseUrl}/admin/visitor-requests/${request.id}`;
    notifyTicketsVisitorRequest({
      id: request.id,
      serviceSlug,
      name: body.name?.trim() || null,
      email: isCleanEnergy ? email : (body.email?.trim() || null),
      phone,
      company: body.company?.trim() || null,
      province: isCleanEnergy ? (province || 'n/a') : province,
      technique: isCleanEnergy ? 'Clean Energy' : technique,
      buildingType: isProgramming || isEnterpriseNetworking || isCleanEnergy ? null : buildingType || null,
      ticketUrl,
      ...(isCleanEnergy && {
        currentAmps: currentAmps!,
        kwh: kwh!,
        price: price != null ? price : undefined,
        extraRows: cleanEnergyEmailExtraRows(cleanEnergyIpRatings, cleanEnergyDesignSanitized),
      }),
    });

    // Admin in-app notification for clean energy inbox
    if (isCleanEnergy) {
      try {
        const ipLabels = cleanEnergyIpRatings.filter(isCleanEnergyIpKey).map((k) => CLEAN_ENERGY_IP_LABELS[k]);
        const panels =
          cleanEnergyDesignSanitized?.solarPanels615W != null
            ? ` | Panels (615W): ${cleanEnergyDesignSanitized.solarPanels615W}`
            : '';
        const ipPart = ipLabels.length ? ` | IP: ${ipLabels.join(', ')}` : '';
        const db = prisma as unknown as { notification?: { create: (args: { data: { type: string; title: string; message: string; ticketId: string; forAdmin: boolean } }) => Promise<unknown> } };
        await db.notification?.create({
          data: {
            type: 'new_clean_energy_request',
            title: 'New clean energy request',
            message: `Clean Energy ${request.id.slice(-8)}${ipPart}${panels}${price != null ? ` | Budget: $${Number(price).toLocaleString()}` : ''}`,
            ticketId: request.id,
            forAdmin: true,
          },
        });
      } catch {
        /* notification table may not exist in some environments */
      }
    }

    return NextResponse.json({ success: true, request });
  } catch (error) {
    const err = error as Error;
    console.error('POST /api/visitor-requests:', err?.message ?? err);
    const msg = process.env.NODE_ENV === 'development' && err?.message
      ? err.message
      : 'Failed to create request';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
