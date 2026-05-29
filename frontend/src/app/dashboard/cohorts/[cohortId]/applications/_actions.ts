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

// C2 응답 텍스트 정규화 (parser와 동일 규칙)
const normC2 = (s: string) => s.replace(/\s+/g, '').replace(/[·、,「」『』""'']/g, '');
const normPhone = (s: string | null | undefined) => (s ?? '').replace(/[^\d]/g, '');
const normEmail = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

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
        phone: string | null;
        email: string | null;
        organizations: { name: string } | null;
      } | null;
    };
    // 자동 선발 후보군은 심사 대상(applied/pending)만. 이미 확정·취하된 사람은 제외.
    const { data: apps, error: appErr } = await supabase
      .from('applications')
      .select(
        'id, status, knowledge_score, applicant_id, applicants(id, name, phone, email, organizations(name))'
      )
      .eq('cohort_id', cohortId)
      .in('status', ['applied', 'pending'])
      .returns<AppQ[]>();
    if (appErr) throw new Error(appErr.message);

    // 1) cohort.prereq_course_codes — 이 cohort에서 필수로 요구하는 과목 list
    const { data: cohortMeta } = await supabase
      .from('cohorts')
      .select('prereq_course_codes')
      .eq('id', cohortId)
      .maybeSingle();
    const prereqCodes: string[] =
      ((cohortMeta as { prereq_course_codes: string[] | null } | null)?.prereq_course_codes ?? []);
    const prereqMax = prereqCodes.length;

    // 2) lms_completions에서 prereq 과목만 fetch (필수 없으면 skip)
    const phonesByCourse = new Map<string, Set<string>>();
    const emailsByCourse = new Map<string, Set<string>>();
    type LmsRow = { course_code: string; phone: string | null; email: string | null };
    if (prereqMax > 0) {
      // PostgREST max-rows=1000 우회: range로 chunked fetch
      const lmsRowsAll: LmsRow[] = [];
      const chunk = 1000;
      for (let from = 0; from < 1_000_000; from += chunk) {
        const res = (await supabase
          // @ts-expect-error supabase types.ts에 lms_completions 미반영
          .from('lms_completions')
          .select('course_code, phone, email')
          .in('course_code', prereqCodes)
          .range(from, from + chunk - 1)) as unknown as {
          data: LmsRow[] | null;
          error: { message: string } | null;
        };
        const batch = res.data ?? [];
        lmsRowsAll.push(...batch);
        if (batch.length < chunk) break;
      }
      for (const r of lmsRowsAll) {
        if (!phonesByCourse.has(r.course_code)) {
          phonesByCourse.set(r.course_code, new Set());
          emailsByCourse.set(r.course_code, new Set());
        }
        if (r.phone) phonesByCourse.get(r.course_code)!.add(r.phone);
        if (r.email) emailsByCourse.get(r.course_code)!.add(r.email.trim().toLowerCase());
      }
    }

    const computePrereqDone = (phone: string | null, email: string | null): number => {
      if (prereqMax === 0) return 0;
      const p = normPhone(phone);
      const e = normEmail(email);
      let done = 0;
      for (const code of prereqCodes) {
        const ps = phonesByCourse.get(code);
        const es = emailsByCourse.get(code);
        const hit = (p && ps?.has(p)) || (e && es?.has(e));
        if (hit) done++;
      }
      return done;
    };

    // questions: C2/Plan/U1 id + knowledge 가중치 합 + U1 보기 개수
    type QuestionMeta = {
      id: string;
      question_no: string;
      section: string;
      question_type: string;
      weight: number | null;
      choices: { key: string; text: string }[] | null;
      display_order: number;
    };
    const { data: questions, error: qErr } = await supabase
      .from('application_questions')
      .select('id, question_no, section, question_type, weight, choices, display_order')
      .eq('cohort_id', cohortId)
      .order('display_order', { ascending: true })
      .returns<QuestionMeta[]>();
    if (qErr) throw new Error(qErr.message);
    const c2 = questions?.find((q) => q.question_no === 'C2');
    // 활용계획(Plan)·다수체크(U1)는 question_no로 명시 식별
    const finalQ = questions?.find((q) => q.question_no === 'Plan');
    const multiQ = questions?.find((q) => q.question_no === 'U1');
    const multiChoicesMax = multiQ?.choices?.length ?? 0;
    const knowledgeMax = (questions ?? [])
      .filter((q) => q.section === 'knowledge')
      .reduce((s, q) => s + Number(q.weight ?? 1), 0);

    // 응답 조회: C2(분류) + Plan(활용계획 글자수) + U1(다수체크 개수)
    const appIds = (apps ?? []).map((a) => a.id);
    const c2Map = new Map<string, string>();
    const planMap = new Map<string, string>();
    const multiCountMap = new Map<string, number>();
    if (appIds.length > 0 && (c2 || finalQ || multiQ)) {
      const targetIds = [c2?.id, finalQ?.id, multiQ?.id].filter((x): x is string => Boolean(x));
      const { data: answers } = await supabase
        .from('application_answers')
        .select('application_id, question_id, answer_value')
        .in('application_id', appIds)
        .in('question_id', targetIds);
      for (const a of answers ?? []) {
        if (a.question_id === c2?.id) {
          c2Map.set(a.application_id, typeof a.answer_value === 'string' ? a.answer_value : '');
        } else if (a.question_id === finalQ?.id) {
          planMap.set(a.application_id, typeof a.answer_value === 'string' ? a.answer_value : '');
        } else if (a.question_id === multiQ?.id) {
          // multi answer_value는 배열 형태 ["①","②","③"]
          const arr = Array.isArray(a.answer_value) ? a.answer_value : [];
          multiCountMap.set(a.application_id, arr.length);
        }
      }
    }

    // 같은 applicant가 다른 cohort에 active(applied/pending/selected) 지원한 이력 매핑
    const applicantIds = (apps ?? [])
      .map((a) => a.applicants?.id)
      .filter((x): x is string => Boolean(x));
    const otherByApplicant = new Map<
      string,
      { cohort_id: string; cohort_name: string; status: string }[]
    >();
    if (applicantIds.length > 0) {
      type OtherApp = {
        applicant_id: string;
        cohort_id: string;
        status: string;
        cohorts: { name: string } | null;
      };
      const { data: otherApps } = await supabase
        .from('applications')
        .select('applicant_id, cohort_id, status, cohorts(name)')
        .in('applicant_id', applicantIds)
        .neq('cohort_id', cohortId)
        .in('status', ['applied', 'pending', 'selected'])
        .returns<OtherApp[]>();
      for (const oa of otherApps ?? []) {
        const arr = otherByApplicant.get(oa.applicant_id) ?? [];
        arr.push({
          cohort_id: oa.cohort_id,
          cohort_name: oa.cohorts?.name ?? '?',
          status: oa.status
        });
        otherByApplicant.set(oa.applicant_id, arr);
      }
    }

    const candidates: CandidateRow[] = (apps ?? []).map((a) => {
      const c2Key = c2Map.get(a.id) ?? '';
      const planText = planMap.get(a.id) ?? '';
      const multiCount = multiCountMap.get(a.id) ?? 0;
      const applicantId = a.applicants?.id ?? '';
      return {
        application_id: a.id,
        applicant_id: applicantId,
        name: a.applicants?.name ?? '(이름 없음)',
        organization: a.applicants?.organizations?.name ?? null,
        category: C2_TO_SELECTION[c2Key] ?? 'other',
        knowledge_score: a.knowledge_score ?? 0,
        plan_char_count: planText.replace(/\s+/g, '').length,
        plan_text: planText,
        multi_selected_count: multiCount,
        multi_choices_max: multiChoicesMax,
        prereq_done_count: computePrereqDone(a.applicants?.phone ?? null, a.applicants?.email ?? null),
        prereq_max: prereqMax,
        current_status: a.status,
        other_applications: otherByApplicant.get(applicantId) ?? []
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
    const qC2 = questions.find((q) => q.question_no === 'C2');
    const qC3 = questions.find((q) => q.question_no === 'C3');
    const qC5 = questions.find((q) => q.question_no === 'C5');
    const c2Idx = qC2 ? questions.indexOf(qC2) : -1;
    const c3Idx = qC3 ? questions.indexOf(qC3) : -1;
    const c5Idx = qC5 ? questions.indexOf(qC5) : -1;

    // C2 응답값 → 한글 분류 라벨
    const c2LabelByChoice: Record<string, string> = {
      '①': '중앙부처',
      '②': '광역지자체',
      '③': '기초지자체',
      '④': '공공기관',
      '⑤': '교육행정기관',
      '⑥': '기타'
    };

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

      // C2 응답 → category 라벨 (응답 없으면 NULL)
      let category: string | null = null;
      if (c2Idx >= 0 && qC2) {
        const c2Raw = row.rawValues[c2Idx];
        if (c2Raw) {
          const m = c2Raw.match(/^\d+\.\s*([①②③④⑤⑥])/);
          if (m && c2LabelByChoice[m[1]]) {
            category = c2LabelByChoice[m[1]];
          } else {
            // text 매칭 fallback (mapSingleValue와 동일 로직 단순화)
            const stripped = c2Raw.replace(/^\d+\.\s*/, '').trim();
            const target = normC2(stripped);
            for (const c of qC2.choices ?? []) {
              if (normC2(c.text) === target && c2LabelByChoice[c.key]) {
                category = c2LabelByChoice[c.key];
                break;
              }
            }
          }
        }
      }

      const applicantFields = {
        name: row.name,
        phone: row.phone || null,
        email: row.email || null,
        organization_id: orgId,
        department,
        job_role: jobRole,
        category
      };

      if (applicantId) {
        const { error } = await supabase
          .from('applicants')
          // @ts-expect-error supabase types.ts에 applicants.category 미반영
          .update(applicantFields)
          .eq('id', applicantId);
        if (error) throw new Error(error.message);
        stats.updatedApplicants++;
      } else {
        const { data, error } = await supabase
          .from('applicants')
          // @ts-expect-error supabase types.ts에 applicants.category 미반영
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
