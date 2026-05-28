'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  type AppQuestion,
  type ParsedRow,
  mapAnswerValue
} from '@/lib/applications-xls-parser';
import type { Json } from '@/lib/supabase/types';

const ALLOWED_STATUSES = ['applied', 'pending', 'selected', 'rejected', 'withdrawn'] as const;
type ApplicationStatus = (typeof ALLOWED_STATUSES)[number];

export async function updateApplicationStatus(
  applicationId: string,
  newStatus: string,
  cohortId: string
): Promise<{ error?: string }> {
  if (!ALLOWED_STATUSES.includes(newStatus as ApplicationStatus)) {
    return { error: '허용되지 않은 상태값입니다.' };
  }
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const decidedAt = newStatus === 'selected' || newStatus === 'rejected' ? today : null;
  const { error } = await supabase
    .from('applications')
    .update({ status: newStatus, decided_at: decidedAt })
    .eq('id', applicationId);
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/applications`);
  return {};
}

// ============================================================================
// 자동 선발 추천 (로직 자체는 _selection-logic.ts, 여기는 DB I/O만)
// ============================================================================

import { C2_TO_SELECTION, type CandidateRow } from './_selection-logic';

export async function loadSelectionPool(
  cohortId: string
): Promise<{ error?: string; candidates?: CandidateRow[]; knowledgeMax?: number }> {
  try {
    const supabase = createAdminClient();

    // applications + applicants 조회
    type AppQ = {
      id: string;
      status: string;
      knowledge_score: number | null;
      applicant_id: string;
      applicants: {
        id: string;
        name: string;
        organizations: { name: string } | null;
      } | null;
    };
    // 자동 선발 후보군은 심사 대상(applied/pending)만. 이미 확정·취하된 사람은 제외.
    const { data: apps, error: appErr } = await supabase
      .from('applications')
      .select('id, status, knowledge_score, applicant_id, applicants(id, name, organizations(name))')
      .eq('cohort_id', cohortId)
      .in('status', ['applied', 'pending'])
      .returns<AppQ[]>();
    if (appErr) throw new Error(appErr.message);

    // questions: C2/Plan id + knowledge 가중치 합
    const { data: questions, error: qErr } = await supabase
      .from('application_questions')
      .select('id, question_no, section, weight, display_order')
      .eq('cohort_id', cohortId)
      .order('display_order', { ascending: true });
    if (qErr) throw new Error(qErr.message);
    const c2 = questions?.find((q) => q.question_no === 'C2');
    // 활용계획은 question_no='Plan'으로 명시 식별 (마지막 문항 가정 회피)
    const finalQ = questions?.find((q) => q.question_no === 'Plan');
    const knowledgeMax = (questions ?? [])
      .filter((q) => q.section === 'knowledge')
      .reduce((s, q) => s + Number(q.weight ?? 1), 0);

    // 응답 조회
    const appIds = (apps ?? []).map((a) => a.id);
    const c2Map = new Map<string, string>();
    const planMap = new Map<string, string>();
    if (appIds.length > 0 && (c2 || finalQ)) {
      const targetIds = [c2?.id, finalQ?.id].filter((x): x is string => Boolean(x));
      const { data: answers } = await supabase
        .from('application_answers')
        .select('application_id, question_id, answer_value')
        .in('application_id', appIds)
        .in('question_id', targetIds);
      for (const a of answers ?? []) {
        const v = typeof a.answer_value === 'string' ? a.answer_value : '';
        if (a.question_id === c2?.id) c2Map.set(a.application_id, v);
        else if (a.question_id === finalQ?.id) planMap.set(a.application_id, v);
      }
    }

    const candidates: CandidateRow[] = (apps ?? []).map((a) => {
      const c2Key = c2Map.get(a.id) ?? '';
      const planText = planMap.get(a.id) ?? '';
      return {
        application_id: a.id,
        applicant_id: a.applicants?.id ?? '',
        name: a.applicants?.name ?? '(이름 없음)',
        organization: a.applicants?.organizations?.name ?? null,
        category: C2_TO_SELECTION[c2Key] ?? 'other',
        knowledge_score: a.knowledge_score ?? 0,
        plan_char_count: planText.replace(/\s+/g, '').length,
        plan_text: planText,
        current_status: a.status
      };
    });

    return { candidates, knowledgeMax };
  } catch (e) {
    return { error: e instanceof Error ? e.message : '풀 로드 실패' };
  }
}

export async function resetSelections(
  cohortId: string
): Promise<{ error?: string; resetCount?: number }> {
  try {
    const supabase = createAdminClient();
    // 취하(withdrawn)는 신청자의 명시적 철회이므로 자동 초기화에서 제외
    const { data, error } = await supabase
      .from('applications')
      .update({ status: 'applied', decided_at: null, rejected_stage: null })
      .eq('cohort_id', cohortId)
      .in('status', ['selected', 'rejected', 'pending'])
      .select('id');
    if (error) throw new Error(error.message);
    revalidatePath(`/dashboard/cohorts/${cohortId}/applications`);
    return { resetCount: data?.length ?? 0 };
  } catch (e) {
    return { error: e instanceof Error ? e.message : '초기화 실패' };
  }
}

export async function applySelections(
  cohortId: string,
  selectedIds: string[],
  rejectOthers: boolean
): Promise<{ error?: string; selectedCount?: number; rejectedCount?: number }> {
  try {
    const supabase = createAdminClient();
    const today = new Date().toISOString().slice(0, 10);

    // RPC `apply_selections` 한 번 호출 — 선발/탈락을 하나의 트랜잭션으로 처리.
    // 중간 실패 시 자동 ROLLBACK 되어 중간 상태가 남지 않음.
    // 함수 정의: supabase/migrations/20260528000001_apply_selections_rpc.sql
    // @ts-expect-error supabase types.ts에 RPC 등록 안 됨 — 마이그레이션 적용 후 types regen 필요
    const { data, error } = await supabase.rpc('apply_selections', {
      p_cohort_id: cohortId,
      p_selected_ids: selectedIds,
      p_reject_others: rejectOthers,
      p_decided_at: today
    });
    if (error) throw new Error(error.message);

    const result = (data ?? {}) as { selected_count?: number; rejected_count?: number };

    revalidatePath(`/dashboard/cohorts/${cohortId}/applications`);
    return {
      selectedCount: result.selected_count ?? 0,
      rejectedCount: result.rejected_count ?? 0
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : '적용 실패' };
  }
}

export type ImportResult = {
  error?: string;
  stats?: {
    newApplicants: number;
    updatedApplicants: number;
    newOrganizations: number;
    newApplications: number;
    updatedApplications: number;
    answersWritten: number;
    skippedNoName: number;
  };
};

async function loadQuestions(cohortId: string): Promise<AppQuestion[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('application_questions')
    .select('id, question_no, question_type, section, choices, correct_choice')
    .eq('cohort_id', cohortId)
    .order('display_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AppQuestion[];
}

export async function importApplicationsXls(
  cohortId: string,
  preRows: ParsedRow[],
  multiMappingByQno: Record<string, Record<string, string>>
): Promise<ImportResult> {
  try {
    const supabase = createAdminClient();
    const questions = await loadQuestions(cohortId);

    const stats = {
      newApplicants: 0,
      updatedApplicants: 0,
      newOrganizations: 0,
      newApplications: 0,
      updatedApplications: 0,
      answersWritten: 0,
      skippedNoName: 0
    };

    const orgCache = new Map<string, string>();
    const getOrCreateOrg = async (name: string): Promise<string | null> => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const cached = orgCache.get(trimmed);
      if (cached) return cached;
      const { data: existing } = await supabase
        .from('organizations')
        .select('id')
        .eq('name', trimmed)
        .limit(1);
      if (existing && existing[0]) {
        orgCache.set(trimmed, existing[0].id);
        return existing[0].id;
      }
      const { data: created, error } = await supabase
        .from('organizations')
        .insert({ name: trimmed })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      stats.newOrganizations++;
      orgCache.set(trimmed, created.id);
      return created.id;
    };

    const today = new Date().toISOString().slice(0, 10);
    const qC3 = questions.find((q) => q.question_no === 'C3');
    const qC5 = questions.find((q) => q.question_no === 'C5');
    const c3Idx = qC3 ? questions.indexOf(qC3) : -1;
    const c5Idx = qC5 ? questions.indexOf(qC5) : -1;

    for (const row of preRows) {
      if (!row.name) {
        stats.skippedNoName++;
        continue;
      }
      const orgId = await getOrCreateOrg(row.organizationName);

      let applicantId: string | null = null;
      if (row.phone) {
        const { data } = await supabase
          .from('applicants')
          .select('id')
          .eq('name', row.name)
          .eq('phone', row.phone)
          .limit(1);
        applicantId = data?.[0]?.id ?? null;
      }
      if (!applicantId && row.email) {
        const { data } = await supabase
          .from('applicants')
          .select('id')
          .eq('name', row.name)
          .eq('email', row.email)
          .limit(1);
        applicantId = data?.[0]?.id ?? null;
      }

      const department = c3Idx >= 0 ? row.rawValues[c3Idx] || null : null;
      const jobRoleRaw = c5Idx >= 0 ? row.rawValues[c5Idx] || null : null;
      const jobRole = jobRoleRaw ? jobRoleRaw.replace(/^\d+\.\s*/, '').trim() : null;

      const applicantFields = {
        name: row.name,
        phone: row.phone || null,
        email: row.email || null,
        organization_id: orgId,
        department,
        job_role: jobRole
      };

      if (applicantId) {
        const { error } = await supabase
          .from('applicants')
          .update(applicantFields)
          .eq('id', applicantId);
        if (error) throw new Error(error.message);
        stats.updatedApplicants++;
      } else {
        const { data, error } = await supabase
          .from('applicants')
          .insert(applicantFields)
          .select('id')
          .single();
        if (error) throw new Error(error.message);
        applicantId = data.id;
        stats.newApplicants++;
      }

      const { data: existingApp } = await supabase
        .from('applications')
        .select('id')
        .eq('applicant_id', applicantId)
        .eq('cohort_id', cohortId)
        .is('track_id', null)
        .limit(1);
      let applicationId: string;
      if (existingApp && existingApp[0]) {
        applicationId = existingApp[0].id;
        const { error } = await supabase
          .from('applications')
          .update({ applied_at: today })
          .eq('id', applicationId);
        if (error) throw new Error(error.message);
        stats.updatedApplications++;
      } else {
        const { data: created, error } = await supabase
          .from('applications')
          .insert({
            applicant_id: applicantId,
            cohort_id: cohortId,
            status: 'applied',
            applied_at: today
          })
          .select('id')
          .single();
        if (error) throw new Error(error.message);
        applicationId = created.id;
        stats.newApplications++;
      }

      const answerRows: { application_id: string; question_id: string; answer_value: Json }[] = [];
      for (let qi = 0; qi < questions.length; qi++) {
        const q = questions[qi];
        const raw = row.rawValues[qi];
        if (!raw) continue;
        const multiMap = multiMappingByQno[q.question_no];
        const val = mapAnswerValue(raw, q, multiMap);
        if (val === null || val === undefined) continue;
        answerRows.push({
          application_id: applicationId,
          question_id: q.id,
          answer_value: val as Json
        });
      }
      if (answerRows.length > 0) {
        const { error } = await supabase
          .from('application_answers')
          .upsert(answerRows, { onConflict: 'application_id,question_id' });
        if (error) throw new Error(error.message);
        stats.answersWritten += answerRows.length;
      }
    }

    revalidatePath(`/dashboard/cohorts/${cohortId}/applications`);
    revalidatePath('/dashboard/applicants');

    return { stats };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'import 실패' };
  }
}
