'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { getOperator } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

type ActionResult = { error?: string };

/** 로그인한 운영자의 cohort 표시 순서를 저장. drag&drop에서 호출. */
export async function reorderCohorts(order: string[]): Promise<ActionResult> {
  const operator = await getOperator();
  if (!operator) return { error: '인증이 필요합니다.' };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('operators')
    .update({ cohort_order: order })
    .eq('id', operator.id);
  if (error) return { error: error.message };

  revalidatePath('/dashboard/cohorts');
  revalidatePath('/dashboard');
  return {};
}

function val(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function nullableInt(s: string): number | null {
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

export async function createCohort(formData: FormData): Promise<ActionResult> {
  const name = val(formData, 'name');
  if (!name) return { error: '기수 이름은 필수입니다.' };

  const recruitingSlug = val(formData, 'recruiting_slug');

  const supabase = createAdminClient();

  if (recruitingSlug) {
    const { data: dup } = await supabase
      .from('cohorts')
      .select('id')
      .eq('recruiting_slug', recruitingSlug)
      .maybeSingle();
    if (dup) return { error: '이미 사용 중인 모집 코드(slug)입니다.' };
  }

  const { error } = await supabase.from('cohorts').insert({
    name,
    started_at: val(formData, 'started_at') || null,
    ended_at: val(formData, 'ended_at') || null,
    recruiting_slug: recruitingSlug || null,
    application_start_at: val(formData, 'application_start_at') || null,
    application_end_at: val(formData, 'application_end_at') || null,
    max_capacity: nullableInt(val(formData, 'max_capacity'))
  });
  if (error) return { error: error.message };

  revalidatePath('/dashboard/cohorts');
  return {};
}

export async function updateCohort(id: string, formData: FormData): Promise<ActionResult> {
  const name = val(formData, 'name');
  if (!name) return { error: '기수 이름은 필수입니다.' };

  const recruitingSlug = val(formData, 'recruiting_slug');

  const supabase = createAdminClient();

  if (recruitingSlug) {
    const { data: dup } = await supabase
      .from('cohorts')
      .select('id')
      .eq('recruiting_slug', recruitingSlug)
      .neq('id', id)
      .maybeSingle();
    if (dup) return { error: '이미 다른 기수에서 사용 중인 모집 코드(slug)입니다.' };
  }

  const { error } = await supabase
    .from('cohorts')
    .update({
      name,
      started_at: val(formData, 'started_at') || null,
      ended_at: val(formData, 'ended_at') || null,
      recruiting_slug: recruitingSlug || null,
      application_start_at: val(formData, 'application_start_at') || null,
      application_end_at: val(formData, 'application_end_at') || null,
      max_capacity: nullableInt(val(formData, 'max_capacity'))
    })
    .eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/dashboard/cohorts');
  return {};
}

export async function deleteCohort(id: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('cohorts').delete().eq('id', id);
  if (error) {
    const message = error.message;
    if (message.includes('23503') || message.includes('violates foreign key constraint')) {
      return { error: '교육생이 등록된 기수는 삭제할 수 없습니다.' };
    }
    return { error: message };
  }

  revalidatePath('/dashboard/cohorts');
  return {};
}
