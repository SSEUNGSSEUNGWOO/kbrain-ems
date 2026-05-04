'use server';

import { db } from '@/lib/db';
import { organizations, students } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
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

  try {
    await db.insert(students).values({
      cohortId,
      organizationId,
      name,
      email: String(formData.get('email') ?? '').trim() || null,
      phone: String(formData.get('phone') ?? '').trim() || null,
      department: String(formData.get('department') ?? '').trim() || null,
      jobTitle: String(formData.get('job_title') ?? '').trim() || null,
      jobRole: String(formData.get('job_role') ?? '').trim() || null,
      birthDate: String(formData.get('birth_date') ?? '').trim() || null,
      notes: String(formData.get('notes') ?? '').trim() || null
    });
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath(`/dashboard/cohorts/${cohortId}/students`);
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

  try {
    await db.update(students).set({
      organizationId,
      name,
      email: String(formData.get('email') ?? '').trim() || null,
      phone: String(formData.get('phone') ?? '').trim() || null,
      department: String(formData.get('department') ?? '').trim() || null,
      jobTitle: String(formData.get('job_title') ?? '').trim() || null,
      jobRole: String(formData.get('job_role') ?? '').trim() || null,
      birthDate: String(formData.get('birth_date') ?? '').trim() || null,
      notes: String(formData.get('notes') ?? '').trim() || null
    }).where(eq(students.id, id));
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath(`/dashboard/cohorts/${cohortId}/students`);
  return {};
}

export async function deleteStudent(
  id: string,
  cohortId: string
): Promise<ActionResult> {
  try {
    await db.delete(students).where(eq(students.id, id));
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath(`/dashboard/cohorts/${cohortId}/students`);
  return {};
}

export async function deleteStudents(
  ids: string[],
  cohortId: string
): Promise<ActionResult> {
  if (ids.length === 0) return {};

  try {
    await db.delete(students).where(inArray(students.id, ids));
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath(`/dashboard/cohorts/${cohortId}/students`);
  return {};
}
