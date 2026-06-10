'use server';

import { createAdminClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/types';

type ActionResult = { error?: string; ok?: boolean };

export async function submitChecklistResponse(
  checklistId: string,
  payload: {
    name: string;
    organization: string;
    phone: string;
    answers: Record<string, 'yes' | 'no'>;
  }
): Promise<ActionResult> {
  const name = payload.name.trim();
  if (!name) return { error: '이름을 입력해주세요.' };

  const supabase = createAdminClient();

  // 체크리스트 유효성 — 마감 여부
  const { data: cl } = await supabase
    .from('pretraining_checklists')
    .select('id, closes_at')
    .eq('id', checklistId)
    .maybeSingle();
  if (!cl) return { error: '체크리스트를 찾을 수 없습니다.' };
  if (cl.closes_at && new Date(cl.closes_at) <= new Date()) {
    return { error: '응답 기간이 마감되었습니다.' };
  }

  const { error } = await supabase.from('pretraining_checklist_responses').insert({
    checklist_id: checklistId,
    name,
    organization: payload.organization.trim() || null,
    phone: payload.phone.trim() || null,
    answers: payload.answers as unknown as Json,
    submitted_at: new Date().toISOString()
  });
  if (error) return { error: error.message };

  return { ok: true };
}
