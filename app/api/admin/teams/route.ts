import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const teams = await (prisma as any).team.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        leader: { select: { id: true, fullName: true, phone: true, jobTitle: true, department: true } },
        members: { include: { employee: { select: { id: true, fullName: true, phone: true, jobTitle: true } } } },
      },
    });
    const withCount = await Promise.all(
      teams.map(async (t: { id: string }) => {
        const ticketCount = await prisma.visitorRequest.count({ where: { assignedTeamId: t.id } });
        return { ...t, ticketCount };
      })
    );
    return NextResponse.json({ success: true, teams: withCount });
  } catch (err) {
    console.error('GET /api/admin/teams:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch teams' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const leaderId = typeof body.leaderId === 'string' ? body.leaderId.trim() : '';
    const members = Array.isArray(body.members) ? body.members : [];
    if (!name || !leaderId) {
      return NextResponse.json(
        { success: false, message: 'Team name and leader are required' },
        { status: 400 }
      );
    }

    const team = await (prisma as any).team.create({
      data: {
        name,
        leaderId,
      },
      include: { leader: { select: { id: true, fullName: true, phone: true, jobTitle: true, department: true } } },
    });

    for (const m of members) {
      const employeeId = typeof m.employeeId === 'string' ? m.employeeId.trim() : '';
      const role = typeof m.role === 'string' ? m.role : 'TECHNICAL';
      if (employeeId && employeeId !== leaderId) {
        await (prisma as any).teamMember.create({
          data: { teamId: team.id, employeeId, role },
        });
      }
    }

    const withMembers = await (prisma as any).team.findUnique({
      where: { id: team.id },
      include: {
        leader: { select: { id: true, fullName: true, phone: true, jobTitle: true, department: true } },
        members: { include: { employee: { select: { id: true, fullName: true, phone: true, jobTitle: true } } } },
      },
    });
    return NextResponse.json({ success: true, team: withMembers ?? team });
  } catch (err) {
    console.error('POST /api/admin/teams:', err);
    return NextResponse.json({ success: false, message: 'Failed to create team' }, { status: 500 });
  }
}
