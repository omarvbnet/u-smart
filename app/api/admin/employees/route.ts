import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const GRADE_VALUES = ['TECHNICIAN_C', 'TECHNICIAN_B', 'TECHNICIAN_A', 'ENGINEER', 'SUPERVISOR', 'TEAM_LEADER', 'SECTION_HEAD', 'MANAGER'] as const;
const SPECIALIZED_VALUES = ['ELECTRICAL_TECHNICIAN', 'TELECOM_TECHNICIAN', 'FIBER_TECHNICIAN', 'ENGINEER'] as const;

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const delegate = (prisma as any).employee;
    if (!delegate?.findMany) {
      return NextResponse.json({ success: true, employees: [] });
    }
    const employees = await delegate.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, employees });
  } catch (err) {
    console.error('GET /api/admin/employees:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch employees' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const jobTitle = typeof body.jobTitle === 'string' ? body.jobTitle.trim() : null;
    const department = typeof body.department === 'string' ? body.department.trim() : '';
    const grade = typeof body.grade === 'string' ? body.grade.trim().toUpperCase().replace(/\s+/g, '_') : '';
    const education = typeof body.education === 'string' ? body.education.trim() : null;
    const specialized = typeof body.specialized === 'string' ? body.specialized.trim().toUpperCase().replace(/\s+/g, '_') : '';

    if (!fullName || !phone || !department) {
      return NextResponse.json(
        { success: false, message: 'Full name, phone, and department are required' },
        { status: 400 }
      );
    }
    if (!GRADE_VALUES.includes(grade as (typeof GRADE_VALUES)[number])) {
      return NextResponse.json(
        { success: false, message: 'Invalid grade' },
        { status: 400 }
      );
    }
    if (!SPECIALIZED_VALUES.includes(specialized as (typeof SPECIALIZED_VALUES)[number])) {
      return NextResponse.json(
        { success: false, message: 'Invalid specialized' },
        { status: 400 }
      );
    }

    const employee = await (prisma as any).employee.create({
      data: {
        fullName,
        phone,
        jobTitle: jobTitle || undefined,
        department,
        grade,
        education: education || undefined,
        specialized,
      },
    });
    return NextResponse.json({ success: true, employee });
  } catch (err) {
    console.error('POST /api/admin/employees:', err);
    return NextResponse.json({ success: false, message: 'Failed to create employee' }, { status: 500 });
  }
}
