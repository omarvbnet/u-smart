import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    const body = await _req.json();
    const value = typeof body.value === 'number' ? body.value : parseInt(String(body.value), 10);

    if (Number.isNaN(value) || value < 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid value' },
        { status: 400 }
      );
    }

    const stat = await prisma.statistic.upsert({
      where: { key },
      update: { value },
      create: {
        key,
        value,
        label: key,
        suffix: '+',
        icon: '📊',
        isActive: true,
        order: 0,
      },
    });

    return NextResponse.json({ success: true, statistic: stat });
  } catch (error) {
    console.error('Error updating statistic:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update statistic' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
