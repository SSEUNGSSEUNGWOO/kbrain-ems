# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Monorepo:

- `frontend/` — Next.js 16 (App Router) web app. All frontend work happens here.

`frontend/CLAUDE.md` has detailed frontend conventions (data fetching, forms, icons, page headers) — read it before touching frontend code. `frontend/AGENTS.md` is the original template's agent guide and references Clerk/Sentry that were removed; ignore it.

## Commands

Run from `frontend/`:

```bash
bun run dev         # dev server → http://localhost:3100
bun run build       # production build
bun run lint        # oxlint
bun run lint:fix    # oxlint --fix + format
bun run lint:strict # oxlint --deny-warnings (CI-style)
bun run format      # oxfmt
```

No test suite configured yet.

## Architecture

**Operator dashboard + token-based public response pages.** 6–7 operators manage 2 concurrent cohorts (~24 students each) via `/dashboard/*` (Supabase Auth 예정). 신청자·교육생은 무인증으로 슬러그/토큰 기반 공개 라우트(`/apply/[slug]`, `/survey/[token]`, `/diagnosis/[token]`)에서 응답한다.

### Routing

운영자는 기수를 먼저 선택한 뒤 그 기수의 도메인을 관리한다. `students/`는 출결·과제 등 모든 도메인이 공유하는 cross-cutting roster page.

```
# 기수별 (cohort-scoped) — 운영자
/dashboard/cohorts                          Cohort list (entry point — /dashboard redirects here)
/dashboard/cohorts/[cohortId]               Cohort overview
/dashboard/cohorts/[cohortId]/students      교육생 명단 (공통 마스터)
/dashboard/cohorts/[cohortId]/recruitment   모집
/dashboard/cohorts/[cohortId]/selection     선발
/dashboard/cohorts/[cohortId]/attendance    출결  (회차 상세: /attendance/[sessionId])
/dashboard/cohorts/[cohortId]/assignments   과제  (과제 상세: /assignments/[assignmentId])
/dashboard/cohorts/[cohortId]/completion    수료
/dashboard/cohorts/[cohortId]/certification 인증
/dashboard/cohorts/[cohortId]/instructors   강사·강사료
/dashboard/cohorts/[cohortId]/surveys       만족도 설문
/dashboard/cohorts/[cohortId]/diagnoses     사전·사후 진단
/dashboard/cohorts/[cohortId]/reports       결과보고서 (자동 초안)
/dashboard/cohorts/[cohortId]/notifications 알림 발송 로그
/dashboard/cohorts/[cohortId]/dashboard     회차별 누적 통계

# 전역 — 운영자
/dashboard/applicants                       지원자 마스터
/dashboard/operators                        운영자 마스터
/dashboard/risks                            리스크 등록부
/dashboard/issues                           이슈 보드
/dashboard/evaluators                       평가위원
/dashboard/kpi-dashboard                    사업 진척률·KPI

# 공개 응답 (무인증, 슬러그/토큰 검증)
/apply/[slug]                               신청 + 자가진단 통합
/survey/[token]                             만족도 설문 응답
/diagnosis/[token]                          사전·사후 진단 응답
```

Phase 1 scaffold(2026-05-11)로 추가된 도메인(instructors, surveys, diagnoses, reports, notifications, dashboard, risks, issues, evaluators, kpi-dashboard, /apply, /survey, /diagnosis)은 placeholder 상태이며, 사이드바는 아직 자동 매핑되지 않아 별도 갱신 필요.

### Sidebar — dynamically cohort-aware

`src/components/layout/app-sidebar.tsx` uses `usePathname` + `useMemo` to extract `cohortId` from the URL. When inside a cohort path it appends an "교육과정" group with 6 domain links scoped to that cohort; outside it shows only "대시보드" and "기수 목록".

`src/config/nav-config.ts` is intentionally minimal (two static items). Domain links are built at runtime.

### Database (Supabase + Supabase JS Client)

**DB**: Supabase Postgres (프로젝트 `nfbmxwkqhkgvossraeze`)
**Client**:
- `src/lib/supabase/client.ts` — `createClient()` (브라우저, anon key)
- `src/lib/supabase/server.ts` — `createClient()` (서버, anon + cookies) / `createAdminClient()` (service_role, RLS 우회)
- `src/lib/supabase/types.ts` — `Database` 타입 정의 (27 테이블)

```ts
// Server Component / Server Action에서
import { createAdminClient } from '@/lib/supabase/server';

const supabase = createAdminClient();
const { data, error } = await supabase.from('cohorts').select('*');
```

**RLS 정책 현황**: 모든 테이블 RLS 활성 + 정책 없음 = anon 키로는 모든 쿼리 거부. 현재 모든 서버 코드는 `createAdminClient()` (service_role) 사용. 운영자 인증 도입 후 정책 부여 + `createClient()` (anon, cookie-based)로 점진적 교체 예정.

| Table | Purpose | Notable constraints |
|---|---|---|
| `operators` | 운영자·개발자 | unique `name` |
| `cohorts` | 교육 기수 | unique `name`, unique `recruiting_slug`, 모집기간 컬럼 |
| `organizations` | 소속 기관 | unique `name` |
| `tracks` | 트랙 (자가진단 추천·세분) | unique `(cohort_id, code)` |
| `applicants` | 지원자 마스터 | FK target: `students.id` references this |
| `applications` | 지원 이력 (× 기수) | unique `(applicant_id, cohort_id)`, self_diagnosis jsonb, recommended_track_id |
| `students` | 교육생 마스터 (applicant 승격) | `id` FK → `applicants` (CASCADE), assigned_track_id |
| `sessions` | 수업 회차 | FK → `cohorts` (CASCADE) |
| `attendance_records` | 회차×학생 출결 | unique `(session_id, student_id)` |
| `assignments` | 기수별 과제 | FK → `cohorts` (CASCADE) |
| `assignment_submissions` | 과제×학생 제출 | unique `(assignment_id, student_id)` |
| `instructor_grades` | 강사 등급 단가 정책 | unique `code` (특급·1·2·3급) |
| `instructors` | 강사 마스터 | FK → `instructor_grades` |
| `session_instructors` | 세션×강사 (N:N, role) | unique `(session_id, instructor_id, role)` |
| `instructor_fees` | 강사료 산정·승인·정산 | FK → `session_instructors`, `operators` |
| `surveys` | 만족도 설문 마스터 | FK → `cohorts`, optional `sessions` |
| `survey_questions` | 설문 문항 | unique `(survey_id, question_no)` |
| `survey_responses` | 설문 응답 (토큰) | unique `(survey_id, student_id)`, unique `token` |
| `diagnoses` | 사전·사후 진단 마스터 | type: pre / post / follow_up |
| `diagnosis_questions` | 진단 문항 | unique `(diagnosis_id, question_no)`, weight |
| `diagnosis_responses` | 진단 응답 (토큰) | unique `(diagnosis_id, student_id)`, unique `token`, total_score |
| `evaluators` | 선발 평가위원 | unique `(cohort_id, anonymous_code)` |
| `evaluations` | 평가위원 × 지원자 평가 | unique `(evaluator_id, application_id)` |
| `cohort_reports` | 차수·세션 결과보고서 자동 초안 | status: draft / reviewed / finalized |
| `notifications` | 발송 로그 (입과안내·리마인드 등) | recipient_type+id polymorphic, status |
| `risks` | 사업 리스크 등록부 | status: open / mitigated / closed |
| `issues` | 이슈 라이프사이클 | status, priority, optional `related_cohort_id` |

**마이그레이션**: `supabase/migrations/` 폴더의 raw SQL. Supabase Studio SQL Editor 또는 `bunx supabase db push`로 적용. 초기 통합본은 `20260511000000_initial_schema.sql`. (legacy: 루트 `migrations/` 폴더는 Neon 시절 잔재, 사용 안 함)

**환경변수** (`frontend/.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=https://nfbmxwkqhkgvossraeze.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...    # server-only, RLS bypass
```

Seed data: 루트 `seed_students.sql` (Supabase Studio에서 실행).

### Server Actions

Colocate in `_actions.ts` next to the page (e.g., `src/app/dashboard/cohorts/_actions.ts`). Mark `'use server'`, call `createAdminClient()` (현재 RLS 정책 없으므로 anon은 거부됨), mutate via `supabase.from(...).insert/update/delete(...)`, then `revalidatePath(...)`.

### Auth — not yet implemented

Clerk was removed from the template. Supabase Auth is the planned replacement. 현재 모든 서버 작업은 `createAdminClient()` (service_role) 기반이라 사용자 식별이 없다. 인증 도입 후 RLS 정책 + `createClient()` 전환 예정.

### Data fetching

- Server Components: `createAdminClient()` (sync) 호출 후 `supabase.from(...).select(...)` 직접.
- Client Components: TanStack Query (`useQuery` / `useMutation`), query client at `src/lib/query-client.ts`. 브라우저용 `createClient()`는 `@/lib/supabase/client`.
- Forms: `useAppForm` + `useFormFields<T>()` from `@/components/ui/tanstack-form` with Zod schemas. See `frontend/docs/forms.md`.
- GROUP BY/aggregate: Supabase JS는 group by 미지원. PoC 단계에서는 row 전체 가져와 JS reduce로 집계 (예: `cohorts/page.tsx`, `overview/page.tsx`). 성능 이슈 시 PostgreSQL RPC 함수로 wrapping.
