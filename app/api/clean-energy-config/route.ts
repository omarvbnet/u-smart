import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** GET /api/clean-energy-config - Returns price per watt (in cents) for clean energy calculator */
export async function GET() {
  try {
    const stat = await prisma.statistic.findUnique({
      where: { key: 'clean_energy_price_per_watt' },
    });
    const pricePerWattCents = stat?.value ?? 50; // default $0.50/watt
    return NextResponse.json({
      success: true,
      pricePerWattCents,
    });
  } catch (error) {
    console.error('GET /api/clean-energy-config:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch config' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
