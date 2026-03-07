import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkPhoneUnique } from '@/lib/check-unique-email-phone';

const GRADE_VALUES = ['TECHNICIAN_C', 'TECHNICIAN_B', 'TECHNICIAN_A', 'ENGINEER', 'SUPERVISOR', 'TEAM_LEADER', 'SECTION_HEAD', 'MANAGER'] as const;
const SPECIALIZED_VALUES = ['ELECTRICAL_TECHNICIAN', 'TELECOM_TECHNICIAN', 'FIBER_TECHNICIAN', 'ENGINEER'] as const;

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
    return NextResponse.json({ success: false, message: 'Missing employee id' }, { status: 400 });
  }

  try {
    const employee = await (prisma as any).employee.findUnique({
      where: { id },
    });
    if (!employee) {
      return NextResponse.json({ success: false, message: 'Employee not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, employee });
  } catch (err) {
    console.error('GET /api/admin/employees/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch employee' }, { status: 500 });
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
    return NextResponse.json({ success: false, message: 'Missing employee id' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : undefined;
    const phone = typeof body.phone === 'string' ? body.phone.trim() : undefined;
    const jobTitle = body.jobTitle !== undefined ? (typeof body.jobTitle === 'string' ? body.jobTitle.trim() : null) : undefined;
    const department = typeof body.department === 'string' ? body.department.trim() : undefined;
    const grade = typeof body.grade === 'string' ? body.grade.trim().toUpperCase().replace(/\s+/g, '_') : undefined;
    const education = body.education !== undefined ? (typeof body.education === 'string' ? body.education.trim() : null) : undefined;
    const specialized = typeof body.specialized === 'string' ? body.specialized.trim().toUpperCase().replace(/\s+/g, '_') : undefined;

    if (grade !== undefined && !GRADE_VALUES.includes(grade as (typeof GRADE_VALUES)[number])) {
      return NextResponse.json({ success: false, message: 'Invalid grade' }, { status: 400 });
    }
    if (specialized !== undefined && !SPECIALIZED_VALUES.includes(specialized as (typeof SPECIALIZED_VALUES)[number])) {
      return NextResponse.json({ success: false, message: 'Invalid specialized' }, { status: 400 });
    }

    if (phone !== undefined) {
      const phoneCheck = await checkPhoneUnique(prisma, phone, { employeeId: id });
      if (phoneCheck.taken) {
        return NextResponse.json({ success: false, message: phoneCheck.message ?? 'Phone number already in use' }, { status: 400 });
      }
    }

    const data: Record<string, unknown> = {};
    if (fullName !== undefined) data.fullName = fullName;
    if (phone !== undefined) data.phone = phone;
    if (jobTitle !== undefined) data.jobTitle = jobTitle;
    if (department !== undefined) data.department = department;
    if (grade !== undefined) data.grade = grade;
    if (education !== undefined) data.education = education;
    if (specialized !== undefined) data.specialized = specialized;

    const employee = await (prisma as any).employee.update({
      where: { id },
      data,
    });
    return NextResponse.json({ success: true, employee });
  } catch (err) {
    console.error('PATCH /api/admin/employees/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to update employee' }, { status: 500 });
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
    return NextResponse.json({ success: false, message: 'Missing employee id' }, { status: 400 });
  }

  try {
    await (prisma as any).employee.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/employees/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to delete employee' }, { status: 500 });
  }
}
