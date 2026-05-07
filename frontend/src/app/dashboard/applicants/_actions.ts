'use server';

import { db } from '@/lib/db';
import { applicants, organizations, students } from '@/lib/db/schema';
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

function formValue(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? '').trim();
  return v || null;
}

export async function createApplicant(
  formData: FormData
): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: '이름은 필수입니다.' };

  const organizationId = await getOrCreateOrg(
    String(formData.get('organization') ?? '')
  );

  try {
    await db.insert(applicants).values({
      name,
      organizationId,
      email: formValue(formData, 'email'),
      phone: formValue(formData, 'phone'),
      department: formValue(formData, 'department'),
      jobTitle: formValue(formData, 'job_title'),
      jobRole: formValue(formData, 'job_role'),
      birthDate: formValue(formData, 'birth_date'),
      notes: formValue(formData, 'notes')
    });
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath('/dashboard/applicants');
  return {};
}

export async function updateApplicant(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: '이름은 필수입니다.' };

  const organizationId = await getOrCreateOrg(
    String(formData.get('organization') ?? '')
  );

  const fields = {
    name,
    organizationId,
    email: formValue(formData, 'email'),
    phone: formValue(formData, 'phone'),
    department: formValue(formData, 'department'),
    jobTitle: formValue(formData, 'job_title'),
    jobRole: formValue(formData, 'job_role'),
    birthDate: formValue(formData, 'birth_date'),
    notes: formValue(formData, 'notes')
  };

  try {
    await db.update(applicants).set(fields).where(eq(applicants.id, id));
    // 같은 id로 등록된 학생이 있으면 같이 갱신
    await db.update(students).set(fields).where(eq(students.id, id));
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath('/dashboard/applicants');
  revalidatePath(`/dashboard/applicants/${id}`);
  return {};
}

export async function deleteApplicant(id: string): Promise<ActionResult> {
  try {
    await db.delete(applicants).where(eq(applicants.id, id));
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath('/dashboard/applicants');
  return {};
}

export async function deleteApplicants(ids: string[]): Promise<ActionResult> {
  if (ids.length === 0) return {};

  try {
    await db.delete(applicants).where(inArray(applicants.id, ids));
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath('/dashboard/applicants');
  return {};
}
