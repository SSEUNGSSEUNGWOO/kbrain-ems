'use server';

import { db } from '@/lib/db';
import {
  applicants,
  applications,
  organizations,
  students
} from '@/lib/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

type ActionResult = { error?: string };

async function getOrCreateOrg(orgName: string): Promise<string | null> {
  const name = orgName.trim();
  if (!name) return null;

  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.name, name))
    .limit(1);
  if (rows[0]) return rows[0].id;

  const created = await db
    .insert(organizations)
    .values({ name })
    .returning({ id: organizations.id });
  return created[0]?.id ?? null;
}

export async function createStudent(
  cohortId: string,
  formData: FormData
): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: '이름은 필수입니다.' };

  const orgName = String(formData.get('organization') ?? '').trim();
  const organizationId = orgName ? await getOrCreateOrg(orgName) : null;

  const fields = {
    organizationId,
    name,
    email: String(formData.get('email') ?? '').trim() || null,
    phone: String(formData.get('phone') ?? '').trim() || null,
    department: String(formData.get('department') ?? '').trim() || null,
    jobTitle: String(formData.get('job_title') ?? '').trim() || null,
    jobRole: String(formData.get('job_role') ?? '').trim() || null,
    birthDate: String(formData.get('birth_date') ?? '').trim() || null,
    notes: String(formData.get('notes') ?? '').trim() || null
  };

  try {
    // 같은 사람을 지원자에서 먼저 등록(또는 재사용)한 뒤 학생으로 승격
    const created = await db
      .insert(applicants)
      .values(fields)
      .returning({ id: applicants.id });
    const applicantId = created[0]!.id;

    await db
      .insert(applications)
      .values({
        applicantId,
        cohortId,
        status: 'selected',
        decidedAt: new Date().toISOString().slice(0, 10)
      })
      .onConflictDoNothing();

    await db.insert(students).values({ id: applicantId, cohortId, ...fields });
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath(`/dashboard/cohorts/${cohortId}/students`);
  revalidatePath('/dashboard/applicants');
  return {};
}

export async function updateStudent(
  id: string,
  cohortId: string,
  formData: FormData
): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: '이름은 필수입니다.' };

  const orgName = String(formData.get('organization') ?? '').trim();
  const organizationId = orgName ? await getOrCreateOrg(orgName) : null;

  const fields = {
    organizationId,
    name,
    email: String(formData.get('email') ?? '').trim() || null,
    phone: String(formData.get('phone') ?? '').trim() || null,
    department: String(formData.get('department') ?? '').trim() || null,
    jobTitle: String(formData.get('job_title') ?? '').trim() || null,
    jobRole: String(formData.get('job_role') ?? '').trim() || null,
    birthDate: String(formData.get('birth_date') ?? '').trim() || null,
    notes: String(formData.get('notes') ?? '').trim() || null
  };

  try {
    await db.update(students).set(fields).where(eq(students.id, id));
    // 같은 id의 지원자도 동기화
    await db.update(applicants).set(fields).where(eq(applicants.id, id));
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath(`/dashboard/cohorts/${cohortId}/students`);
  revalidatePath('/dashboard/applicants');
  revalidatePath(`/dashboard/applicants/${id}`);
  return {};
}

export async function deleteStudent(
  id: string,
  cohortId: string
): Promise<ActionResult> {
  try {
    await db.delete(students).where(eq(students.id, id));
    // 합격 기록은 보존하되 'withdrew'(철회)로 변경
    await db
      .update(applications)
      .set({
        status: 'withdrew',
        decidedAt: sql`COALESCE(${applications.decidedAt}, CURRENT_DATE)`
      })
      .where(
        and(
          eq(applications.applicantId, id),
          eq(applications.cohortId, cohortId),
          eq(applications.status, 'selected')
        )
      );
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath(`/dashboard/cohorts/${cohortId}/students`);
  revalidatePath('/dashboard/applicants');
  return {};
}

export async function deleteStudents(
  ids: string[],
  cohortId: string
): Promise<ActionResult> {
  if (ids.length === 0) return {};

  try {
    await db.delete(students).where(inArray(students.id, ids));
    await db
      .update(applications)
      .set({
        status: 'withdrew',
        decidedAt: sql`COALESCE(${applications.decidedAt}, CURRENT_DATE)`
      })
      .where(
        and(
          inArray(applications.applicantId, ids),
          eq(applications.cohortId, cohortId),
          eq(applications.status, 'selected')
        )
      );
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath(`/dashboard/cohorts/${cohortId}/students`);
  revalidatePath('/dashboard/applicants');
  return {};
}
