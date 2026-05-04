'use server';

import { db } from '@/lib/db';
import { assignments } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

type ActionResult = { error?: string };

const path = (cohortId: string) => `/dashboard/cohorts/${cohortId}/assignments`;

export async function createAssignment(cohortId: string, formData: FormData): Promise<ActionResult> {
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { error: '과제명은 필수입니다.' };

  try {
    await db.insert(assignments).values({
      cohortId,
      title,
      description: String(formData.get('description') ?? '').trim() || null,
      dueDate: String(formData.get('due_date') ?? '').trim() || null
    });
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath(path(cohortId));
  return {};
}

export async function updateAssignment(id: string, cohortId: string, formData: FormData): Promise<ActionResult> {
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { error: '과제명은 필수입니다.' };

  try {
    await db.update(assignments).set({
      title,
      description: String(formData.get('description') ?? '').trim() || null,
      dueDate: String(formData.get('due_date') ?? '').trim() || null
    }).where(eq(assignments.id, id));
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath(path(cohortId));
  return {};
}

export async function deleteAssignment(id: string, cohortId: string): Promise<ActionResult> {
  try {
    await db.delete(assignments).where(eq(assignments.id, id));
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath(path(cohortId));
  return {};
}

export async function deleteAssignments(ids: string[], cohortId: string): Promise<ActionResult> {
  if (ids.length === 0) return {};

  try {
    await db.delete(assignments).where(inArray(assignments.id, ids));
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath(path(cohortId));
  return {};
}
