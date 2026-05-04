'use server';

import { db } from '@/lib/db';
import { cohorts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

type ActionResult = { error?: string };

export async function createCohort(formData: FormData): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  const startedAt = String(formData.get('started_at') ?? '').trim();
  const endedAt = String(formData.get('ended_at') ?? '').trim();

  if (!name) return { error: '기수 이름은 필수입니다.' };

  try {
    await db.insert(cohorts).values({
      name,
      startedAt: startedAt || null,
      endedAt: endedAt || null
    });
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath('/dashboard/cohorts');
  return {};
}

export async function updateCohort(id: string, formData: FormData): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  const startedAt = String(formData.get('started_at') ?? '').trim();
  const endedAt = String(formData.get('ended_at') ?? '').trim();

  if (!name) return { error: '기수 이름은 필수입니다.' };

  try {
    await db.update(cohorts).set({
      name,
      startedAt: startedAt || null,
      endedAt: endedAt || null
    }).where(eq(cohorts.id, id));
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath('/dashboard/cohorts');
  return {};
}

export async function deleteCohort(id: string): Promise<ActionResult> {
  try {
    await db.delete(cohorts).where(eq(cohorts.id, id));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.';
    if (message.includes('23503') || message.includes('violates foreign key constraint')) {
      return { error: '교육생이 등록된 기수는 삭제할 수 없습니다.' };
    }
    return { error: message };
  }

  revalidatePath('/dashboard/cohorts');
  return {};
}
