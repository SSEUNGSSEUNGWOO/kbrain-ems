# 자동선발 깔때기(funnel) 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자동선발 시트를 "제외 확인 → 조건 → 결과" 3단계 깔때기로 재편하고, 인증자 제외(같은 트랙·연도 무관)를 추가하며, 배분 알고리즘은 동작을 보존한 채 후보별 결정 사유를 뱉게 만든다.

**Architecture:** `_selection-logic.ts`에 제외 파이프라인(`runExclusions`)과 결정 사유(`Decision`)를 추가하고 `recommendByQuotas`에서 제외 플래그를 제거한다(제외는 상류로 이동, 배분 결과는 동일). UI는 `selection-sheet.tsx`를 오케스트레이터로 축소하고 3개 스텝 컴포넌트로 분리한다. 리팩터 전 실데이터 config sweep의 `selectedIds`를 JSON으로 캡처해 리팩터 후 완전 일치를 검증한다.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase JS, shadcn/ui, bun. 테스트 스위트 없음 → 검증은 bun 스크립트 + `bun run build` + `bun run lint`.

**Spec:** `docs/superpowers/specs/2026-08-19-selection-funnel-redesign-design.md`

**작업 규칙 (frontend/CLAUDE.md 준수):**
- 아이콘은 `@/components/icons`의 `Icons`만. 포매팅은 `bun run format` (단일따옴표, trailing comma 없음, 2-space).
- `any` 금지. `console.log` 프로덕션 코드 금지 (scripts/는 console 허용).
- 모든 명령은 `frontend/`에서 실행.

**File Structure (최종):**

| 파일 | 역할 |
|---|---|
| `src/app/dashboard/cohorts/[cohortId]/applications/_selection-logic.ts` | (수정) 기존 + `cohortTrackFromName`·`runExclusions`·`Decision`, `recommendByQuotas` 시그니처 변경 |
| `src/app/dashboard/cohorts/[cohortId]/applications/_actions.ts` | (수정) `loadSelectionPool`이 `cohortName`·`preExcluded` 추가 반환 |
| `.../applications/_components/selection-sheet.tsx` | (재작성) 오케스트레이터 — 상태·스텝 네비·footer만 |
| `.../applications/_components/selection-funnel-step.tsx` | (신규) Step 1 깔때기 |
| `.../applications/_components/selection-config-step.tsx` | (신규) Step 2 조건 (정원·예비 + 고급 접힘) |
| `.../applications/_components/selection-result-step.tsx` | (신규) Step 3 결과 (분포 + 후보 리스트 + 사유 배지) |
| `.../applications/_components/prior-certs-chips.tsx` | (신규) `PriorCertsChips` 분리 (기존 selection-sheet에서 이동) |
| `scripts/verify-selection-refactor.ts` | (신규) 동작 보존 검증 스크립트 (baseline/compare 2모드) |
| `scripts/inspect-cert-answers.ts` | (수정) `recommendByQuotas` 새 시그니처로 콜사이트 갱신 |

**중요 — 기존 동작 보존 사항 (모든 태스크에서 지킬 것):**
- `recommendByQuotas`의 배분 규칙(강제선발 선처리 → 점진적 cap 라운드 → 쿼터/흘러내림 → 동점자 구제)은 한 줄도 바꾸지 않는다. 제외 필터 2개 제거 + 사유 기록 추가만.
- `force_select`는 인증자·사전학습·자격증 제외를 통과한다. 단 **타 기수 기선발 제외는 통과하지 못한다** (현행 `filteredCandidates`가 force 구분 없이 필터하므로 동작 보존).
- 수동 토글(`manualToggles`) 초기화 로직(DB 기존 선발 반영, 조건 변경 시 리셋)은 그대로 유지.

---

### Task 1: 리팩터 전 베이스라인 캡처

리팩터 전의 `recommendByQuotas` 출력(config sweep별 `selectedIds`)을 JSON으로 저장한다. 이 파일이 Task 4의 비교 기준이므로 **반드시 로직 수정 전에 실행**한다.

**Files:**
- Create: `frontend/scripts/verify-selection-refactor.ts`

- [ ] **Step 1: 스크립트 작성**

```ts
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

// baseline(리팩터 전) 시점의 실행 어댑터 — 구 시그니처 호출.
// Task 4에서 이 함수만 새 파이프라인 호출로 교체한다.
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
  const { selectedIds } = recommendByQuotas(
    cands,
    weights,
    capacity,
    kMax,
    ratio,
    maxPerOrg,
    flags, // excludeNoPrereq
    parentCap,
    flags // excludeNoCert
  );
  return selectedIds;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: baseline 실행**

Run: `cd frontend && bun run scripts/verify-selection-refactor.ts baseline`
Expected: `후보 로드: NNN명 ...` 후 `baseline 저장: 180 configs → .../scripts/.selection-baseline.json` (5 변형 × 3 정원 × 3 cap × 2 parent × 2 flags = 180). 0 configs이거나 후보 0명이면 COHORT id·env를 확인하고 멈출 것.

- [ ] **Step 3: 커밋 (JSON은 제외)**

```bash
git add scripts/verify-selection-refactor.ts
git commit -m "test: 선발 리팩터 동작 보존 검증 스크립트 (baseline)"
```

---

### Task 2: 로직 — 트랙 판정 + `runExclusions` 추가

**Files:**
- Modify: `frontend/src/app/dashboard/cohorts/[cohortId]/applications/_selection-logic.ts` (기존 코드 뒤, `scoreAll` 앞에 추가)

- [ ] **Step 1: 타입·함수 추가**

`PARENT_ORG_OVERRIDES`/`parentOrgKey` 블록 바로 아래에 추가:

```ts
// =============================================================
// 깔때기 제외 파이프라인 (Step 1) — 하드 규칙. 노브가 아니라 항상 적용.
// 예외(exceptions)에 담긴 application_id는 모든 규칙을 통과한다.
// =============================================================

export type CohortTrack = 'green' | 'blue' | null;

/** 기수명으로 트랙 판정 — certification/page.tsx와 동일 규칙 */
export function cohortTrackFromName(name: string | null | undefined): CohortTrack {
  if (!name) return null;
  if (name.includes('그린')) return 'green';
  if (name.includes('블루')) return 'blue';
  return null;
}

export type ExclusionStageKey = 'certified' | 'other_cohort' | 'no_prereq' | 'no_cert';

export type ExclusionStage = {
  key: ExclusionStageKey;
  label: string;
  excluded: CandidateRow[];
};

export type ExclusionContext = {
  cohortTrack: CohortTrack;
  /** 이 cohort들에서 status='selected'인 지원자를 제외 (현행 동작 유지) */
  excludedCohortIds: Set<string>;
  /** 예외 허용된 application_id — 모든 제외 규칙 통과 */
  exceptions: Set<string>;
};

/**
 * 제외 단계를 순서대로 적용해 선발 대상 풀과 단계별 제외 명단을 반환.
 * 한 사람은 첫 번째로 걸린 단계에만 잡힌다 (깔때기 시맨틱).
 *
 * force_select는 인증자·사전학습·자격증 제외를 통과하지만
 * 타 기수 기선발 제외는 통과하지 못한다 — 기존 filteredCandidates가
 * force 구분 없이 필터했으므로 동작 보존.
 */
export function runExclusions(
  candidates: CandidateRow[],
  ctx: ExclusionContext
): { pool: CandidateRow[]; stages: ExclusionStage[] } {
  const hasPrereq = candidates.some((c) => c.prereq_max > 0);
  const hasCertQ = candidates.some((c) => c.has_cert !== null);

  const stages: ExclusionStage[] = [];
  if (ctx.cohortTrack) {
    stages.push({
      key: 'certified',
      label: `인증자 제외 (${ctx.cohortTrack === 'green' ? '그린' : '블루'} 트랙 · 연도 무관)`,
      excluded: []
    });
  }
  stages.push({ key: 'other_cohort', label: '타 기수 기선발 제외', excluded: [] });
  if (hasPrereq) {
    stages.push({ key: 'no_prereq', label: '사전학습 미이수 제외', excluded: [] });
  }
  if (hasCertQ) {
    stages.push({ key: 'no_cert', label: '자격증 미보유 제외', excluded: [] });
  }

  const hit = (key: ExclusionStageKey, c: CandidateRow): boolean => {
    switch (key) {
      case 'certified':
        return !c.force_select && c.prior_certs.some((p) => p.track === ctx.cohortTrack);
      case 'other_cohort':
        return c.other_applications.some(
          (o) => o.status === 'selected' && ctx.excludedCohortIds.has(o.cohort_id)
        );
      case 'no_prereq':
        return !c.force_select && c.prereq_done_count < c.prereq_max;
      case 'no_cert':
        return !c.force_select && c.has_cert !== true;
    }
  };

  const pool: CandidateRow[] = [];
  for (const c of candidates) {
    if (ctx.exceptions.has(c.application_id)) {
      pool.push(c);
      continue;
    }
    const stage = stages.find((s) => hit(s.key, c));
    if (stage) stage.excluded.push(c);
    else pool.push(c);
  }
  return { pool, stages };
}
```

- [ ] **Step 2: 타입 검사**

Run: `cd frontend && bunx tsc --noEmit 2>&1 | head -20`
Expected: 이 태스크로 인한 신규 에러 없음 (기존 에러가 있다면 파일·줄 번호로 신규 여부 구분).

- [ ] **Step 3: 커밋**

```bash
git add "src/app/dashboard/cohorts/[cohortId]/applications/_selection-logic.ts"
git commit -m "feat: 선발 제외 파이프라인 runExclusions — 인증자(같은 트랙) 제외 포함"
```

---

### Task 3: 로직 — `recommendByQuotas` 시그니처 변경 + 결정 사유

제외 플래그 2개(`excludeNoPrereq`, `excludeNoCert`)를 제거하고(상류 `runExclusions`로 이동), 후보별 `Decision`을 함께 반환한다. **배분 규칙 자체는 불변.**

**Files:**
- Modify: `frontend/src/app/dashboard/cohorts/[cohortId]/applications/_selection-logic.ts`

- [ ] **Step 1: `Decision` 타입 추가** (`runExclusions` 블록 아래)

```ts
// 배분 결과의 후보별 결정 사유 — Step 3 사유 배지·감사 자료용
export type Decision =
  | { kind: 'selected'; via: 'force' | 'quota' | 'overflow' | 'tie' }
  | { kind: 'rejected'; why: 'org_cap' | 'parent_cap' | 'score_cut'; cutoff?: number };

export const DECISION_LABEL: Record<string, string> = {
  force: '강제선발',
  quota: '쿼터 선발',
  overflow: '흘러내림 선발',
  tie: '동점자 선발',
  org_cap: '기관 cap 초과',
  parent_cap: '상위부처 cap 초과',
  score_cut: '점수 미달'
};
```

- [ ] **Step 2: 함수 교체**

기존 `recommendByQuotas` 전체(주석 포함, `export function recommendByQuotas` ~ 닫는 `}`)를 아래로 교체. 기존과의 차이는 ① 파라미터에서 `excludeNoPrereq`·`excludeNoCert` 제거와 도입부 filter 2개 삭제, ② `decisions` 기록 추가뿐이다. 배분 루프 구조·순서는 그대로.

```ts
/**
 * 카테고리별 쿼터 + 사전학습 단계 + 단방향 흘러내림 + **점진적 기관 cap**.
 * 제외(인증자·사전학습·자격증 등)는 상류 runExclusions에서 이미 끝났다고 가정 —
 * 이 함수는 배분과 결정 사유 기록만 담당한다.
 *
 * 정렬 키 (cohort에 prereq가 있는 경우):
 *  1) prereq_done_count desc (2개수료 > 1개 > 0)
 *  2) 종합점수(원점수) desc
 *  3) 지식점수 desc
 *  4) 정성평가 글자수 desc
 *
 * **점진적 cap 라운드** (maxPerOrg > 0인 경우):
 *  round 1: cap=1 → 풀 얕은 기관까지 1자리 보장
 *  round 2: cap=2 → 잔여 쿼터를 풀 깊은 기관에서 추가 충원
 *  ... round maxPerOrg까지 누적, 정원 차면 조기 종료.
 * maxPerOrg=0(무제한)이면 라운드 1회 cap=∞.
 *
 * 라운드 내부: Phase 1 카테고리 쿼터 채움 → Phase 2 단방향 흘러내림.
 * 종료 후 Phase 3 동점자 구제 (cap은 hard limit 유지).
 *
 * 미선발 사유는 종료 시점 상태로 사후 판정: 기관 cap 소진 → org_cap,
 * 상위부처 cap 소진 → parent_cap, 그 외 → score_cut (카테고리 컷 점수 첨부).
 */
export function recommendByQuotas(
  candidates: CandidateRow[],
  weights: ScoreWeights,
  totalCapacity: number,
  knowledgeMax: number,
  ratio: QuotaRatio,
  maxPerOrg: number = 0,
  parentOrgCap: number = 0 // 상위부처(공백 prefix) 절대 인원수, 0=비활성
): { selectedIds: string[]; scored: ScoredCandidate[]; decisions: Map<string, Decision> } {
  const hasPrereq = candidates.some((c) => c.prereq_max > 0);

  const scored = scoreAll(candidates, weights, knowledgeMax).toSorted((a, b) => {
    if (hasPrereq && b.prereq_done_count !== a.prereq_done_count) {
      return b.prereq_done_count - a.prereq_done_count;
    }
    if (b.final_score !== a.final_score) return b.final_score - a.final_score;
    if (b.knowledge_score !== a.knowledge_score) return b.knowledge_score - a.knowledge_score;
    return b.plan_char_count - a.plan_char_count;
  });

  const quotas = computeQuotas(Math.max(0, totalCapacity), ratio);
  const pCap = parentOrgCap > 0 ? parentOrgCap : Number.POSITIVE_INFINITY;
  const orgCount = new Map<string, number>();
  const parentCount = new Map<string, number>();
  const selectedSet = new Set<string>();
  const selectedIds: string[] = [];
  const decisions = new Map<string, Decision>();

  // 강제선발 대상 우선 통과 — 카테고리 쿼터·기관 cap·상위부처 cap 모두 무시.
  // 정원(totalCapacity)에서는 자리 차지 (일반 후보용 잔여 정원 감소).
  for (const c of scored) {
    if (!c.force_select) continue;
    const orgKey = c.organization ?? '';
    const parent = parentOrgKey(c.organization);
    if (orgKey) orgCount.set(orgKey, (orgCount.get(orgKey) ?? 0) + 1);
    if (parent) parentCount.set(parent, (parentCount.get(parent) ?? 0) + 1);
    selectedSet.add(c.application_id);
    selectedIds.push(c.application_id);
    decisions.set(c.application_id, { kind: 'selected', via: 'force' });
    if (quotas[c.category] > 0) quotas[c.category]--;
  }

  const capUnlimited = maxPerOrg <= 0;
  const maxRound = capUnlimited ? 1 : maxPerOrg;

  for (let round = 1; round <= maxRound; round++) {
    if (selectedIds.length >= totalCapacity) break;
    const roundCap = capUnlimited ? Number.POSITIVE_INFINITY : round;

    const tryAdd = (c: ScoredCandidate, via: 'quota' | 'overflow'): boolean => {
      if (selectedSet.has(c.application_id)) return false;
      const orgKey = c.organization ?? '';
      const parent = parentOrgKey(c.organization);
      if (orgKey) {
        const used = orgCount.get(orgKey) ?? 0;
        if (used >= roundCap) return false;
      }
      if (parent) {
        const pused = parentCount.get(parent) ?? 0;
        if (pused >= pCap) return false;
      }
      if (orgKey) orgCount.set(orgKey, (orgCount.get(orgKey) ?? 0) + 1);
      if (parent) parentCount.set(parent, (parentCount.get(parent) ?? 0) + 1);
      selectedSet.add(c.application_id);
      selectedIds.push(c.application_id);
      decisions.set(c.application_id, { kind: 'selected', via });
      return true;
    };

    // Phase 1: 카테고리별 잔여 쿼터 채우기 (이번 라운드 cap 한도 내)
    for (const cat of SELECTION_CATEGORY_ORDER) {
      if (quotas[cat] === 0) continue;
      for (const c of scored) {
        if (quotas[cat] === 0) break;
        if (c.category !== cat) continue;
        if (tryAdd(c, 'quota')) quotas[cat]--;
      }
    }

    // Phase 2: 단방향 흘러내림 — sourceCat의 남은 쿼터를 우선순위 순으로 보충.
    for (let i = 0; i < SELECTION_CATEGORY_ORDER.length; i++) {
      const sourceCat = SELECTION_CATEGORY_ORDER[i];
      if (quotas[sourceCat] === 0) continue;
      for (let j = i + 1; j < SELECTION_CATEGORY_ORDER.length; j++) {
        const targetCat = SELECTION_CATEGORY_ORDER[j];
        if (quotas[sourceCat] === 0) break;
        for (const c of scored) {
          if (quotas[sourceCat] === 0) break;
          if (c.category !== targetCat) continue;
          if (tryAdd(c, 'overflow')) quotas[sourceCat]--;
        }
      }
    }
  }

  const finalCap = capUnlimited ? Number.POSITIVE_INFINITY : maxPerOrg;

  // Phase 3: 커트라인 동점자 포함 — 기관 cap·상위부처 cap은 동점자라도 hard limit.
  const tieKey = (c: ScoredCandidate) =>
    `${c.prereq_done_count}|${c.final_score}|${c.knowledge_score}|${c.plan_char_count}`;
  const cutoffByCategory = new Map<SelectionCategory, string>();
  const cutoffScoreByCategory = new Map<SelectionCategory, number>();
  for (const c of scored) {
    if (!selectedSet.has(c.application_id)) continue;
    cutoffByCategory.set(c.category, tieKey(c));
    cutoffScoreByCategory.set(c.category, c.final_score);
  }
  for (const c of scored) {
    if (selectedSet.has(c.application_id)) continue;
    const cutoff = cutoffByCategory.get(c.category);
    if (!cutoff || cutoff !== tieKey(c)) continue;
    const orgKey = c.organization ?? '';
    const parent = parentOrgKey(c.organization);
    if (orgKey && (orgCount.get(orgKey) ?? 0) >= finalCap) continue;
    if (parent && (parentCount.get(parent) ?? 0) >= pCap) continue;
    if (orgKey) orgCount.set(orgKey, (orgCount.get(orgKey) ?? 0) + 1);
    if (parent) parentCount.set(parent, (parentCount.get(parent) ?? 0) + 1);
    selectedSet.add(c.application_id);
    selectedIds.push(c.application_id);
    decisions.set(c.application_id, { kind: 'selected', via: 'tie' });
    cutoffScoreByCategory.set(c.category, c.final_score);
  }

  // 미선발 사유 사후 판정
  for (const c of scored) {
    if (selectedSet.has(c.application_id)) continue;
    const orgKey = c.organization ?? '';
    const parent = parentOrgKey(c.organization);
    if (orgKey && (orgCount.get(orgKey) ?? 0) >= finalCap) {
      decisions.set(c.application_id, { kind: 'rejected', why: 'org_cap' });
    } else if (parent && (parentCount.get(parent) ?? 0) >= pCap) {
      decisions.set(c.application_id, { kind: 'rejected', why: 'parent_cap' });
    } else {
      decisions.set(c.application_id, {
        kind: 'rejected',
        why: 'score_cut',
        cutoff: cutoffScoreByCategory.get(c.category)
      });
    }
  }

  return { selectedIds, scored, decisions };
}
```

- [ ] **Step 3: `SelectionConfigSnapshot` 타입 갱신**

기존 타입 정의를 아래로 교체. (`parentOrgCapPct`는 선언만 있고 실제 저장 키는 `parentOrgCap`이었다 — 읽는 쪽 `applications-export.ts`도 `parentOrgCap`을 읽으므로 타입을 실제에 맞춘다.)

```ts
// 자동선발 '적용' 시점에 cohorts.selection_config jsonb에 저장되는 스냅샷.
export type SelectionConfigSnapshot = {
  weights: ScoreWeights;
  quotaRatio: QuotaRatio;
  maxPerOrg: number; // 0 = 무제한
  /** 하드 규칙화됨 — 항상 true로 기록 (구 스냅샷 하위호환용 필드 유지) */
  excludeNoPrereq: boolean;
  excludeNoCert: boolean;
  totalCapacity: number; // 사용자가 입력한 정원
  withReserve: boolean; // 110% 예비 적용 여부
  effectiveCapacity: number; // withReserve 적용 후 실제 사용된 정원
  parentOrgCap?: number; // 상위부처(공백 prefix) 캡, 절대 인원수 — 미설정/0=비활성
  excludedCohortIds?: string[]; // 이 cohort들의 selected 신청자는 제외
  exclusionCounts?: Partial<Record<ExclusionStageKey, number>>; // 깔때기 단계별 제외 인원
  exceptions?: string[]; // 예외 허용된 application_id
  appliedAt: string; // ISO timestamp
};
```

- [ ] **Step 4: 타입 검사 — 예상되는 콜사이트 에러 확인**

Run: `cd frontend && bunx tsc --noEmit 2>&1 | grep -E "selection-sheet|inspect-cert|verify-selection" | head`
Expected: `selection-sheet.tsx`(구 9-인자 호출), `scripts/inspect-cert-answers.ts`, `scripts/verify-selection-refactor.ts`에서 인자 개수 에러. **이 시점에서는 정상** — Task 4·8·9에서 순서대로 고친다. `_selection-logic.ts` 자체의 에러는 없어야 한다.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/dashboard/cohorts/[cohortId]/applications/_selection-logic.ts"
git commit -m "feat: recommendByQuotas 결정 사유 반환 + 제외 플래그 상류 이동"
```

---

### Task 4: 동작 보존 검증 (compare)

**Files:**
- Modify: `frontend/scripts/verify-selection-refactor.ts` (`runOnce`만 교체)

- [ ] **Step 1: `runOnce`를 새 파이프라인으로 교체**

import에 `runExclusions` 추가:

```ts
import {
  recommendByQuotas,
  runExclusions,
  C2_TO_SELECTION,
  type CandidateRow,
  type SelectionCategory
} from '../src/app/dashboard/cohorts/[cohortId]/applications/_selection-logic';
```

`runOnce` 함수 본문 교체:

```ts
// compare(리팩터 후) 시점의 실행 어댑터 — 새 파이프라인 호출.
// 구 flags=true → runExclusions의 no_prereq·no_cert 단계와 동일해야 함.
// (cohortTrack: null → 인증자 단계 비활성, 나머지 조건 없음 → 두 필터만 작동)
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
```

- [ ] **Step 2: compare 실행**

Run: `cd frontend && bun run scripts/verify-selection-refactor.ts compare`
Expected: `✅ 전체 일치 (180 configs)` + exit 0. **불일치가 나오면 Task 2·3의 필터·배분 코드를 원본과 diff해 원인을 찾을 것 — baseline을 다시 뜨는 것으로 덮지 말 것** (이미 로직이 바뀐 뒤의 baseline은 무의미).

- [ ] **Step 3: 커밋**

```bash
git add scripts/verify-selection-refactor.ts
git commit -m "test: 선발 리팩터 compare 모드 — 180 configs 완전 일치 확인"
```

---

### Task 5: `_actions.ts` — 풀 로드에 기수명·사전제외 명단 추가

**Files:**
- Modify: `frontend/src/app/dashboard/cohorts/[cohortId]/applications/_actions.ts`

- [ ] **Step 1: import 추가**

기존 `import { isSelectionExcluded } from '@/lib/applicant-exclusion';` 를 다음으로 교체:

```ts
import { isSelectionExcluded, exclusionBadge, EXCLUSION_LABEL } from '@/lib/applicant-exclusion';
```

- [ ] **Step 2: `loadSelectionPool` 반환 타입 확장**

시그니처 교체:

```ts
export async function loadSelectionPool(cohortId: string): Promise<{
  error?: string;
  candidates?: CandidateRow[];
  knowledgeMax?: number;
  cohortName?: string | null;
  /** 서버에서 걸러진 지원자 (테스트·내부, 대상 아님, 중복) — 깔때기 표시용 */
  preExcluded?: { name: string; reason: string }[];
}> {
```

- [ ] **Step 3: cohort meta 조회에 name 추가**

기존:
```ts
    const { data: cohortMeta } = await supabase
      .from('cohorts')
      .select('prereq_course_codes')
      .eq('id', cohortId)
      .maybeSingle();
    const prereqCodes: string[] =
      (cohortMeta as { prereq_course_codes: string[] | null } | null)?.prereq_course_codes ?? [];
```
교체:
```ts
    const { data: cohortMeta } = await supabase
      .from('cohorts')
      .select('prereq_course_codes, name')
      .eq('id', cohortId)
      .maybeSingle();
    const cohortMetaTyped = cohortMeta as {
      prereq_course_codes: string[] | null;
      name: string | null;
    } | null;
    const prereqCodes: string[] = cohortMetaTyped?.prereq_course_codes ?? [];
    const cohortName = cohortMetaTyped?.name ?? null;
```

- [ ] **Step 4: preExcluded 수집 + 반환**

기존 `eligibleApps` 정의 직후에 추가:

```ts
    const preExcluded = (apps ?? [])
      .filter((a) => a.applicants && isSelectionExcluded(a.applicants))
      .map((a) => ({
        name: a.applicants?.name ?? '(이름 없음)',
        reason: EXCLUSION_LABEL[exclusionBadge(a.applicants ?? {}) ?? 'test']
      }));
```

기존 `return { candidates, knowledgeMax };` 를 다음으로 교체:

```ts
    return { candidates, knowledgeMax, cohortName, preExcluded };
```

- [ ] **Step 5: 타입 검사 + 커밋**

Run: `cd frontend && bunx tsc --noEmit 2>&1 | grep _actions` → 에러 없음 확인.

```bash
git add "src/app/dashboard/cohorts/[cohortId]/applications/_actions.ts"
git commit -m "feat: loadSelectionPool에 기수명·사전제외 명단 반환 추가"
```

---

### Task 6: `PriorCertsChips` 분리

**Files:**
- Create: `frontend/src/app/dashboard/cohorts/[cohortId]/applications/_components/prior-certs-chips.tsx`
- (selection-sheet.tsx에서의 제거는 Task 8 재작성에 포함)

- [ ] **Step 1: 파일 생성** — 기존 selection-sheet.tsx 962~1052행의 상수·함수를 그대로 이동:

```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { PriorCert } from '../_selection-logic';

const TRACK_LETTER: Record<PriorCert['track'], string> = {
  green: 'G',
  blue: 'B',
  expert: 'E',
  continuing: 'C'
};

const TRACK_LABEL: Record<PriorCert['track'], string> = {
  green: '그린',
  blue: '블루',
  expert: '전문인재',
  continuing: '보수교육'
};

const TRACK_TONE: Record<PriorCert['track'], string> = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  expert: 'bg-violet-50 text-violet-700 border-violet-200',
  continuing: 'bg-slate-100 text-slate-600 border-slate-300'
};

const EVENT_LETTER: Record<NonNullable<PriorCert['event']>, string> = {
  hackathon: 'H',
  miniproject: 'M',
  private: 'P'
};

const EVENT_LABEL: Record<NonNullable<PriorCert['event']>, string> = {
  hackathon: '해커톤',
  miniproject: '미니프로젝트',
  private: '민간협업'
};

function certShort(c: PriorCert): string {
  const t = TRACK_LETTER[c.track] ?? '?';
  const r = c.round ? String(c.round) : '';
  const e = c.event ? EVENT_LETTER[c.event] : '';
  return `${t}${r}${e}`;
}

function certFull(c: PriorCert): string {
  const parts = [`${c.year}`, TRACK_LABEL[c.track] ?? c.track];
  if (c.round) parts.push(`${c.round}회차`);
  if (c.event) parts.push(EVENT_LABEL[c.event]);
  if (c.kind) parts.push(`(${c.kind})`);
  return parts.join(' ');
}

export function PriorCertsChips({ certs }: { certs: PriorCert[] }) {
  if (!certs || certs.length === 0) {
    return <span className='text-muted-foreground'>—</span>;
  }
  // 트랙·회차 순으로 정렬해 일관된 노출
  const sorted = [...certs].toSorted((a, b) => {
    if (a.track !== b.track) return a.track.localeCompare(b.track);
    return (a.round ?? 0) - (b.round ?? 0);
  });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className='inline-flex flex-wrap items-center justify-center gap-0.5'
          onClick={(e) => e.preventDefault()}
        >
          {sorted.map((c) => (
            <span
              key={c.cert_no}
              className={cn(
                'inline-flex items-center rounded border px-1 py-px text-[10px] font-semibold leading-tight tabular-nums',
                TRACK_TONE[c.track]
              )}
            >
              {certShort(c)}
            </span>
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent side='top' className='max-w-xs'>
        <div className='flex flex-col gap-0.5 text-xs'>
          <div className='mb-0.5 font-semibold opacity-90'>인증 이력</div>
          {sorted.map((c) => (
            <div key={c.cert_no}>
              {certFull(c)}
              <span className='ml-1 opacity-60'>· {c.cert_no}</span>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
```

- [ ] **Step 2: 커밋** (이 시점엔 selection-sheet와 중복 정의가 공존하지만 서로 import하지 않으므로 빌드 무해)

```bash
git add "src/app/dashboard/cohorts/[cohortId]/applications/_components/prior-certs-chips.tsx"
git commit -m "refactor: PriorCertsChips 컴포넌트 분리"
```

---

### Task 7: 스텝 컴포넌트 3개 작성

**Files:**
- Create: `.../applications/_components/selection-funnel-step.tsx`
- Create: `.../applications/_components/selection-config-step.tsx`
- Create: `.../applications/_components/selection-result-step.tsx`

- [ ] **Step 1: `selection-funnel-step.tsx` 작성**

```tsx
'use client';

import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Icons } from '@/components/icons';
import type { ExclusionStage } from '../_selection-logic';

type Props = {
  totalApplicants: number; // 서버 사전제외 포함 전체 지원자 수
  preExcluded: { name: string; reason: string }[];
  stages: ExclusionStage[];
  poolCount: number;
  exceptions: Set<string>;
  onToggleException: (applicationId: string) => void;
  availableExclusionCohorts: { id: string; name: string }[];
  excludedCohortIds: Set<string>;
  onToggleExclusionCohort: (id: string) => void;
};

/**
 * Step 1 — 깔때기: 하드 제외 규칙을 위에서 아래로 통과시키며
 * 단계마다 "−몇 명 → 몇 명"을 보여준다. 행을 펼치면 빠진 사람 명단과
 * 개별 "예외 허용" 체크가 나온다 (예외는 모든 규칙 통과).
 */
export function SelectionFunnelStep({
  totalApplicants,
  preExcluded,
  stages,
  poolCount,
  exceptions,
  onToggleException,
  availableExclusionCohorts,
  excludedCohortIds,
  onToggleExclusionCohort
}: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  // 위에서부터의 누적 잔여 인원
  let running = totalApplicants - preExcluded.length;
  const rows = stages.map((s) => {
    const after = running - s.excluded.length;
    const row = { stage: s, before: running, after };
    running = after;
    return row;
  });

  return (
    <div className='flex flex-col gap-1 rounded-md border p-3'>
      <div className='flex items-baseline gap-2 pb-2'>
        <span className='text-sm font-medium'>지원자</span>
        <span className='text-lg font-semibold tabular-nums'>{totalApplicants}명</span>
        <span className='text-muted-foreground text-xs'>
          — 아래 규칙을 순서대로 통과한 사람이 선발 대상 풀이 됩니다
        </span>
      </div>

      {preExcluded.length > 0 && (
        <FunnelRow
          label='테스트·대상아님 제외'
          hint='서버에서 자동 적용 (excluded_reason) — 예외 불가'
          minus={preExcluded.length}
          after={totalApplicants - preExcluded.length}
          open={openKey === 'pre'}
          onToggleOpen={() => setOpenKey((k) => (k === 'pre' ? null : 'pre'))}
        >
          <ul className='flex flex-col gap-0.5 text-xs'>
            {preExcluded.map((p, i) => (
              <li key={`${p.name}-${i}`} className='text-muted-foreground'>
                {p.name} <span className='opacity-60'>· {p.reason}</span>
              </li>
            ))}
          </ul>
        </FunnelRow>
      )}

      {rows.map(({ stage, after }) => (
        <FunnelRow
          key={stage.key}
          label={stage.label}
          minus={stage.excluded.length}
          after={after}
          open={openKey === stage.key}
          onToggleOpen={() => setOpenKey((k) => (k === stage.key ? null : stage.key))}
        >
          {stage.key === 'other_cohort' && (
            <div className='mb-2 flex flex-col gap-1 border-b pb-2'>
              <div className='text-muted-foreground text-xs font-medium'>
                제외할 기수 선택 — 체크한 기수에서 이미 선발된 지원자가 빠집니다
              </div>
              {availableExclusionCohorts.length === 0 ? (
                <div className='text-muted-foreground text-xs italic'>
                  중복 지원자가 있는 다른 기수가 없습니다.
                </div>
              ) : (
                availableExclusionCohorts.map((c) => (
                  <label key={c.id} className='flex cursor-pointer items-center gap-2 text-xs'>
                    <Checkbox
                      checked={excludedCohortIds.has(c.id)}
                      onCheckedChange={() => onToggleExclusionCohort(c.id)}
                    />
                    <span>{c.name}</span>
                  </label>
                ))
              )}
            </div>
          )}
          {stage.excluded.length === 0 ? (
            <div className='text-muted-foreground text-xs italic'>이 단계에서 빠진 사람 없음</div>
          ) : (
            <ul className='flex max-h-48 flex-col gap-0.5 overflow-y-auto text-xs'>
              {stage.excluded.map((c) => (
                <li key={c.application_id} className='flex items-center gap-2'>
                  <Checkbox
                    checked={exceptions.has(c.application_id)}
                    onCheckedChange={() => onToggleException(c.application_id)}
                  />
                  <span className='font-medium'>{c.name}</span>
                  <span className='text-muted-foreground truncate'>{c.organization ?? '—'}</span>
                  <span className='text-muted-foreground ml-auto shrink-0 opacity-70'>
                    예외 허용
                  </span>
                </li>
              ))}
            </ul>
          )}
        </FunnelRow>
      ))}

      <div className='mt-1 flex items-baseline gap-2 border-t pt-2'>
        <span className='text-sm font-medium text-emerald-700'>선발 대상 풀</span>
        <span className='text-lg font-semibold tabular-nums text-emerald-700'>{poolCount}명</span>
        {exceptions.size > 0 && (
          <span className='text-xs text-amber-700'>예외 허용 {exceptions.size}명 포함</span>
        )}
      </div>
    </div>
  );
}

function FunnelRow({
  label,
  hint,
  minus,
  after,
  open,
  onToggleOpen,
  children
}: {
  label: string;
  hint?: string;
  minus: number;
  after: number;
  open: boolean;
  onToggleOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className='rounded border'>
      <button
        type='button'
        onClick={onToggleOpen}
        className='hover:bg-muted/40 flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm'
      >
        <Icons.chevronRight
          className={cn('text-muted-foreground size-3.5 transition-transform', open && 'rotate-90')}
        />
        <span>{label}</span>
        {hint && <span className='text-muted-foreground hidden text-[11px] sm:inline'>{hint}</span>}
        <span
          className={cn(
            'ml-auto tabular-nums',
            minus > 0 ? 'font-medium text-rose-600' : 'text-muted-foreground'
          )}
        >
          −{minus}
        </span>
        <span className='text-muted-foreground w-16 text-right tabular-nums'>→ {after}명</span>
      </button>
      {open && <div className='border-t px-3 py-2'>{children}</div>}
    </div>
  );
}
```

주의: `Icons.chevronRight`가 `src/components/icons/index.tsx`에 없으면 등록할 것 (`@tabler/icons-react`의 `IconChevronRight`를 `Icons` 객체에 추가 — 직접 import 금지 규칙 준수).

- [ ] **Step 2: `selection-config-step.tsx` 작성**

```tsx
'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { QuotaRatio, ScoreWeights } from '../_selection-logic';

type Props = {
  poolSize: number;
  totalCapacity: number;
  onTotalChange: (v: number) => void;
  withReserve: boolean;
  onWithReserveChange: (v: boolean) => void;
  effectiveCapacity: number;
  weights: ScoreWeights;
  onWeightChange: (key: keyof ScoreWeights, value: number) => void;
  quotaRatio: QuotaRatio;
  onQuotaChange: (key: keyof QuotaRatio, value: number) => void;
  maxPerOrg: number;
  onMaxPerOrgChange: (v: number) => void;
  parentOrgCapInput: number;
  onParentOrgCapInputChange: (v: number) => void;
};

/** Step 2 — 선발 조건. 평소엔 정원·예비만, 나머지는 고급 설정 접힘 안에. */
export function SelectionConfigStep(p: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const wSum = p.weights.knowledge + p.weights.plan;
  const rSum = p.quotaRatio.central + p.quotaRatio.local + p.quotaRatio.public_edu;

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-col gap-3 rounded-md border p-3'>
        <div className='flex items-center gap-3'>
          <label htmlFor='total-capacity' className='text-sm font-medium'>
            총 정원
          </label>
          <Input
            id='total-capacity'
            type='number'
            value={p.totalCapacity}
            onChange={(e) => p.onTotalChange(Number(e.target.value) || 0)}
            className='h-8 w-24 tabular-nums'
          />
          <label
            htmlFor='with-reserve'
            className='flex cursor-pointer items-center gap-1.5 text-sm'
            title='정원의 110%를 선발 (예비합격자 포함)'
          >
            <Checkbox
              id='with-reserve'
              checked={p.withReserve}
              onCheckedChange={(v) => p.onWithReserveChange(v === true)}
            />
            <span>110% 선발</span>
            {p.withReserve && p.effectiveCapacity !== p.totalCapacity && (
              <span className='text-muted-foreground tabular-nums'>
                ({p.effectiveCapacity}명)
              </span>
            )}
          </label>
          <span className='text-muted-foreground ml-auto text-xs'>
            선발 대상 풀 {p.poolSize}명
          </span>
        </div>
      </div>

      <div className='rounded-md border'>
        <button
          type='button'
          onClick={() => setAdvancedOpen((v) => !v)}
          className='hover:bg-muted/40 flex w-full items-center gap-2 px-3 py-2 text-left text-sm'
        >
          <Icons.chevronRight
            className={cn(
              'text-muted-foreground size-3.5 transition-transform',
              advancedOpen && 'rotate-90'
            )}
          />
          <span className='font-medium'>고급 설정</span>
          <span className='text-muted-foreground text-xs'>
            가중치 {p.weights.knowledge}:{p.weights.plan} · 비율 {p.quotaRatio.central}:
            {p.quotaRatio.local}:{p.quotaRatio.public_edu} · 기관당 {p.maxPerOrg || '∞'}
            {p.parentOrgCapInput > 0 && ` · 상위부처 ${p.parentOrgCapInput}`}
          </span>
        </button>
        {advancedOpen && (
          <div className='flex flex-col gap-3 border-t p-3'>
            <div className='flex flex-col gap-1.5'>
              <div className='text-muted-foreground text-xs font-medium'>점수 가중치</div>
              <div className='grid grid-cols-2 gap-2'>
                <NumberField
                  id='w-knowledge'
                  label='시험 점수 (지식)'
                  value={p.weights.knowledge}
                  max={100}
                  onChange={(v) => p.onWeightChange('knowledge', v)}
                />
                <NumberField
                  id='w-plan'
                  label='정성평가 (체크, 글자수)'
                  value={p.weights.plan}
                  max={100}
                  onChange={(v) => p.onWeightChange('plan', v)}
                />
              </div>
              <div className='text-muted-foreground text-xs'>
                합계 {wSum} · 합이 100이 아니어도 자동 정규화됩니다.
              </div>
            </div>

            <div className='flex flex-col gap-1.5'>
              <div className='text-muted-foreground text-xs font-medium'>부처 정원 비율</div>
              <div className='grid grid-cols-3 gap-2'>
                <NumberField
                  id='r-central'
                  label='중앙부처'
                  value={p.quotaRatio.central}
                  onChange={(v) => p.onQuotaChange('central', v)}
                />
                <NumberField
                  id='r-local'
                  label='지자체 (광역+기초)'
                  value={p.quotaRatio.local}
                  onChange={(v) => p.onQuotaChange('local', v)}
                />
                <NumberField
                  id='r-public'
                  label='공공·교육'
                  value={p.quotaRatio.public_edu}
                  onChange={(v) => p.onQuotaChange('public_edu', v)}
                />
              </div>
              <div className='text-muted-foreground text-xs'>
                합계 {rSum} · 비율 기준으로 쿼터 분배 (기본 5:3:2)
              </div>
            </div>

            <div className='grid grid-cols-2 gap-2'>
              <NumberField
                id='max-per-org'
                label='기관당 최대 (0 = 무제한)'
                value={p.maxPerOrg}
                onChange={p.onMaxPerOrgChange}
              />
              <NumberField
                id='parent-org-cap'
                label='상위부처당 최대 (0 = 비활성)'
                value={p.parentOrgCapInput}
                onChange={p.onParentOrgCapInputChange}
              />
            </div>
            <div className='text-muted-foreground text-xs'>
              상위부처는 기관명 첫 공백 앞으로 그룹핑 (예: &apos;경찰청 서울특별시경찰청&apos; →
              &apos;경찰청&apos;)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  max,
  onChange
}: {
  id: string;
  label: string;
  value: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className='flex flex-col gap-1'>
      <label htmlFor={id} className='text-muted-foreground text-xs'>
        {label}
      </label>
      <Input
        id={id}
        type='number'
        value={value}
        min={0}
        max={max}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className='h-8 w-full tabular-nums'
      />
    </div>
  );
}
```

- [ ] **Step 3: `selection-result-step.tsx` 작성** — 기존 `DistributionRow`·`CandidateList`를 이동 + 사유 배지 열 추가:

```tsx
'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  type Decision,
  type ScoredCandidate,
  type SelectionCategory,
  DECISION_LABEL,
  SELECTION_CATEGORY_LABEL,
  SELECTION_CATEGORY_ORDER
} from '../_selection-logic';
import { PriorCertsChips } from './prior-certs-chips';

type Props = {
  scored: ScoredCandidate[];
  decisions: Map<string, Decision>;
  autoSelectedIds: Set<string>;
  effectiveSelectedIds: Set<string>;
  onToggle: (id: string) => void;
  totalCapacity: number; // effectiveCapacity
  filterCategory: SelectionCategory | null;
  onCategoryClick: (cat: SelectionCategory) => void;
  distribution: Record<SelectionCategory, number>;
  poolByCategory: Record<SelectionCategory, number>;
  quotas: Record<SelectionCategory, number>;
};

/** Step 3 — 결과 검토: 분포 + 후보 리스트(사유 배지) + 수동 토글 */
export function SelectionResultStep(p: Props) {
  return (
    <div className='flex flex-col gap-4'>
      <DistributionRow
        distribution={p.distribution}
        poolByCategory={p.poolByCategory}
        quotas={p.quotas}
        totalCapacity={p.totalCapacity}
        activeCategory={p.filterCategory}
        onCategoryClick={p.onCategoryClick}
      />
      <CandidateList
        scored={p.scored}
        decisions={p.decisions}
        autoSelectedIds={p.autoSelectedIds}
        effectiveSelectedIds={p.effectiveSelectedIds}
        onToggle={p.onToggle}
        totalCapacity={p.totalCapacity}
        filterCategory={p.filterCategory}
      />
    </div>
  );
}

// 분포 박스에 표시할 카테고리 — 'other'(기타)는 흘러내림에만 쓰고 UI에서 숨김
const DISPLAY_CATEGORIES: SelectionCategory[] = ['central', 'local', 'public_edu'];

function DistributionRow({
  distribution,
  poolByCategory,
  quotas,
  totalCapacity,
  activeCategory,
  onCategoryClick
}: {
  distribution: Record<SelectionCategory, number>;
  poolByCategory: Record<SelectionCategory, number>;
  quotas: Record<SelectionCategory, number>;
  totalCapacity: number;
  activeCategory: SelectionCategory | null;
  onCategoryClick: (cat: SelectionCategory) => void;
}) {
  const sum = SELECTION_CATEGORY_ORDER.reduce((s, k) => s + (distribution[k] ?? 0), 0);
  return (
    <div className='flex flex-col gap-2 rounded-md border p-3'>
      <div className='flex items-center justify-between'>
        <div className='text-xs font-medium'>분류별 선발 분포 (합격/지원 · 배정)</div>
        {activeCategory && (
          <button
            type='button'
            onClick={() => onCategoryClick(activeCategory)}
            className='text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline'
          >
            필터 해제
          </button>
        )}
      </div>
      <div className='grid grid-cols-3 gap-2 text-xs'>
        {DISPLAY_CATEGORIES.map((cat) => {
          const count = distribution[cat] ?? 0;
          const pool = poolByCategory[cat] ?? 0;
          const quota = quotas[cat] ?? 0;
          const pct = sum > 0 ? Math.round((count / sum) * 100) : 0;
          const isActive = activeCategory === cat;
          return (
            <button
              type='button'
              key={cat}
              onClick={() => onCategoryClick(cat)}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded border px-2 py-2 transition-colors',
                'hover:bg-muted/60',
                isActive && 'border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-300'
              )}
            >
              <span className='text-muted-foreground'>{SELECTION_CATEGORY_LABEL[cat]}</span>
              <span className='text-base font-semibold tabular-nums'>
                {count}
                <span className='text-muted-foreground text-xs font-normal'>/{pool}</span>
                <span className='ml-1 text-xs font-medium text-emerald-700'>{pct}%</span>
              </span>
              <span className='text-muted-foreground tabular-nums'>
                배정 {quota > 0 ? `${quota}명` : '—'}
              </span>
            </button>
          );
        })}
      </div>
      {sum !== totalCapacity && (
        <div className='text-xs text-amber-600'>
          선택 합계 {sum} · 정원 {totalCapacity} (수동 조정 또는 풀 부족으로 차이 발생)
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  applied: '신청',
  pending: '검토중',
  selected: '선발',
  rejected: '탈락',
  withdrawn: '취하'
};

function DecisionBadge({
  decision,
  isManual,
  checked
}: {
  decision: Decision | undefined;
  isManual: boolean;
  checked: boolean;
}) {
  if (isManual) {
    return (
      <span className='inline-flex items-center rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800'>
        {checked ? '수동 선발' : '수동 제외'}
      </span>
    );
  }
  if (!decision) return <span className='text-muted-foreground'>—</span>;
  if (decision.kind === 'selected') {
    return (
      <span className='inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700'>
        {DECISION_LABEL[decision.via]}
      </span>
    );
  }
  const label =
    decision.why === 'score_cut' && decision.cutoff != null
      ? `점수 미달 (컷 ${decision.cutoff.toFixed(1)})`
      : DECISION_LABEL[decision.why];
  return (
    <span className='inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600'>
      {label}
    </span>
  );
}

function CandidateList({
  scored,
  decisions,
  autoSelectedIds,
  effectiveSelectedIds,
  onToggle,
  totalCapacity,
  filterCategory
}: {
  scored: ScoredCandidate[];
  decisions: Map<string, Decision>;
  autoSelectedIds: Set<string>;
  effectiveSelectedIds: Set<string>;
  onToggle: (id: string) => void;
  totalCapacity: number;
  filterCategory: SelectionCategory | null;
}) {
  const visible = filterCategory
    ? scored.map((c, i) => ({ c, i })).filter(({ c }) => c.category === filterCategory)
    : scored.map((c, i) => ({ c, i }));
  return (
    <div className='flex flex-col rounded-md border'>
      <div className='bg-muted/40 flex items-center gap-3 border-b px-3 py-2 text-xs font-medium'>
        <span className='w-6'>#</span>
        <span className='w-6' />
        <span className='w-20'>이름</span>
        <span className='w-24 text-center'>사유</span>
        <span className='w-12 text-center'>타과정</span>
        <span className='w-20 text-center'>인증</span>
        <span className='w-20'>분류</span>
        <span className='flex-1'>소속</span>
        <span className='w-10 text-center'>사전</span>
        <span className='w-12 text-right'>지식</span>
        <span className='w-12 text-right'>체크</span>
        <span className='w-12 text-right'>글자</span>
        <span className='w-14 text-right'>종합</span>
      </div>
      <div className='max-h-[40vh] divide-y overflow-y-auto'>
        {visible.map(({ c, i }) => {
          const checked = effectiveSelectedIds.has(c.application_id);
          const wasAuto = autoSelectedIds.has(c.application_id);
          const isManual = checked !== wasAuto;
          const inCapacity = i < totalCapacity;
          return (
            <label
              key={c.application_id}
              className={cn(
                'hover:bg-muted/40 flex cursor-pointer items-center gap-3 px-3 py-2 text-sm',
                checked && 'bg-emerald-50/60',
                isManual && 'border-l-2 border-amber-400'
              )}
            >
              <span className='text-muted-foreground w-6 text-xs tabular-nums'>{i + 1}</span>
              <Checkbox checked={checked} onCheckedChange={() => onToggle(c.application_id)} />
              <span className='flex w-20 items-center gap-1 truncate font-medium'>
                <span className='truncate'>{c.name}</span>
                {c.force_select && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className='inline-flex items-center rounded bg-rose-100 px-1 py-0.5 text-[10px] font-semibold text-rose-700'>
                        강제
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side='top'>
                      강제선발 대상 ({c.force_reason ?? '지정'})
                      <br />
                      사전학습·자격증·정원 조건 무시
                    </TooltipContent>
                  </Tooltip>
                )}
              </span>
              <span className='w-24 text-center text-xs'>
                <DecisionBadge
                  decision={decisions.get(c.application_id)}
                  isManual={isManual}
                  checked={checked}
                />
              </span>
              <span className='w-12 text-center text-xs'>
                {c.other_applications.length > 0 ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type='button'
                        onClick={(e) => e.preventDefault()}
                        className='inline-flex cursor-default items-center justify-center rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700'
                      >
                        +{c.other_applications.length}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side='top' className='max-w-xs'>
                      <div className='flex flex-col gap-0.5 text-xs'>
                        <div className='mb-0.5 font-semibold opacity-90'>다른 기수 지원</div>
                        {c.other_applications.map((o) => (
                          <div key={o.cohort_id}>
                            {o.cohort_name}
                            <span className='ml-1 opacity-70'>
                              · {STATUS_LABEL[o.status] ?? o.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <span className='text-muted-foreground'>—</span>
                )}
              </span>
              <span className='w-20 text-center text-xs'>
                <PriorCertsChips certs={c.prior_certs} />
              </span>
              <span className='text-muted-foreground w-20 truncate text-xs'>
                {SELECTION_CATEGORY_LABEL[c.category]}
              </span>
              {c.organization ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className='text-muted-foreground flex-1 truncate text-xs'>
                      {c.organization}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side='top' className='max-w-md break-all'>
                    {c.organization}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <span className='text-muted-foreground flex-1 truncate text-xs'>—</span>
              )}
              <span
                className={cn(
                  'w-10 text-center text-xs font-medium tabular-nums',
                  c.prereq_max === 0
                    ? 'text-muted-foreground'
                    : c.prereq_done_count === c.prereq_max
                      ? 'text-emerald-600'
                      : c.prereq_done_count > 0
                        ? 'text-amber-600'
                        : 'text-muted-foreground'
                )}
                title={
                  c.prereq_max === 0
                    ? 'cohort에 사전학습 요구 없음'
                    : `사전학습 ${c.prereq_done_count}/${c.prereq_max} 수료`
                }
              >
                {c.prereq_max === 0 ? '—' : `${c.prereq_done_count}/${c.prereq_max}`}
              </span>
              <span className='w-12 text-right text-xs tabular-nums'>{c.knowledge_score}</span>
              <span className='w-12 text-right text-xs tabular-nums'>
                {c.multi_selected_count}
                {c.multi_choices_max > 0 && (
                  <span className='text-muted-foreground'>/{c.multi_choices_max}</span>
                )}
              </span>
              <span className='w-12 text-right text-xs tabular-nums'>{c.plan_char_count}</span>
              <span
                className={cn(
                  'w-14 text-right font-medium tabular-nums',
                  inCapacity ? 'text-emerald-700' : 'text-muted-foreground'
                )}
              >
                {c.final_score.toFixed(1)}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 커밋** (selection-sheet가 아직 옛 구조라 신규 컴포넌트는 미사용 상태 — 빌드 무해)

```bash
git add "src/app/dashboard/cohorts/[cohortId]/applications/_components/selection-funnel-step.tsx" "src/app/dashboard/cohorts/[cohortId]/applications/_components/selection-config-step.tsx" "src/app/dashboard/cohorts/[cohortId]/applications/_components/selection-result-step.tsx"
git commit -m "feat: 자동선발 3단계 스텝 컴포넌트 (깔때기·조건·결과)"
```

---

### Task 8: `selection-sheet.tsx` 오케스트레이터 재작성

**Files:**
- Modify (전체 교체): `.../applications/_components/selection-sheet.tsx`

- [ ] **Step 1: 파일 전체를 아래로 교체**

```tsx
'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { loadSelectionPool, applySelections } from '../_actions';
import {
  type CandidateRow,
  type QuotaRatio,
  type ScoreWeights,
  type SelectionCategory,
  type SelectionConfigSnapshot,
  DEFAULT_QUOTA_RATIO,
  DEFAULT_WEIGHTS,
  cohortTrackFromName,
  computeQuotas,
  distributeByCategory,
  recommendByQuotas,
  runExclusions
} from '../_selection-logic';
import { SelectionFunnelStep } from './selection-funnel-step';
import { SelectionConfigStep } from './selection-config-step';
import { SelectionResultStep } from './selection-result-step';

type Props = {
  cohortId: string;
  defaultCapacity: number;
  trigger: React.ReactNode;
};

type Stage = 'idle' | 'loading' | 'editing' | 'applying' | 'done';
type Step = 1 | 2 | 3;

const STEP_TITLES: Record<Step, string> = {
  1: '제외 확인',
  2: '선발 조건',
  3: '결과 검토'
};

export function SelectionSheet({ cohortId, defaultCapacity, trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [preExcluded, setPreExcluded] = useState<{ name: string; reason: string }[]>([]);
  const [cohortName, setCohortName] = useState<string | null>(null);
  const [knowledgeMax, setKnowledgeMax] = useState(10);
  const [weights, setWeights] = useState<ScoreWeights>(DEFAULT_WEIGHTS);
  const [quotaRatio, setQuotaRatio] = useState<QuotaRatio>(DEFAULT_QUOTA_RATIO);
  const [totalCapacity, setTotalCapacity] = useState(defaultCapacity);
  const [withReserve, setWithReserve] = useState(true);
  const [maxPerOrg, setMaxPerOrg] = useState(3);
  const [filterCategory, setFilterCategory] = useState<SelectionCategory | null>(null);
  const [excludedCohortIds, setExcludedCohortIds] = useState<Set<string>>(new Set());
  const [exceptions, setExceptions] = useState<Set<string>>(new Set());
  const [parentOrgCapInput, setParentOrgCapInput] = useState(0);
  const [manualToggles, setManualToggles] = useState<Map<string, boolean>>(new Map());
  const [rejectOthers, setRejectOthers] = useState(true);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ selectedCount?: number; rejectedCount?: number } | null>(
    null
  );

  // 110% 선발 시 실제 사용되는 정원. 부동소수점(100*1.1=110.000...01) 때문에 round.
  const effectiveCapacity = useMemo(
    () => (withReserve ? Math.round(totalCapacity * 1.1) : totalCapacity),
    [totalCapacity, withReserve]
  );

  // 시트 열림 → 풀 로드
  useEffect(() => {
    if (!open || stage !== 'idle') return;
    setStage('loading');
    setError(null);
    (async () => {
      const res = await loadSelectionPool(cohortId);
      if (res.error || !res.candidates) {
        setError(res.error ?? '풀 로드 실패');
        setStage('idle');
        return;
      }
      setCandidates(res.candidates);
      setPreExcluded(res.preExcluded ?? []);
      setCohortName(res.cohortName ?? null);
      if (res.knowledgeMax && res.knowledgeMax > 0) setKnowledgeMax(res.knowledgeMax);
      setStage('editing');
    })();
  }, [open, stage, cohortId]);

  const initializedTogglesRef = useRef(false);

  // Step 1 깔때기 — 하드 제외 규칙 적용
  const cohortTrack = useMemo(() => cohortTrackFromName(cohortName), [cohortName]);
  const { pool, stages: exclusionStages } = useMemo(
    () => runExclusions(candidates, { cohortTrack, excludedCohortIds, exceptions }),
    [candidates, cohortTrack, excludedCohortIds, exceptions]
  );

  // 다른 cohort 목록 — candidates의 other_applications에서 추출
  const availableExclusionCohorts = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of candidates) {
      for (const o of c.other_applications) {
        if (!seen.has(o.cohort_id)) seen.set(o.cohort_id, o.cohort_name);
      }
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .toSorted((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [candidates]);

  // 조건이 변하면 자동 추천 재계산 (수동 토글이 있는 사람은 그 결정을 유지)
  const { scored, autoSelectedIds, decisions } = useMemo(() => {
    if (pool.length === 0) {
      return {
        scored: [] as ReturnType<typeof recommendByQuotas>['scored'],
        autoSelectedIds: new Set<string>(),
        decisions: new Map() as ReturnType<typeof recommendByQuotas>['decisions']
      };
    }
    const res = recommendByQuotas(
      pool,
      weights,
      effectiveCapacity,
      knowledgeMax,
      quotaRatio,
      maxPerOrg,
      parentOrgCapInput
    );
    return {
      scored: res.scored,
      autoSelectedIds: new Set(res.selectedIds),
      decisions: res.decisions
    };
  }, [pool, weights, effectiveCapacity, knowledgeMax, quotaRatio, maxPerOrg, parentOrgCapInput]);

  // 이미 selected/rejected가 있는 cohort라면 시트 열릴 때 한 번만
  // manualToggles를 DB 상태로 채워 알고리즘 추천이 덮어쓰지 않게 함.
  useEffect(() => {
    if (!open) {
      initializedTogglesRef.current = false;
      return;
    }
    if (stage !== 'editing' || candidates.length === 0) return;
    if (initializedTogglesRef.current) return;
    initializedTogglesRef.current = true;

    const hasExisting = candidates.some(
      (c) => c.current_status === 'selected' || c.current_status === 'rejected'
    );
    if (!hasExisting) return;

    const next = new Map<string, boolean>();
    for (const c of candidates) {
      const inDb = c.current_status === 'selected';
      const inAuto = autoSelectedIds.has(c.application_id);
      if (inDb !== inAuto) next.set(c.application_id, inDb);
    }
    if (next.size > 0) setManualToggles(next);
  }, [open, stage, candidates, autoSelectedIds]);

  // 최종 선택 = 자동추천 ⊕ 수동토글 오버라이드
  const effectiveSelectedIds = useMemo(() => {
    const next = new Set<string>(autoSelectedIds);
    for (const [id, on] of manualToggles.entries()) {
      if (on) next.add(id);
      else next.delete(id);
    }
    return next;
  }, [autoSelectedIds, manualToggles]);

  const distribution = useMemo(
    () => distributeByCategory(scored, [...effectiveSelectedIds]),
    [scored, effectiveSelectedIds]
  );

  const quotas = useMemo(
    () => computeQuotas(effectiveCapacity, quotaRatio),
    [effectiveCapacity, quotaRatio]
  );

  const poolByCategory = useMemo(() => {
    const result: Record<SelectionCategory, number> = {
      central: 0,
      local: 0,
      public_edu: 0,
      other: 0
    };
    for (const c of pool) result[c.category]++;
    return result;
  }, [pool]);

  const reset = () => {
    setStage('idle');
    setStep(1);
    setCandidates([]);
    setPreExcluded([]);
    setCohortName(null);
    setManualToggles(new Map());
    setResult(null);
    setError(null);
    setWeights(DEFAULT_WEIGHTS);
    setQuotaRatio(DEFAULT_QUOTA_RATIO);
    setTotalCapacity(defaultCapacity);
    setWithReserve(true);
    setMaxPerOrg(3);
    setExcludedCohortIds(new Set());
    setExceptions(new Set());
    setParentOrgCapInput(0);
    setFilterCategory(null);
  };

  const resetToggles = () => setManualToggles(new Map());

  const toggle = (id: string) => {
    setManualToggles((prev) => {
      const next = new Map(prev);
      const currentAuto = autoSelectedIds.has(id);
      const currentEffective = effectiveSelectedIds.has(id);
      const desired = !currentEffective;
      if (desired === currentAuto) next.delete(id);
      else next.set(id, desired);
      return next;
    });
  };

  const onConfirm = () => {
    setStage('applying');
    setError(null);
    const exclusionCounts: SelectionConfigSnapshot['exclusionCounts'] = {};
    for (const s of exclusionStages) exclusionCounts[s.key] = s.excluded.length;
    const snapshot: SelectionConfigSnapshot = {
      weights,
      quotaRatio,
      maxPerOrg,
      excludeNoPrereq: true, // 하드 규칙화 — 항상 적용됨을 기록
      excludeNoCert: true,
      totalCapacity,
      withReserve,
      effectiveCapacity,
      parentOrgCap: parentOrgCapInput,
      excludedCohortIds: [...excludedCohortIds],
      exclusionCounts,
      exceptions: [...exceptions],
      appliedAt: new Date().toISOString()
    };
    startTransition(async () => {
      const res = await applySelections(cohortId, [...effectiveSelectedIds], rejectOthers, snapshot);
      if (res.error) {
        setError(res.error);
        setStage('editing');
        return;
      }
      setResult({ selectedCount: res.selectedCount, rejectedCount: res.rejectedCount });
      setStage('done');
      router.refresh();
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className='flex w-full max-w-5xl flex-col gap-0 overflow-hidden sm:max-w-5xl'>
        <SheetHeader className='border-b'>
          <SheetTitle>자동 선발</SheetTitle>
          <SheetDescription>
            제외 확인 → 선발 조건 → 결과 검토 3단계로 진행합니다.
          </SheetDescription>
          {(stage === 'editing' || stage === 'applying') && (
            <div className='flex items-center gap-1 pt-1'>
              {([1, 2, 3] as Step[]).map((s) => (
                <button
                  key={s}
                  type='button'
                  onClick={() => setStep(s)}
                  className={cn(
                    'rounded px-2 py-1 text-xs',
                    step === s
                      ? 'bg-foreground text-background font-medium'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {s}. {STEP_TITLES[s]}
                </button>
              ))}
            </div>
          )}
        </SheetHeader>

        <div className='flex-1 overflow-y-auto'>
          {stage === 'loading' && (
            <div className='flex flex-col items-center gap-2 py-12'>
              <Icons.spinner className='size-6 animate-spin' />
              <div className='text-sm'>풀 로드 중...</div>
            </div>
          )}

          {error && (
            <div className='text-destructive border-destructive/30 bg-destructive/5 m-4 rounded border p-3 text-sm'>
              {error}
            </div>
          )}

          {(stage === 'editing' || stage === 'applying') && (
            <div className='p-4'>
              {step === 1 && (
                <SelectionFunnelStep
                  totalApplicants={candidates.length + preExcluded.length}
                  preExcluded={preExcluded}
                  stages={exclusionStages}
                  poolCount={pool.length}
                  exceptions={exceptions}
                  onToggleException={(id) => {
                    setExceptions((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    });
                    resetToggles();
                  }}
                  availableExclusionCohorts={availableExclusionCohorts}
                  excludedCohortIds={excludedCohortIds}
                  onToggleExclusionCohort={(id) => {
                    setExcludedCohortIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    });
                    resetToggles();
                  }}
                />
              )}
              {step === 2 && (
                <SelectionConfigStep
                  poolSize={pool.length}
                  totalCapacity={totalCapacity}
                  onTotalChange={(v) => {
                    setTotalCapacity(Math.max(0, v));
                    resetToggles();
                  }}
                  withReserve={withReserve}
                  onWithReserveChange={(v) => {
                    setWithReserve(v);
                    resetToggles();
                  }}
                  effectiveCapacity={effectiveCapacity}
                  weights={weights}
                  onWeightChange={(key, value) => {
                    setWeights((prev) => ({ ...prev, [key]: Math.max(0, Math.min(100, value)) }));
                    resetToggles();
                  }}
                  quotaRatio={quotaRatio}
                  onQuotaChange={(key, value) => {
                    setQuotaRatio((prev) => ({ ...prev, [key]: Math.max(0, value) }));
                    resetToggles();
                  }}
                  maxPerOrg={maxPerOrg}
                  onMaxPerOrgChange={(v) => {
                    setMaxPerOrg(Math.max(0, v));
                    resetToggles();
                  }}
                  parentOrgCapInput={parentOrgCapInput}
                  onParentOrgCapInputChange={(v) => {
                    setParentOrgCapInput(Math.max(0, v));
                    resetToggles();
                  }}
                />
              )}
              {step === 3 && (
                <SelectionResultStep
                  scored={scored}
                  decisions={decisions}
                  autoSelectedIds={autoSelectedIds}
                  effectiveSelectedIds={effectiveSelectedIds}
                  onToggle={toggle}
                  totalCapacity={effectiveCapacity}
                  filterCategory={filterCategory}
                  onCategoryClick={(cat) =>
                    setFilterCategory((prev) => (prev === cat ? null : cat))
                  }
                  distribution={distribution}
                  poolByCategory={poolByCategory}
                  quotas={quotas}
                />
              )}
            </div>
          )}

          {stage === 'done' && result && (
            <div className='flex flex-col items-center gap-3 py-12'>
              <div className='flex items-center gap-2 font-medium text-emerald-600'>
                <Icons.check className='size-5' /> 확정 완료
              </div>
              <div className='text-sm'>
                선발 {result.selectedCount ?? 0}명
                {result.rejectedCount ? ` · 탈락 ${result.rejectedCount}명` : ''}
              </div>
            </div>
          )}
        </div>

        <SheetFooter className='border-t'>
          {stage === 'editing' && (
            <div className='flex w-full items-center justify-between gap-3'>
              {step === 3 ? (
                <div className='flex items-center gap-2 text-sm'>
                  <Checkbox
                    id='reject-others'
                    checked={rejectOthers}
                    onCheckedChange={(v) => setRejectOthers(v === true)}
                  />
                  <label htmlFor='reject-others' className='cursor-pointer'>
                    미선택자 자동 탈락
                  </label>
                </div>
              ) : (
                <span className='text-muted-foreground text-xs'>
                  선발 대상 풀 {pool.length}명 · 현재 선택 {effectiveSelectedIds.size}명
                </span>
              )}
              <div className='flex gap-2'>
                {step > 1 && (
                  <Button variant='outline' onClick={() => setStep((s) => (s - 1) as Step)}>
                    이전
                  </Button>
                )}
                {step < 3 ? (
                  <Button onClick={() => setStep((s) => (s + 1) as Step)}>다음</Button>
                ) : (
                  <>
                    <Button variant='outline' onClick={() => setOpen(false)} disabled={pending}>
                      취소
                    </Button>
                    <Button
                      onClick={onConfirm}
                      disabled={pending || effectiveSelectedIds.size === 0}
                    >
                      {effectiveSelectedIds.size}명 선발 확정
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
          {stage === 'done' && (
            <Button
              className='ml-auto'
              onClick={() => {
                setOpen(false);
                router.refresh();
              }}
            >
              완료
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: 타입 검사**

Run: `cd frontend && bunx tsc --noEmit 2>&1 | grep -v scripts | head -20`
Expected: src 쪽 에러 없음 (scripts/inspect-cert-answers.ts 에러만 남음 — Task 9에서 처리).

- [ ] **Step 3: 커밋**

```bash
git add "src/app/dashboard/cohorts/[cohortId]/applications/_components/selection-sheet.tsx"
git commit -m "feat: 자동선발 시트를 3단계 깔때기 플로우로 재구성"
```

---

### Task 9: 스크립트 콜사이트 정리

**Files:**
- Modify: `frontend/scripts/inspect-cert-answers.ts`

- [ ] **Step 1: 두 곳의 호출을 새 시그니처로 수정**

102행 부근:
```ts
      const { selectedIds } = recommendByQuotas(
        candidates, weights, capacity, kMax, ratio, cap, 0
      );
```
119행 부근:
```ts
    const { selectedIds } = recommendByQuotas(candidates, weights, 99, kMax, ratio, cap, 0);
```
(구 `false, 0, false`의 가운데 `0`이 parentOrgCap — 새 시그니처에선 7번째 인자. exclude 플래그 2개는 삭제.)

`scripts/archive/` 안의 옛 스크립트들은 수정하지 않는다 (아카이브 — 실행 시 각자 갱신).

- [ ] **Step 2: 타입 검사 + 커밋**

Run: `cd frontend && bunx tsc --noEmit 2>&1 | grep -v archive | head`
Expected: 에러 없음.

```bash
git add scripts/inspect-cert-answers.ts
git commit -m "chore: inspect-cert-answers를 recommendByQuotas 새 시그니처로 갱신"
```

---

### Task 10: 최종 검증·정리

- [ ] **Step 1: 회귀 재확인**

Run: `cd frontend && bun run scripts/verify-selection-refactor.ts compare`
Expected: `✅ 전체 일치 (180 configs)`.

- [ ] **Step 2: 포맷·린트·빌드**

```bash
cd frontend
bun run format
bun run lint          # 기존 baseline: 76 warnings / 35 errors (2026-08-19 기준). 신규 파일에서 늘어난 에러가 없어야 함
bun run build
```
Expected: build 성공. lint 에러 수가 baseline(35)보다 늘었으면 신규 파일의 에러를 수정.

- [ ] **Step 3: 수동 확인 (dev 서버)**

Run: `bun run dev` → `http://localhost:3100/dashboard/cohorts/<그린 기수 id>/applications` 에서 자동선발 시트 열기.
확인 항목:
1. Step 1에 "인증자 제외 (그린 트랙 · 연도 무관)" 행이 있고 −N이 0보다 크다 (그린 인증자 405명이 적재돼 있음).
2. 행 펼침 → 명단 표시, "예외 허용" 체크 시 풀 인원이 +1 된다.
3. Step 2 고급 설정 접힘 동작.
4. Step 3 사유 배지 표시 (쿼터 선발/흘러내림/점수 미달 등), 수동 토글 시 "수동 선발/수동 제외"로 바뀜.
5. 블루 기수에서는 "(블루 트랙)"으로, 그린·블루가 아닌 기수(전문인재 등)에서는 인증자 행이 없음.
6. **적용은 실데이터를 바꾸므로 실행하지 말 것** — 확정 버튼 직전까지만 확인.

- [ ] **Step 4: baseline 파일 삭제 + 마무리 커밋**

```bash
rm scripts/.selection-baseline.json
git status   # 의도치 않은 파일 없는지 확인
git add -A "src/app/dashboard/cohorts/[cohortId]/applications" scripts/
git commit -m "style: oxfmt 포매팅 적용 (선발 깔때기 재설계 마무리)"
```
(포맷 변경이 없으면 이 커밋은 생략.)

---

## Self-Review 결과

- **Spec coverage:** 깔때기 3단계(Task 7·8) / 인증자 같은 트랙·연도 무관(Task 2) / 타 기수 제외 현행 유지(Task 2 other_cohort + Task 8 UI) / 알고리즘 동작 보존 + 사유(Task 3·4) / 스냅샷 확장(Task 3 Step 3, Task 8 onConfirm) / 검증 스크립트(Task 1·4·10) — 전부 매핑됨.
- **Placeholder scan:** 통과 — 모든 코드 블록 완결.
- **Type consistency:** `runExclusions(candidates, ctx)` / `recommendByQuotas(..., maxPerOrg, parentOrgCap)` 7-인자 / `Decision`·`DECISION_LABEL`·`ExclusionStageKey` 사용처 일치 확인. `Icons.chevronRight` 미등록 가능성은 Task 7 Step 1 주의사항으로 처리.
