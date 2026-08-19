# 자동선발 깔때기(funnel) 재설계

2026-08-19 · 승우님 승인 기반 설계

## 문제

자동선발 시트(`applications/_components/selection-sheet.tsx`, 1,052줄)는 노브 11개(가중치 2, 부처 비율 3, 정원, 예비 110%, 기관 cap, 상위부처 cap, 사전학습 제외, 자격증 제외, 중복기수 제외)와 결과 테이블이 한 화면에 모두 노출된다. 두 가지가 아프다:

1. **설정 과다** — 기수 유형마다 실제로 쓰는 노브는 3~4개인데 매번 전체를 이해하고 조합해야 한다.
2. **설명 불가** — 강제선발 선처리 → 점진적 cap 라운드 → 쿼터 채우기 + 흘러내림 → 동점자 구제를 거친 결과를 보고 "이 사람이 왜 됐고 저 사람이 왜 안 됐는지" 답할 수 없다.

여기에 2026 인증자 909명 + 2025 인증자 541명(`applicants.prior_certs`) 제외 요건이 새로 추가되어야 한다.

## 결정사항 (승우님 확정)

- UI를 **깔때기 스텝 플로우**로 재편: 규칙 하나 지날 때마다 "몇 명 빠지고 몇 명 남는지"가 위에서 아래로 읽힌다.
- **인증자 제외는 같은 트랙만, 연도 무관** — 그린 인증자(2025든 2026이든)는 그린 과정에서 제외, 블루 지원은 허용(승급 경로).
- **타 기수 기선발 제외는 현행 조건 유지** — 운영자가 제외할 기수를 고르면 그 기수의 `selected`를 제외 (`excludedCohortIds` 동작 그대로).
- **배분 알고리즘의 동작은 바꾸지 않는다** — 점진적 cap 라운드·흘러내림·동점자 구제는 실전 검증된 규칙이므로 유지. 바뀌는 것은 "사유를 뱉게" 만드는 것뿐.

## 설계

### 1. 깔때기 구조 (3단계)

```
Step 1 · 제외 대상 확인 (하드 규칙 — 설정 아님, 자동 적용)
  지원자 N명
   ├─ 테스트 학생 제외            −a
   ├─ 인증자 제외 (같은 트랙)      −b
   ├─ 타 기수 이미 선발 제외       −c   ← 기수 선택 UI는 이 행 안에
   ├─ 사전학습 미이수 제외         −d   ← prereq 있는 기수만 표시
   └─ 자격증 미보유 제외           −e   ← 자격연계형 기수만 표시
  → 선발 대상 풀 M명

Step 2 · 선발 조건 (노브 최소화)
  정원 · 예비 110% 여부 · [고급 설정 접힘: 가중치/부처 비율/기관 cap/상위부처 cap]

Step 3 · 결과 검토 + 적용
  선발/탈락 명단 + 후보별 사유 배지 + 수동 토글 → 적용
```

- Step 1의 각 제외 행은 클릭하면 **해당 단계에서 빠진 사람 명단**이 펼쳐지고, 개별 "예외 허용" 체크로 그 사람만 규칙을 통과시킬 수 있다. 예외는 사람 단위 전역 적용(체크한 사람은 모든 제외 규칙 통과 → 선발 대상 풀 진입)으로 단순화한다 — 한 사람이 여러 규칙에 걸리는 경우 규칙별 예외를 따로 관리할 실익이 없다.
- 해당 없는 규칙 행(prereq 없는 기수의 사전학습, 비자격연계형의 자격증)은 표시하지 않는다.
- 컨테이너는 현행 Sheet를 유지하되 내부를 스텝퍼로 재구성한다 (라우트 신설 없음).

### 2. 인증자 제외 규칙 (신규)

- 기수의 트랙은 기수명으로 판정: 이름에 "그린" 포함 → green, "블루" 포함 → blue (인증 페이지 `certification/page.tsx`와 동일 방식). 어느 쪽도 아니면(전문인재·강사양성 등) 이 규칙 비활성.
- 제외 조건: `applicant.prior_certs`에 `track === 기수 트랙`인 엔트리가 하나라도 있으면 제외. `year` 무관. `expert`/`continuing` 트랙 인증은 제외 사유 아님.
- 예외는 Step 1의 개별 "예외 허용"으로 처리 (별도 노브 없음).

### 3. 로직 재구성 — 사유를 뱉는 파이프라인

`_selection-logic.ts`를 3구간으로 재정리한다. 점수·배분 계산 자체는 현행 `scoreAll`/`recommendByQuotas` 동작과 동일해야 한다.

```ts
// 구간 1: 제외 (신규 — 기존 filter 산재분을 단계 배열로 통합)
type ExclusionStage = {
  key: 'test' | 'certified' | 'other_cohort' | 'no_prereq' | 'no_cert';
  label: string;
  excluded: CandidateRow[];        // 이 단계에서 빠진 사람
};
runExclusions(candidates, ctx, exceptions: Set<application_id>) → { pool, stages: ExclusionStage[] }

// 구간 2: 점수 — scoreAll 그대로

// 구간 3: 배분 — recommendByQuotas 동작 유지 + 후보별 결정 사유 추가
type Decision =
  | { kind: 'selected'; via: 'force' | 'quota' | 'overflow' | 'tie' }   // 강제/쿼터/흘러내림/동점자
  | { kind: 'rejected'; why: 'org_cap' | 'parent_cap' | 'score_cut'; detail?: string };
recommendByQuotas(...) → { selectedIds, scored, decisions: Map<application_id, Decision> }
```

- 기존 `excludeNoPrereq`/`excludeNoCert` 파라미터 필터는 구간 1로 이동한다. `recommendByQuotas` 시그니처가 바뀌는 곳(호출부: selection-sheet, export route, 스크립트)은 함께 수정.
- Step 3의 사유 배지는 `Decision`을 그대로 렌더: "중앙부처 쿼터", "흘러내림", "기관 cap 초과", "점수 미달 (컷 72.3)" 등.

### 4. 적용 스냅샷 확장

`cohorts.selection_config` (jsonb) 스냅샷에 추가 저장 — 마이그레이션 불필요:

- `exclusionCounts`: 단계별 제외 인원 `{ test: a, certified: b, ... }`
- `exceptions`: 예외 허용된 application_id 목록
- 기존 필드(weights, quotaRatio, maxPerOrg 등)는 유지. `excludeNoPrereq`/`excludeNoCert`는 하드 규칙화되므로 스냅샷에서 항상 true 기록.

깔때기 화면이 곧 선발 근거 자료가 되므로, 보고서·감사 대응 시 이 스냅샷으로 재현 가능하다.

### 5. 검증 (동작 보존이 핵심)

테스트 스위트가 없으므로 스크립트로 검증한다:

1. **동작 보존**: 리팩터 전 `recommendByQuotas`와 후 파이프라인을 실제 기수 데이터(예: `inspect-cert-answers.ts`의 cohort)에 같은 입력으로 돌려 `selectedIds` 완전 일치 확인. 단, 인증자 제외는 신규 규칙이므로 비활성 상태로 비교.
2. **인증자 제외 검증**: 그린/블루 기수 각각에서 제외 인원이 `prior_certs` 트랙 일치 건수와 맞는지 대조.
3. `bun run build` + `bun run lint` 통과.

## 범위 밖 (non-goals)

- 배분 알고리즘 규칙 변경(라운드·흘러내림·동점자 구제 제거) — 이번엔 안 건드림.
- 프리셋 시스템 — Step 2의 "고급 설정 접힘"으로 갈음하고, 필요해지면 후속.
- `PriorCertsChips` 연도 구분 표시 — Step 3 재작업에 포함될 수 있으나 별도 판단.
- RLS·인증 구조 변경.
