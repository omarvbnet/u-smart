import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Missing team id' }, { status: 400 });
  }

  try {
    const team = await (prisma as any).team.findUnique({
      where: { id },
      include: {
        leader: { select: { id: true, fullName: true, phone: true, jobTitle: true, department: true } },
        members: { include: { employee: { select: { id: true, fullName: true, phone: true, jobTitle: true } } } },
      },
    });
    if (!team) {
      return NextResponse.json({ success: false, message: 'Team not found' }, { status: 404 });
    }
    const ticketCount = await prisma.visitorRequest.count({ where: { assignedTeamId: id } });
    return NextResponse.json({ success: true, team: { ...team, ticketCount } });
  } catch (err) {
    console.error('GET /api/admin/teams/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch team' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Missing team id' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : undefined;
    const leaderId = typeof body.leaderId === 'string' ? body.leaderId.trim() : undefined;
    const members = Array.isArray(body.members) ? body.members : undefined;

    const data: { name?: string; leaderId?: string } = {};
    if (name) data.name = name;
    if (leaderId) data.leaderId = leaderId;

    if (Object.keys(data).length > 0) {
      await (prisma as any).team.update({
        where: { id },
        data,
      });
    }

    if (members !== undefined) {
      const current = await (prisma as any).team.findUnique({ where: { id }, select: { leaderId: true } });
      const effectiveLeaderId = leaderId ?? current?.leaderId;
      await (prisma as any).teamMember.deleteMany({ where: { teamId: id } });
      for (const m of members) {
        const employeeId = typeof m.employeeId === 'string' ? m.employeeId.trim() : '';
        const role = typeof m.role === 'string' ? m.role : 'TECHNICAL';
        if (employeeId && employeeId !== effectiveLeaderId) {
          await (prisma as any).teamMember.create({
            data: { teamId: id, employeeId, role },
          });
        }
      }
    }

    const team = await (prisma as any).team.findUnique({
      where: { id },
      include: {
        leader: { select: { id: true, fullName: true, phone: true, jobTitle: true, department: true } },
        members: { include: { employee: { select: { id: true, fullName: true, phone: true, jobTitle: true } } } },
      },
    });
    return NextResponse.json({ success: true, team });
  } catch (err) {
    console.error('PATCH /api/admin/teams/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to update team' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Missing team id' }, { status: 400 });
  }

  try {
    const assigned = await prisma.visitorRequest.count({ where: { assignedTeamId: id } });
    if (assigned > 0) {
      return NextResponse.json(
        { success: false, message: 'Cannot delete team with assigned tickets. Unassign tickets first.' },
        { status: 400 }
      );
    }
    await (prisma as any).teamMember.deleteMany({ where: { teamId: id } });
    await (prisma as any).team.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/teams/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to delete team' }, { status: 500 });
  }
}
