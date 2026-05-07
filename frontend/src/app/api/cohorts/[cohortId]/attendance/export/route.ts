import { NextResponse } from 'next/server';
import { eq, asc, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  cohorts,
  sessions,
  students,
  organizations,
  attendanceRecords
} from '@/lib/db/schema';
import { buildAttendanceWorkbook } from '@/lib/excel/attendance-export';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ cohortId: string }> }
) {
  const { cohortId } = await params;

  const cohortRow = (
    await db
      .select({ id: cohorts.id, name: cohorts.name })
      .from(cohorts)
      .where(eq(cohorts.id, cohortId))
      .limit(1)
  )[0];

  if (!cohortRow) {
    return new NextResponse('Cohort not found', { status: 404 });
  }

  const studentRows = await db
    .select({
      id: students.id,
      name: students.name,
      department: students.department,
      jobTitle: students.jobTitle,
      organizationName: organizations.name
    })
    .from(students)
    .leftJoin(organizations, eq(students.organizationId, organizations.id))
    .where(eq(students.cohortId, cohortId))
    .orderBy(asc(students.name));

  const sessionRows = await db
    .select({
      id: sessions.id,
      sessionDate: sessions.sessionDate,
      title: sessions.title
    })
    .from(sessions)
    .where(eq(sessions.cohortId, cohortId))
    .orderBy(asc(sessions.sessionDate));

  let recordRows: {
    sessionId: string;
    studentId: string;
    status: string;
    note: string | null;
    creditedHours: string | null;
  }[] = [];
  if (sessionRows.length > 0) {
    recordRows = await db
      .select({
        sessionId: attendanceRecords.sessionId,
        studentId: attendanceRecords.studentId,
        status: attendanceRecords.status,
        note: attendanceRecords.note,
        creditedHours: attendanceRecords.creditedHours
      })
      .from(attendanceRecords)
      .where(
        inArray(
          attendanceRecords.sessionId,
          sessionRows.map((s) => s.id)
        )
      );
  }

  const buf = await buildAttendanceWorkbook({
    cohortName: cohortRow.name,
    students: studentRows.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.department,
      organizationName: s.organizationName,
      department: null,
      jobTitle: s.jobTitle
    })),
    sessions: sessionRows,
    records: recordRows
  });

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `${cohortRow.name} 출석현황 ${today}.xlsx`;
  const encoded = encodeURIComponent(filename);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'no-store'
    }
  });
}
