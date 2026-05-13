// 한 cohort에 가상 신청자·응답·채점 결과를 박는다.
// 상세 페이지·테이블·통계가 잘 동작하는지 시각적으로 검증하기 위한 일회성 스크립트.
//
// 멱등성: 같은 이름의 applicant는 재사용, 동일 (applicant, cohort, track=NULL) application은
//        wipe-then-insert (응답·집계 모두 새로 계산).
//
// 사용:
//   bun run scripts/seed-dummy-applications.ts                        # 기본 cohort
//   bun run scripts/seed-dummy-applications.ts "AI 챔피언 그린 26-1기"  # 지정
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const targetCohortName = process.argv[2] ?? 'AI 챔피언 그린 26-1기';

const PERSONAS = [
  { name: '김민수', org: '행정안전부', dept: '디지털정부국', role: '행정직렬', knowledgeAccuracy: 0.95, selfBias: 4 },
  { name: '이지영', org: '서울특별시', dept: '스마트도시정책관', role: '전산직렬', knowledgeAccuracy: 0.85, selfBias: 4 },
  { name: '박철호', org: '교육부', dept: '디지털교육기획관', role: '행정직렬', knowledgeAccuracy: 0.75, selfBias: 3 },
  { name: '정수연', org: '기획재정부', dept: '재정관리국', role: '행정직렬', knowledgeAccuracy: 0.60, selfBias: 3 },
  { name: '최영준', org: '국토교통부', dept: '국토정보정책관', role: '전산직렬', knowledgeAccuracy: 0.80, selfBias: 4 },
  { name: '강은지', org: '보건복지부', dept: '정보화담당관', role: '특수직렬', knowledgeAccuracy: 0.55, selfBias: 2 },
  { name: '윤도현', org: '과학기술정보통신부', dept: '인공지능기반정책관', role: '전산직렬', knowledgeAccuracy: 0.90, selfBias: 5 },
  { name: '임서연', org: '문화체육관광부', dept: '디지털콘텐츠과', role: '특수직렬', knowledgeAccuracy: 0.45, selfBias: 2 },
  { name: '한지훈', org: '환경부', dept: '정보화기획팀', role: '전산직 제외 기술직렬', knowledgeAccuracy: 0.70, selfBias: 3 },
  { name: '송미라', org: '여성가족부', dept: '청소년정책관', role: '행정직렬', knowledgeAccuracy: 0.50, selfBias: 3 }
];

const STATUS_DISTRIBUTION: { status: string; rejected_stage: string | null }[] = [
  { status: 'selected', rejected_stage: null },
  { status: 'selected', rejected_stage: null },
  { status: 'selected', rejected_stage: null },
  { status: 'selected', rejected_stage: null },
  { status: 'applied', rejected_stage: null },
  { status: 'applied', rejected_stage: null },
  { status: 'pending', rejected_stage: null },
  { status: 'rejected', rejected_stage: '서류' },
  { status: 'rejected', rejected_stage: '면접' },
  { status: 'withdrawn', rejected_stage: null }
];

const PLANS = [
  '부서 내 정기 보고서 자동 초안 생성 워크플로를 설계하여 월간 보고 시간을 30% 절감하고자 한다.',
  '민원 자료 정리·요약 자동화를 시범 도입해 응대 속도와 일관성을 개선하겠다.',
  '공공데이터 기반 정책 인사이트 도출용 노코드 분석 파이프라인을 PoC로 구축할 계획이다.',
  '부서원 대상 AI 활용 가이드 워크숍을 분기별로 운영하여 조직 전체 적응력을 높이겠다.',
  '본 기관 RFP·기획안 초안 작성에 LLM을 활용하는 표준 프롬프트 템플릿을 마련하고자 한다.'
];

const NOTE_OFFICE_PHONES = ['02-2100-1234', '044-202-5678', '02-3299-1100', '044-203-9000', '02-6936-1100'];

type SeedQuestion = {
  id: string;
  section: string;
  question_no: string;
  question_type: string;
  choices: { key: string; text: string }[] | null;
  correct_choice: string | null;
  weight: number;
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function generateAnswer(
  q: SeedQuestion,
  persona: (typeof PERSONAS)[number]
): { value: unknown; isCorrect: boolean | null; score: number | null } {
  if (q.question_type === 'text') {
    if (q.section === 'plan') return { value: pick(PLANS), isCorrect: null, score: null };
    if (q.question_no === 'C2') {
      return { value: `${persona.org} / ${persona.dept} / 기획팀`, isCorrect: null, score: null };
    }
    if (q.question_no === 'C3') {
      return { value: pick(NOTE_OFFICE_PHONES), isCorrect: null, score: null };
    }
    if (q.question_no === 'C6') {
      return Math.random() < 0.3
        ? { value: '실습 중심 운영을 희망합니다.', isCorrect: null, score: null }
        : { value: '', isCorrect: null, score: null };
    }
    return { value: '', isCorrect: null, score: null };
  }

  if (q.question_type === 'likert5') {
    // self_diagnosis: persona.selfBias 중심으로 ±1 변동
    const base = persona.selfBias;
    const noise = Math.floor(Math.random() * 3) - 1; // -1, 0, +1
    const score = Math.max(1, Math.min(5, base + noise));
    return { value: score, isCorrect: null, score: null };
  }

  if (q.question_type === 'multi') {
    // 1~3개 무작위 선택
    const keys = (q.choices ?? []).map((c) => c.key);
    const count = 1 + Math.floor(Math.random() * Math.min(3, keys.length));
    return { value: pickN(keys, count), isCorrect: null, score: null };
  }

  // single
  const choices = q.choices ?? [];
  if (choices.length === 0) return { value: null, isCorrect: null, score: null };

  // knowledge + 정답 있음 → persona.accuracy 확률로 정답
  if (q.section === 'knowledge' && q.correct_choice) {
    const correct = Math.random() < persona.knowledgeAccuracy;
    const value = correct
      ? q.correct_choice
      : pick(choices.filter((c) => c.key !== q.correct_choice)).key;
    return {
      value,
      isCorrect: correct,
      score: correct ? q.weight : 0
    };
  }

  // 그 외 single (공통문항·사전학습 등) → 무작위
  return { value: pick(choices).key, isCorrect: null, score: null };
}

// --- 실행 ---

const { data: cohort } = await s
  .from('cohorts')
  .select('id, name')
  .eq('name', targetCohortName)
  .maybeSingle();

if (!cohort) {
  console.error(`cohort not found: ${targetCohortName}`);
  process.exit(1);
}

const { data: questions } = await s
  .from('application_questions')
  .select('id, section, question_no, question_type, choices, correct_choice, weight, display_order')
  .eq('cohort_id', cohort.id)
  .order('display_order');

if (!questions || questions.length === 0) {
  console.error(`no questions for cohort: ${cohort.name}`);
  process.exit(1);
}

const typedQuestions: SeedQuestion[] = questions.map((q) => ({
  id: q.id,
  section: q.section,
  question_no: q.question_no,
  question_type: q.question_type,
  choices: Array.isArray(q.choices)
    ? (q.choices as { key: string; text: string }[])
    : null,
  correct_choice: q.correct_choice,
  weight: q.weight
}));

console.log(`\ncohort: ${cohort.name} (${typedQuestions.length}문항)`);
console.log(`personas: ${PERSONAS.length}명\n`);

let created = 0;
let updated = 0;

for (let i = 0; i < PERSONAS.length; i++) {
  const persona = PERSONAS[i];
  const status = STATUS_DISTRIBUTION[i] ?? STATUS_DISTRIBUTION[0];

  // organizations upsert
  const { data: existingOrg } = await s
    .from('organizations')
    .select('id')
    .eq('name', persona.org)
    .maybeSingle();
  const orgId =
    existingOrg?.id ??
    (
      await s
        .from('organizations')
        .insert({ name: persona.org })
        .select('id')
        .single()
    ).data?.id;

  // applicant upsert (by name + org)
  let { data: applicant } = await s
    .from('applicants')
    .select('id')
    .eq('name', persona.name)
    .eq('organization_id', orgId!)
    .maybeSingle();
  if (!applicant) {
    const { data: newApp } = await s
      .from('applicants')
      .insert({
        name: persona.name,
        organization_id: orgId,
        department: persona.dept,
        job_role: persona.role,
        email: `${persona.name.toLowerCase()}@gov.kr`,
        phone: `010-${1000 + i * 111}-${4000 + i * 137}`
      })
      .select('id')
      .single();
    applicant = newApp ?? null;
  }
  if (!applicant) {
    console.error(`failed to create applicant: ${persona.name}`);
    continue;
  }

  // application — existing? upsert by (applicant, cohort, track=NULL)
  const { data: existingApp } = await s
    .from('applications')
    .select('id')
    .eq('applicant_id', applicant.id)
    .eq('cohort_id', cohort.id)
    .is('track_id', null)
    .maybeSingle();

  let applicationId: string;
  if (existingApp) {
    applicationId = existingApp.id;
    // wipe existing answers
    await s.from('application_answers').delete().eq('application_id', applicationId);
    updated += 1;
  } else {
    const { data: newApp } = await s
      .from('applications')
      .insert({
        applicant_id: applicant.id,
        cohort_id: cohort.id,
        status: status.status,
        rejected_stage: status.rejected_stage,
        applied_at: '2026-04-15',
        decided_at: status.status === 'selected' || status.status === 'rejected' ? '2026-05-01' : null
      })
      .select('id')
      .single();
    if (!newApp) {
      console.error(`failed to create application: ${persona.name}`);
      continue;
    }
    applicationId = newApp.id;
    created += 1;
  }

  // generate answers + scoring
  const answers: Array<{
    application_id: string;
    question_id: string;
    answer_value: unknown;
    is_correct: boolean | null;
    score: number | null;
  }> = [];

  let knowledgeScore = 0;
  let knowledgeCorrect = 0;
  let knowledgeTotal = 0;
  const selfScores: number[] = [];

  for (const q of typedQuestions) {
    const { value, isCorrect, score } = generateAnswer(q, persona);
    answers.push({
      application_id: applicationId,
      question_id: q.id,
      answer_value: value as never,
      is_correct: isCorrect,
      score
    });
    if (q.section === 'knowledge' && q.correct_choice) {
      knowledgeTotal += 1;
      if (isCorrect) {
        knowledgeCorrect += 1;
        knowledgeScore += score ?? 0;
      }
    }
    if (q.section === 'self_diagnosis' && typeof value === 'number') {
      selfScores.push(value);
    }
  }

  await s.from('application_answers').insert(answers);

  // update applications 집계
  await s
    .from('applications')
    .update({
      knowledge_score: knowledgeScore,
      knowledge_correct_count: knowledgeCorrect,
      knowledge_total_count: knowledgeTotal,
      self_diagnosis_avg:
        selfScores.length > 0
          ? Math.round((selfScores.reduce((a, b) => a + b, 0) / selfScores.length) * 10) / 10
          : null
    })
    .eq('id', applicationId);

  console.log(
    `  [${status.status.padEnd(9)}] ${persona.name.padEnd(4)} (${persona.org.padEnd(10)}) — 지식 ${knowledgeScore}점 (${knowledgeCorrect}/${knowledgeTotal}), 자가진단 ${selfScores.length > 0 ? (selfScores.reduce((a, b) => a + b, 0) / selfScores.length).toFixed(1) : '—'}`
  );
}

console.log(`\n완료 — 생성 ${created}, 갱신 ${updated}`);
