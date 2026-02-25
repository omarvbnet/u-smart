import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { notifyTicketsVisitorRequest } from '@/lib/email';

const BUILDING_TYPES = ['home', 'villa', 'hotel', 'complex', 'other'];
const SMART_HOME_TECHNIQUES = ['knx', 'buspro', 'zigbee'];
const PROGRAMMING_TECHNIQUES = ['nodejs', 'flutter', 'python', 'mysql', 'postgresql', 'nosql'];
const PROGRAMMING_SLUGS = ['custom-software', 'programming'];
const ENTERPRISE_NETWORKING_TECHNIQUES = ['maintenance', 'fiber', 'cable_systemization', 'closures', 'splice', 'qgis', 'asbuilt_design'];
const ENTERPRISE_NETWORKING_SLUGS = ['enterprise-networking'];

const prisma = new PrismaClient();

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
    const buildingType = typeof body.buildingType === 'string' ? body.buildingType.trim().toLowerCase() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const province = typeof body.province === 'string' ? body.province.trim() : '';
    let technique = typeof body.technique === 'string' ? body.technique.trim().toLowerCase() : '';

    if (isEnterpriseNetworking) {
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

    if (!phone || !province || !technique) {
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
    } else if (!isEnterpriseNetworking) {
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

    const request = await prisma.visitorRequest.create({
      data: {
        buildingType: isProgramming || isEnterpriseNetworking ? 'n/a' : buildingType,
        phone,
        province,
        technique,
        name: body.name?.trim() || null,
        company: body.company?.trim() || null,
        email: body.email?.trim() || null,
        serviceSlug,
      },
    });

    notifyTicketsVisitorRequest({
      id: request.id,
      serviceSlug,
      name: body.name?.trim() || null,
      email: body.email?.trim() || null,
      phone,
      company: body.company?.trim() || null,
      province,
      technique,
      buildingType: isProgramming || isEnterpriseNetworking ? null : buildingType || null,
    });

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
