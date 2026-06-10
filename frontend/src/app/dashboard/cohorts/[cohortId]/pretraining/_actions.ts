'use server';

import { randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logActivity } from '@/lib/activity-log';

type ActionResult = { error?: string };

function generateShareCode(): string {
  return randomBytes(6).toString('base64url');
}

export async function createChecklist(
  cohortId: string,
  formData: FormData
): Promise<ActionResult & { id?: string }> {
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { error: '체크리스트 제목은 필수입니다.' };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('pretraining_checklists')
    .insert({
      cohort_id: cohortId,
      title,
      description: String(formData.get('description') ?? '').trim() || null,
      guide_url: String(formData.get('guide_url') ?? '').trim() || null
    })
    .select('id')
    .single();
  if (error) return { error: error.message };

  await logActivity({
    actionType: 'create',
    resourceType: 'survey',
    resourceId: data?.id ?? null,
    cohortId,
    summary: `사전 세팅 체크리스트 생성: ${title}`
  });

  revalidatePath(`/dashboard/cohorts/${cohortId}/pretraining`);
  return { id: data?.id };
}

export async function updateChecklist(
  cohortId: string,
  checklistId: string,
  formData: FormData
): Promise<ActionResult> {
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { error: '체크리스트 제목은 필수입니다.' };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('pretraining_checklists')
    .update({
      title,
      description: String(formData.get('description') ?? '').trim() || null,
      guide_url: String(formData.get('guide_url') ?? '').trim() || null
    })
    .eq('id', checklistId)
    .eq('cohort_id', cohortId);
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/pretraining`);
  revalidatePath(`/dashboard/cohorts/${cohortId}/pretraining/${checklistId}`);
  return {};
}

export async function deleteChecklist(
  cohortId: string,
  checklistId: string
): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { data: target } = await supabase
    .from('pretraining_checklists')
    .select('title')
    .eq('id', checklistId)
    .maybeSingle();
  const { error } = await supabase
    .from('pretraining_checklists')
    .delete()
    .eq('id', checklistId)
    .eq('cohort_id', cohortId);
  if (error) return { error: error.message };

  await logActivity({
    actionType: 'delete',
    resourceType: 'survey',
    resourceId: checklistId,
    cohortId,
    summary: `사전 세팅 체크리스트 삭제: ${target?.title ?? checklistId}`
  });

  revalidatePath(`/dashboard/cohorts/${cohortId}/pretraining`);
  return {};
}

export async function publishChecklist(
  cohortId: string,
  checklistId: string
): Promise<ActionResult & { code?: string | null }> {
  const supabase = createAdminClient();
  const { data: cur } = await supabase
    .from('pretraining_checklists')
    .select('share_code, opens_at, title')
    .eq('id', checklistId)
    .maybeSingle();
  if (cur?.share_code) return { code: cur.share_code };

  for (let i = 0; i < 3; i++) {
    const code = generateShareCode();
    const { error } = await supabase
      .from('pretraining_checklists')
      .update({
        share_code: code,
        opens_at: cur?.opens_at ?? new Date().toISOString()
      })
      .eq('id', checklistId)
      .eq('cohort_id', cohortId);
    if (!error) {
      await logActivity({
        actionType: 'publish',
        resourceType: 'survey',
        resourceId: checklistId,
        cohortId,
        summary: `사전 세팅 체크리스트 발행: ${cur?.title ?? checklistId}`
      });
      revalidatePath(`/dashboard/cohorts/${cohortId}/pretraining`);
      return { code };
    }
    if (!/unique|duplicate/i.test(error.message)) {
      return { error: error.message };
    }
  }
  return { error: '공유 코드 발급에 실패했습니다.' };
}

export async function revokeChecklist(
  cohortId: string,
  checklistId: string
): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('pretraining_checklists')
    .update({ share_code: null, closes_at: new Date().toISOString() })
    .eq('id', checklistId)
    .eq('cohort_id', cohortId);
  if (error) return { error: error.message };

  await logActivity({
    actionType: 'share_revoke',
    resourceType: 'survey',
    resourceId: checklistId,
    cohortId,
    summary: '사전 세팅 체크리스트 공유 회수'
  });

  revalidatePath(`/dashboard/cohorts/${cohortId}/pretraining`);
  return {};
}

export async function addItem(
  cohortId: string,
  checklistId: string,
  formData: FormData
): Promise<ActionResult> {
  const text = String(formData.get('text') ?? '').trim();
  if (!text) return { error: '항목 내용은 필수입니다.' };

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from('pretraining_checklist_items')
    .select('display_order, parent_id')
    .eq('checklist_id', checklistId)
    .order('display_order', { ascending: false })
    .limit(1);
  const nextOrder = (existing?.[0]?.display_order ?? 0) + 1;

  const questionNo = String(formData.get('question_no') ?? '').trim() || String(nextOrder);
  const parentIdRaw = String(formData.get('parent_id') ?? '').trim();
  const parentAnswer = String(formData.get('parent_answer') ?? '').trim();

  const { error } = await supabase.from('pretraining_checklist_items').insert({
    checklist_id: checklistId,
    question_no: questionNo,
    text,
    guide_url: String(formData.get('guide_url') ?? '').trim() || null,
    no_hint: String(formData.get('no_hint') ?? '').trim() || null,
    parent_id: parentIdRaw || null,
    parent_answer: parentIdRaw ? parentAnswer || 'yes' : null,
    display_order: nextOrder
  });
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/pretraining/${checklistId}`);
  return {};
}

export async function deleteItem(
  cohortId: string,
  checklistId: string,
  itemId: string
): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('pretraining_checklist_items')
    .delete()
    .eq('id', itemId)
    .eq('checklist_id', checklistId);
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/pretraining/${checklistId}`);
  return {};
}
