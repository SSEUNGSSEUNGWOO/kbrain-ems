// 선발 로직 리팩터 전후 동작 보존 검증.
//  리팩터 전: bun run scripts/verify-selection-refactor.ts baseline
//    → scripts/.selection-baseline.json 생성 (config sweep별 selectedIds)
//  리팩터 후: bun run scripts/verify-selection-refactor.ts compare  (Task 4에서 compare 분기 추가)
//    → 동일 입력을 새 파이프라인으로 실행, baseline과 완전 일치 확인
// .selection-baseline.json은 커밋하지 않는다 (검증 후 Task 10에서 삭제).
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import {
  recommendByQuotas,
  runExclusions,
  C2_TO_SELECTION,
  type CandidateRow,
  type SelectionCategory
} from '../src/app/dashboard/cohorts/[cohortId]/applications/_selection-logic';

const MODE = process.argv[2];
if (MODE !== 'baseline' && MODE !== 'compare') {
  console.error('사용법: bun run scripts/verify-selection-refactor.ts <baseline|compare>');
  process.exit(1);
}

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8');
const getEnv = (k: string) =>
  env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '') ?? '';
const supabase = createClient(getEnv('NEXT_PUBLIC_SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false }
});

// 실데이터 큰 cohort (inspect-cert-answers.ts와 동일)
const COHORT = '70a3fc72-0af0-473b-9745-0f39ecaeae9f';
const OUT = fileURLToPath(new URL('./.selection-baseline.json', import.meta.url));

async function loadCandidates(): Promise<{ candidates: CandidateRow[]; kMax: number }> {
  const { data: questions } = await supabase
    .from('application_questions')
    .select('id, question_no, section, weight, choices')
    .eq('cohort_id', COHORT);
  const c2 = questions!.find((q) => q.question_no === 'C2');
  const planQ = questions!.find((q) => q.question_no === 'Plan');
  const multiQ = questions!.find((q) => q.question_no === 'U1');
  const kMax = questions!
    .filter((q) => q.section === 'knowledge')
    .reduce((s, q) => s + Number(q.weight ?? 1), 0);
  const mMax = multiQ?.choices?.length ?? 0;

  const { data: apps } = await supabase
    .from('applications')
    .select('id, status, knowledge_score, applicants(id, name, organizations(name))')
    .eq('cohort_id', COHORT);

  const ids = [c2?.id, planQ?.id, multiQ?.id].filter(Boolean) as string[];
  const c2Map = new Map<string, string>();
  const planMap = new Map<string, string>();
  const multiMap = new Map<string, number>();
  for (let off = 0; ; off += 1000) {
    const { data: ans } = await supabase
      .from('application_answers')
      .select('application_id, question_id, answer_value')
      .in('question_id', ids)
      .range(off, off + 999);
    for (const a of ans ?? []) {
      if (a.question_id === c2?.id)
        c2Map.set(a.application_id, typeof a.answer_value === 'string' ? a.answer_value : '');
      else if (a.question_id === planQ?.id)
        planMap.set(a.application_id, typeof a.answer_value === 'string' ? a.answer_value : '');
      else if (a.question_id === multiQ?.id)
        multiMap.set(a.application_id, Array.isArray(a.answer_value) ? a.answer_value.length : 0);
    }
    if (!ans || ans.length < 1000) break;
  }

  const candidates: CandidateRow[] = (apps ?? []).map((a) => {
    const ap = a.applicants as unknown as {
      id: string;
      name: string;
      organizations: { name: string } | null;
    } | null;
    return {
      application_id: a.id,
      applicant_id: ap?.id ?? '',
      name: ap?.name ?? '?',
      organization: ap?.organizations?.name ?? null,
      category: (C2_TO_SELECTION[c2Map.get(a.id) ?? ''] ?? 'other') as SelectionCategory,
      knowledge_score: a.knowledge_score ?? 0,
      plan_char_count: (planMap.get(a.id) ?? '').replace(/\s+/g, '').length,
      plan_text: planMap.get(a.id) ?? '',
      multi_selected_count: multiMap.get(a.id) ?? 0,
      multi_choices_max: mMax,
      prereq_done_count: 0,
      prereq_max: 0,
      has_cert: null,
      current_status: a.status,
      other_applications: [],
      prior_certs: [],
      force_select: false,
      force_reason: null
    };
  });
  // 결정적 순서 보장 (DB 반환 순서 흔들림 방지)
  candidates.sort((a, b) => a.application_id.localeCompare(b.application_id));
  return { candidates, kMax };
}

// 실데이터 위에 합성 플래그를 얹은 변형 세트 — prereq 정렬·cert 필터·force 경로까지 커버
function buildVariants(base: CandidateRow[]): Record<string, CandidateRow[]> {
  const withPrereq = base.map((c, i) => ({ ...c, prereq_max: 2, prereq_done_count: i % 3 }));
  const withCert = base.map((c, i) => ({ ...c, has_cert: i % 2 === 0 }));
  const withForce = base.map((c, i) =>
    i % 37 === 0 ? { ...c, force_select: true, force_reason: '검증용' } : c
  );
  const combined = base.map((c, i) => ({
    ...c,
    prereq_max: 2,
    prereq_done_count: i % 3,
    has_cert: i % 2 === 0,
    force_select: i % 37 === 0,
    force_reason: i % 37 === 0 ? '검증용' : null
  }));
  return { base, withPrereq, withCert, withForce, combined };
}

type SweepEntry = { key: string; selected: string[] };

async function main() {
  const { candidates, kMax } = await loadCandidates();
  console.log(`후보 로드: ${candidates.length}명, knowledgeMax=${kMax}`);
  const variants = buildVariants(candidates);
  const weights = { knowledge: 50, plan: 50 };
  const ratio = { central: 5, local: 3, public_edu: 2 };

  const entries: SweepEntry[] = [];
  for (const [vName, cands] of Object.entries(variants)) {
    for (const capacity of [66, 88, 99]) {
      for (const maxPerOrg of [0, 2, 3]) {
        for (const parentCap of [0, 7]) {
          for (const flags of [false, true]) {
            // flags=true → 사전학습·자격증 미충족 제외 켬 (구 excludeNoPrereq/excludeNoCert 동시)
            const key = `${vName}|cap${capacity}|org${maxPerOrg}|parent${parentCap}|ex${flags ? 1 : 0}`;
            const selected = runOnce(cands, weights, capacity, kMax, ratio, maxPerOrg, parentCap, flags);
            entries.push({ key, selected: [...selected].toSorted() });
          }
        }
      }
    }
  }

  if (MODE === 'baseline') {
    writeFileSync(OUT, JSON.stringify(entries, null, 1));
    console.log(`baseline 저장: ${entries.length} configs → ${OUT}`);
  } else {
    const baseline: SweepEntry[] = JSON.parse(readFileSync(OUT, 'utf-8'));
    const byKey = new Map(baseline.map((e) => [e.key, e.selected]));
    let mismatch = 0;
    for (const e of entries) {
      const old = byKey.get(e.key);
      if (!old || old.length !== e.selected.length || old.some((id, i) => id !== e.selected[i])) {
        mismatch++;
        console.log(`❌ MISMATCH: ${e.key} (old ${old?.length ?? '없음'} vs new ${e.selected.length})`);
      }
    }
    if (baseline.length !== entries.length) {
      console.log(`⚠️ config 수 불일치: baseline ${baseline.length} vs now ${entries.length}`);
    }
    console.log(mismatch === 0 ? `✅ 전체 일치 (${entries.length} configs)` : `❌ 불일치 ${mismatch}건`);
    process.exit(mismatch === 0 ? 0 : 1);
  }
}

// compare(리팩터 후) 시점의 실행 어댑터 — 새 파이프라인 호출.
// 구 flags=true → runExclusions의 no_prereq·no_cert 단계와 동일해야 함.
// (cohortTrack: null → 인증자 단계 비활성. 두 필터는 변형이 prereq/cert 신호를
//  가질 때만 활성 — base·withForce 변형에선 no-op, combined에서 둘 다 작동)
function runOnce(
  cands: CandidateRow[],
  weights: { knowledge: number; plan: number },
  capacity: number,
  kMax: number,
  ratio: { central: number; local: number; public_edu: number },
  maxPerOrg: number,
  parentCap: number,
  flags: boolean
): string[] {
  const pool = flags
    ? runExclusions(cands, {
        cohortTrack: null,
        excludedCohortIds: new Set(),
        exceptions: new Set()
      }).pool
    : cands;
  const { selectedIds, decisions } = recommendByQuotas(
    pool,
    weights,
    capacity,
    kMax,
    ratio,
    maxPerOrg,
    parentCap
  );
  // 결정 사유 완전성 — 풀의 모든 후보에 decision이 있어야 함
  if (decisions.size !== pool.length) {
    throw new Error(`decision 누락: pool ${pool.length} vs decisions ${decisions.size}`);
  }
  return selectedIds;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
