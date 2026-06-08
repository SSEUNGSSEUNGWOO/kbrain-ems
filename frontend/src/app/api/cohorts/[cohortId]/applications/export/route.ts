import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  buildApplicationsWorkbook,
  type CohortTrack,
  type ExportApplication,
  type SelectionConfigSummary
} from '@/lib/excel/applications-export';
import { DEFAULT_WEIGHTS, PLAN_CHARS_FULL } from '@/app/dashboard/cohorts/[cohortId]/applications/_selection-logic';
import type { PriorCertSummary } from '@/lib/excel/applications-export';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ cohortId: string }> }
) {
  const { cohortId } = await params;
  const supabase = createAdminClient();

  const { data: cohortRow, error: cohortError } = await supabase
    .from('cohorts')
    .select('id, name, prereq_course_codes, selection_config')
    .eq('id', cohortId)
    .maybeSingle<{
      id: string;
      name: string;
      prereq_course_codes: string[] | null;
      selection_config: Record<string, unknown> | null;
    }>();
  if (cohortError) return new NextResponse(cohortError.message, { status: 500 });
  if (!cohortRow) return new NextResponse('Cohort not found', { status: 404 });

  // 집중교육 기간 = sessions의 첫·마지막 session_date
  const { data: sessionRows } = await supabase
    .from('sessions')
    .select('session_date')
    .eq('cohort_id', cohortId)
    .order('session_date', { ascending: true });
  const sessionDates = (sessionRows ?? []).map((s) => s.session_date).filter(Boolean);
  const sessionStart = sessionDates[0] ?? null;
  const sessionEnd = sessionDates[sessionDates.length - 1] ?? null;

  const prereqCodes = cohortRow.prereq_course_codes ?? [];
  const prereqMax = prereqCodes.length;

  type AppRow = {
    id: string;
    status: string;
    rejected_stage: string | null;
    decided_at: string | null;
    knowledge_score: number | null;
    knowledge_correct_count: number | null;
    knowledge_total_count: number | null;
    applicant_id: string | null;
    applicants: {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      department: string | null;
      job_role: string | null;
      organizations: { name: string } | null;
    } | null;
  };

  const { data: applications, error: appError } = await supabase
    .from('applications')
    .select(
      'id, status, rejected_stage, decided_at, knowledge_score, knowledge_correct_count, knowledge_total_count, applicant_id, applicants(id, name, phone, email, department, job_role, organizations(name))'
    )
    .eq('cohort_id', cohortId)
    .in('status', ['selected', 'rejected'])
    .returns<AppRow[]>();
  if (appError) return new NextResponse(appError.message, { status: 500 });

  const rows = applications ?? [];
  const appIds = rows.map((r) => r.id);

  // 문항 메타: C2(분류) / Plan(글자수) / U1(다수체크) + knowledge 가중치 합
  type QMeta = {
    id: string;
    question_no: string;
    section: string;
    weight: number | null;
    choices: { key: string; text: string }[] | null;
  };
  const { data: questionsRaw } = await supabase
    .from('application_questions')
    .select('id, question_no, section, weight, choices')
    .eq('cohort_id', cohortId)
    .returns<QMeta[]>();
  const questions = questionsRaw ?? [];

  const c2Q = questions.find((q) => q.question_no === 'C2');
  const planQ = questions.find((q) => q.question_no === 'Plan');
  const multiQ = questions.find((q) => q.question_no === 'U1');
  const multiChoicesMax = multiQ?.choices?.length ?? 0;
  const knowledgeMax = Math.max(
    questions
      .filter((q) => q.section === 'knowledge')
      .reduce((s, q) => s + Number(q.weight ?? 1), 0),
    1
  );

  // 사전학습 수료 매칭 — cohort에 prereq 과목이 있을 때만 lms_completions 조회
  const phonesByCourse = new Map<string, Set<string>>();
  const emailsByCourse = new Map<string, Set<string>>();
  if (prereqMax > 0) {
    type LmsRow = { course_code: string; phone: string | null; email: string | null };
    const lmsAll: LmsRow[] = [];
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
      lmsAll.push(...batch);
      if (batch.length < chunk) break;
    }
    for (const r of lmsAll) {
      if (!phonesByCourse.has(r.course_code)) {
        phonesByCourse.set(r.course_code, new Set());
        emailsByCourse.set(r.course_code, new Set());
      }
      if (r.phone) phonesByCourse.get(r.course_code)!.add(r.phone);
      if (r.email) emailsByCourse.get(r.course_code)!.add(r.email.trim().toLowerCase());
    }
  }

  const normPhone = (s: string | null) => (s ?? '').replace(/[^\d]/g, '');
  const normEmail = (s: string | null) => (s ?? '').trim().toLowerCase();
  const computePrereqDone = (phone: string | null, email: string | null): number => {
    if (prereqMax === 0) return 0;
    const p = normPhone(phone);
    const e = normEmail(email);
    let done = 0;
    for (const code of prereqCodes) {
      const ps = phonesByCourse.get(code);
      const es = emailsByCourse.get(code);
      if ((p && ps?.has(p)) || (e && es?.has(e))) done++;
    }
    return done;
  };

  const c2ChoiceMap = new Map<string, string>();
  const planCharMap = new Map<string, number>();
  const multiCountMap = new Map<string, number>();

  // question_id가 cohort-specific이라 .in('application_id', ...) 없이도 cohort 범위 한정됨.
  // 큰 cohort에서 in() URL 길이·1000행 한계로 응답이 잘리는 걸 chunked range로 회피.
  if (appIds.length > 0) {
    const targetIds = [c2Q?.id, planQ?.id, multiQ?.id].filter((x): x is string => Boolean(x));
    if (targetIds.length > 0) {
      const chunk = 1000;
      for (let offset = 0; offset < 1_000_000; offset += chunk) {
        const { data: answers } = await supabase
          .from('application_answers')
          .select('application_id, question_id, answer_value')
          .in('question_id', targetIds)
          .range(offset, offset + chunk - 1);
        for (const a of answers ?? []) {
          if (a.question_id === c2Q?.id && typeof a.answer_value === 'string') {
            c2ChoiceMap.set(a.application_id, a.answer_value);
          } else if (a.question_id === planQ?.id && typeof a.answer_value === 'string') {
            planCharMap.set(a.application_id, a.answer_value.replace(/\s+/g, '').length);
          } else if (a.question_id === multiQ?.id && Array.isArray(a.answer_value)) {
            multiCountMap.set(a.application_id, a.answer_value.length);
          }
        }
        if (!answers || answers.length < chunk) break;
      }
    }
  }

  // 비고용 부가 정보: 작년 인증 이력 + 올해 전문인재 수강 여부
  const applicantIds = Array.from(
    new Set(rows.map((r) => r.applicants?.id).filter((x): x is string => Boolean(x)))
  );
  const priorCertsByApplicant = new Map<string, PriorCertSummary[]>();
  const expertLabelsByApplicant = new Map<string, string[]>();
  // applicantIds in() 으로 한 번에 넘기면 URL 한계 → 200개씩 chunk.
  const ID_CHUNK = 200;
  if (applicantIds.length > 0) {
    for (let i = 0; i < applicantIds.length; i += ID_CHUNK) {
      const slice = applicantIds.slice(i, i + ID_CHUNK);
      const { data: priorRows } = (await supabase
        .from('applicants')
        .select('id, prior_certs')
        .in('id', slice)) as unknown as {
        data: { id: string; prior_certs: PriorCertSummary[] | null }[] | null;
      };
      for (const p of priorRows ?? []) {
        priorCertsByApplicant.set(p.id, Array.isArray(p.prior_certs) ? p.prior_certs : []);
      }
    }

    // 현재 cohort 제외하고 'experts' 카테고리 cohort 에 학생으로 등록돼 있는지 + 어느 기수인지
    // (예: "전문인재 26-1기" → "26-1")
    const labelRe = /(\d+-\d+)기?/;
    for (let i = 0; i < applicantIds.length; i += ID_CHUNK) {
      const slice = applicantIds.slice(i, i + ID_CHUNK);
      const { data: studentRows } = (await supabase
        .from('students')
        .select('applicant_id, cohorts!inner(name, category)')
        .in('applicant_id', slice)
        .neq('cohort_id', cohortId)
        .eq('cohorts.category', 'experts')) as unknown as {
        data: { applicant_id: string; cohorts: { name: string } | null }[] | null;
      };
      for (const s of studentRows ?? []) {
        const name = s.cohorts?.name ?? '';
        const m = name.match(labelRe);
        const label = m ? m[1] : name;
        const arr = expertLabelsByApplicant.get(s.applicant_id) ?? [];
        if (!arr.includes(label)) arr.push(label);
        expertLabelsByApplicant.set(s.applicant_id, arr);
      }
    }
    // 라벨 정렬
    for (const [k, v] of expertLabelsByApplicant) {
      expertLabelsByApplicant.set(k, [...v].toSorted());
    }
  }

  // 제외 cohort에서 'selected'인 applicant_id 집합 (예: 블루 중복 합격자)
  const sc = (cohortRow.selection_config ?? {}) as { excludedCohortIds?: string[] };
  const excludedCohortIds = Array.isArray(sc.excludedCohortIds) ? sc.excludedCohortIds : [];
  const excludedApplicantIds = new Set<string>();
  if (excludedCohortIds.length > 0 && applicantIds.length > 0) {
    for (let i = 0; i < applicantIds.length; i += ID_CHUNK) {
      const slice = applicantIds.slice(i, i + ID_CHUNK);
      const { data: hits } = await supabase
        .from('applications')
        .select('applicant_id')
        .in('applicant_id', slice)
        .in('cohort_id', excludedCohortIds)
        .eq('status', 'selected');
      for (const h of hits ?? []) {
        if (h.applicant_id) excludedApplicantIds.add(h.applicant_id);
      }
    }
  }

  // 자동선발 화면과 동일한 가중치(50:50)로 종합점수 계산
  const wSum = DEFAULT_WEIGHTS.knowledge + DEFAULT_WEIGHTS.plan;
  const computeFinalScore = (r: AppRow): number | null => {
    if (r.knowledge_score === null) return null;
    const kNorm = Math.min(Math.max(r.knowledge_score / knowledgeMax, 0), 1);
    const planChars = planCharMap.get(r.id) ?? 0;
    const charNorm = Math.min(planChars / PLAN_CHARS_FULL, 1);
    const multiCount = multiCountMap.get(r.id) ?? 0;
    const multiNorm = multiChoicesMax > 0 ? Math.min(multiCount / multiChoicesMax, 1) : 0;
    const pNorm = (charNorm + multiNorm) / 2;
    const kPart = kNorm * DEFAULT_WEIGHTS.knowledge;
    const pPart = pNorm * DEFAULT_WEIGHTS.plan;
    return ((kPart + pPart) / wSum) * 100;
  };

  const toExport = (r: AppRow): ExportApplication => ({
    id: r.id,
    name: r.applicants?.name ?? '(이름 없음)',
    organization: r.applicants?.organizations?.name ?? null,
    department: r.applicants?.department ?? null,
    jobRole: r.applicants?.job_role ?? null,
    c2Choice: c2ChoiceMap.get(r.id) ?? null,
    knowledgeScore: r.knowledge_score,
    knowledgeCorrect: r.knowledge_correct_count,
    knowledgeTotal: r.knowledge_total_count,
    multiSelectedCount: multiCountMap.get(r.id) ?? null,
    multiChoicesMax,
    planCharCount: planCharMap.get(r.id) ?? null,
    prereqDoneCount: computePrereqDone(r.applicants?.phone ?? null, r.applicants?.email ?? null),
    prereqMax,
    finalScore: computeFinalScore(r),
    decidedAt: r.decided_at,
    rejectedStage: r.rejected_stage,
    priorCerts: priorCertsByApplicant.get(r.applicants?.id ?? '') ?? [],
    expertCohortLabels: r.applicants?.id ? (expertLabelsByApplicant.get(r.applicants.id) ?? []) : [],
    excludedByOtherCohort: r.applicants?.id ? excludedApplicantIds.has(r.applicants.id) : false
  });

  // 종합점수 내림차순 정렬 (NULL은 뒤로)
  const byScoreDesc = (a: ExportApplication, b: ExportApplication) =>
    (b.finalScore ?? -1) - (a.finalScore ?? -1);

  const selected = rows.filter((r) => r.status === 'selected').map(toExport).sort(byScoreDesc);
  const rejected = rows.filter((r) => r.status === 'rejected').map(toExport).sort(byScoreDesc);

  // cohort 이름에서 트랙 추출 (예: "AI 챔피언 블루 26-1기" → 'blue')
  const cohortTrack: CohortTrack = (() => {
    const n = cohortRow.name;
    if (n.includes('그린')) return 'green';
    if (n.includes('블루')) return 'blue';
    if (n.includes('전문인재')) return 'expert';
    if (n.includes('보수교육')) return 'continuing';
    return null;
  })();

  const buf = await buildApplicationsWorkbook({
    cohortName: cohortRow.name,
    cohortTrack,
    selected,
    rejected,
    selectionConfig: cohortRow.selection_config as SelectionConfigSummary | null,
    startedAt: sessionStart,
    endedAt: sessionEnd
  });

  const year = new Date().getFullYear();
  const filename = `${year}년 ${cohortRow.name} 선발 명단.xlsx`;
  const encoded = encodeURIComponent(filename);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'no-store'
    }
  });
}
