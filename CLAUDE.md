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

**Operator dashboard + token-based public response pages.** 6–7 operators manage 2 concurrent cohorts (~24 students each) via `/dashboard/*` (Supabase Auth 적용, RLS는 미적용). 신청자·교육생은 무인증으로 슬러그/토큰 기반 공개 라우트(`/apply/[slug]`, `/survey/[token]`, `/survey/share/[code]`, `/diagnosis/[token]`)에서 응답한다.

### Routing

운영자는 기수를 먼저 선택한 뒤 그 기수의 도메인을 관리한다. `students/`는 출결·과제 등 모든 도메인이 공유하는 cross-cutting roster page.

```
# 기수별 (cohort-scoped) — 운영자
/dashboard/cohorts                          Cohort list (entry point — /dashboard redirects here)
/dashboard/cohorts/[cohortId]               Cohort overview
/dashboard/cohorts/[cohortId]/students      교육생 명단 (공통 마스터)
/dashboard/cohorts/[cohortId]/recruitment   모집
/dashboard/cohorts/[cohortId]/selection     선발
/dashboard/cohorts/[cohortId]/lessons       수업 회차 관리 (생성: /lessons/new, 수정: /lessons/[sessionId]/edit)
/dashboard/cohorts/[cohortId]/attendance    출결  (회차 상세: /attendance/[sessionId])
/dashboard/cohorts/[cohortId]/assignments   과제  (과제 상세: /assignments/[assignmentId])
/dashboard/cohorts/[cohortId]/completion    수료
/dashboard/cohorts/[cohortId]/certification 인증
/dashboard/cohorts/[cohortId]/instructors   강사 배정·강사료
/dashboard/cohorts/[cohortId]/surveys       만족도 설문 (생성: /surveys/new, 미리보기: /surveys/[surveyId]/preview)
/dashboard/cohorts/[cohortId]/diagnoses     사전·사후 진단
/dashboard/cohorts/[cohortId]/reports       결과보고서 (자동 초안)
/dashboard/cohorts/[cohortId]/notifications 알림 발송 로그
/dashboard/cohorts/[cohortId]/dashboard     회차별 누적 통계

# 전역 — 운영자
/dashboard/applicants                       지원자 마스터
/dashboard/instructors                      강사풀 (글로벌, cohort-scoped instructors와 별개)
/dashboard/operators                        운영자 마스터 (developer role만 사이드바 노출)
/dashboard/risks                            리스크 등록부
/dashboard/issues                           이슈 보드
/dashboard/evaluators                       평가위원
/dashboard/kpi-dashboard                    사업 진척률·KPI
/dashboard/account                          본인 계정 (비밀번호 변경 등)

# 인증
/lock                                       Supabase Auth 로그인 (이메일·비밀번호)

# 공개 응답 (무인증, 슬러그/토큰 검증)
/apply/[slug]                               신청 + 자가진단 통합 (완료: /apply/[slug]/done)
/survey/[token]                             만족도 설문 응답 (개별 토큰)
/survey/share/[code]                        만족도 설문 카톡 공유 진입 (이름 입력 → 토큰 응답으로 redirect)
/diagnosis/[token]                          사전·사후 진단 응답
```

### Cohort stage

`src/lib/cohort-stage.ts`의 `computeCohortStage()`는 cohort의 `application_start_at/end_at` + `started_at/ended_at`을 보고 `recruiting | active | finished | unset` 4단계를 산출한다. 사이드바·뱃지·페이지 게이팅에서 공통 사용.

### Sidebar — stage-driven, cohort-aware

`src/components/layout/app-sidebar.tsx`는 `usePathname`으로 URL의 `cohortId`를 추출하고 `/api/cohorts-list`에서 가져온 기수 목록을 트리로 표시한다. 각 기수 아래에는 `STAGE_DOMAINS` (cohort-stage.ts 정의)에 따라 단계별 도메인 메뉴만 노출 — 예: `recruiting`은 students/lessons/instructors/surveys만, `finished`는 reports까지 포함. `DOMAINS` 상수가 slug/라벨/아이콘/색의 단일 출처.

`src/config/nav-config.ts`는 거의 비어 있고, 글로벌 메뉴(지원자/강사풀/평가위원/KPI/리스크/이슈/운영자)와 도메인 링크는 모두 `app-sidebar.tsx`에서 직접 구성.

### Database (Supabase + Supabase JS Client)

**DB**: Supabase Postgres (프로젝트 `nfbmxwkqhkgvossraeze`)
**Client**:
- `src/lib/supabase/client.ts` — `createClient()` (브라우저, anon key)
- `src/lib/supabase/server.ts` — `createClient()` (서버, anon + cookies) / `createAdminClient()` (service_role, RLS 우회)
- `src/lib/supabase/types.ts` — `Database` 타입 정의 (29 테이블)

```ts
// Server Component / Server Action에서
import { createAdminClient } from '@/lib/supabase/server';

const supabase = createAdminClient();
const { data, error } = await supabase.from('cohorts').select('*');
```

**RLS 정책 현황**: 모든 테이블 RLS 활성 + 정책 없음 = anon 키로는 모든 쿼리 거부. **인증은 도입되어 있지만**(아래 Auth 섹션) RLS 정책이 아직 없어 운영자 페이지·공개 페이지 모두 `createAdminClient()` (service_role)로 동작한다. 정책 부여 + `createClient()` (anon, cookie-based) 전환은 후속 작업.

| Table | Purpose | Notable constraints |
|---|---|---|
| `operators` | 운영자·개발자 | unique `name`, `auth_user_id` → `auth.users`, `cohort_order` jsonb (사이드바 기수 정렬) |
| `cohorts` | 교육 기수 | unique `name`, unique `recruiting_slug`, 모집기간 + 교육기간 컬럼 (stage 산출 입력) |
| `organizations` | 소속 기관 | unique `name` |
| `tracks` | 트랙 (자가진단 추천·세분) | unique `(cohort_id, code)` |
| `applicants` | 지원자 마스터 | FK target: `students.id` references this |
| `applications` | 지원 이력 (× 기수) | unique `(applicant_id, cohort_id)`, self_diagnosis jsonb, recommended_track_id, application_file_path/name/size (PDF) |
| `students` | 교육생 마스터 (applicant 승격) | `id` FK → `applicants` (CASCADE), assigned_track_id |
| `locations` | 수업 장소 | unique `name` (public.locations로 명시, auth.sessions와 충돌 방지) |
| `sessions` | 수업 회차 | FK → `cohorts` (CASCADE), `location_id` FK → `locations` |
| `attendance_records` | 회차×학생 출결 | unique `(session_id, student_id)` |
| `assignments` | 기수별 과제 | FK → `cohorts` (CASCADE) |
| `assignment_submissions` | 과제×학생 제출 | unique `(assignment_id, student_id)` |
| `instructor_grades` | 강사 등급 단가 정책 | unique `code` (특급·1·2·3급) |
| `instructors` | 강사 마스터 | FK → `instructor_grades` |
| `session_instructors` | 세션×강사 (N:N, role) | unique `(session_id, instructor_id, role)` |
| `instructor_fees` | 강사료 산정·승인·정산 | FK → `session_instructors`, `operators` |
| `surveys` | 만족도 설문 마스터 | FK → `cohorts`, optional `sessions`, `share_code` (카톡 공유 short slug, unique partial) |
| `survey_questions` | 설문 문항 | unique `(survey_id, question_no)`, `section_no`/`section_title` (UI 그룹), `instructor_id` (강사 만족도 매핑), type=`likert5`/`text`/`choice` |
| `survey_responses` | 설문 응답 (토큰) | unique `token`. **익명화**: `student_id` nullable — 제출 후 NULL 처리, 누가 냈는지는 `survey_completions`에만 |
| `survey_completions` | 설문 응답 완료 학생 추적 | unique `(survey_id, student_id)` — 응답 내용과 학생 매칭을 분리 |
| `diagnoses` | 사전·사후 진단 마스터 | type: pre / post / follow_up |
| `diagnosis_questions` | 진단 문항 | unique `(diagnosis_id, question_no)`, weight |
| `diagnosis_responses` | 진단 응답 (토큰) | unique `(diagnosis_id, student_id)`, unique `token`, total_score |
| `evaluators` | 선발 평가위원 | unique `(cohort_id, anonymous_code)` |
| `evaluations` | 평가위원 × 지원자 평가 | unique `(evaluator_id, application_id)` |
| `cohort_reports` | 차수·세션 결과보고서 자동 초안 | status: draft / reviewed / finalized |
| `notifications` | 발송 로그 (입과안내·리마인드 등) | recipient_type+id polymorphic, status |
| `risks` | 사업 리스크 등록부 | status: open / mitigated / closed |
| `issues` | 이슈 라이프사이클 | status, priority, optional `related_cohort_id` |

**마이그레이션**: `supabase/migrations/` 폴더의 raw SQL. Supabase Studio SQL Editor 또는 `bunx supabase db push`로 적용. 초기 통합본 이후 누적된 변경:

- `_initial_schema.sql` — 27개 코어 테이블
- `_survey_extensions.sql` — `survey_questions`에 섹션·강사 매핑 컬럼
- `_surveys_share_code.sql` — 카톡 공유용 `surveys.share_code`
- `_locations.sql` — 수업 장소 테이블 + `sessions.location_id`
- `_likert5_migration.sql` — 만족도 척도 1-10 → 1-5 일괄 변환 (응답 분석 코드는 5점 기준)
- `_application_file.sql` — 신청 PDF 첨부 컬럼
- `_operators_auth.sql` — `operators.auth_user_id` ↔ `auth.users` 매핑 (Supabase Auth 도입)
- `_operator_cohort_order.sql` — 운영자별 사이드바 기수 정렬
- `_survey_anonymous.sql` — 응답 익명화 (`survey_responses.student_id` nullable + 별도 `survey_completions`)

(legacy: 루트 `migrations/` 폴더는 Neon 시절 잔재, 사용 안 함)

**환경변수** (`frontend/.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=https://nfbmxwkqhkgvossraeze.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...    # server-only, RLS bypass
```

Seed data: 루트 `seed_students.sql` (Supabase Studio에서 실행).

### Server Actions

Colocate in `_actions.ts` next to the page (e.g., `src/app/dashboard/cohorts/_actions.ts`). Mark `'use server'`, call `createAdminClient()` (현재 RLS 정책 없으므로 anon은 거부됨), mutate via `supabase.from(...).insert/update/delete(...)`, then `revalidatePath(...)`.

### Auth

Supabase Auth(이메일·비밀번호)가 `/lock`에서 활성. `operators.auth_user_id` ↔ `auth.users.id` 매핑. 운영자 식별/권한 게이트는 `src/lib/auth.ts`의 두 헬퍼로 단일화:

- `getOperator()` — 현재 세션의 운영자 row(`id, name, role, title, cohort_order`) 반환, 없으면 `null`
- `isDeveloper()` — 사이드바·페이지에서 권한 게이트로 사용. PoC 단계에선 "operators row가 있다"는 의미와 같고, 진짜 `role === 'developer'` 분리가 필요해지면 이 함수만 좁히면 됨

**RLS는 아직 없음** — `auth.getUser()`로 세션 확인 후, 실제 DB I/O는 여전히 `createAdminClient()`. 운영자 페이지 보호는 `getOperator()` 호출 + 미들웨어(`src/proxy.ts`)에서 처리.

### Data fetching

- Server Components: `createAdminClient()` (sync) 호출 후 `supabase.from(...).select(...)` 직접.
- Client Components: TanStack Query (`useQuery` / `useMutation`), query client at `src/lib/query-client.ts`. 브라우저용 `createClient()`는 `@/lib/supabase/client`.
- Forms: `useAppForm` + `useFormFields<T>()` from `@/components/ui/tanstack-form` with Zod schemas. See `frontend/docs/forms.md`.
- GROUP BY/aggregate: Supabase JS는 group by 미지원. PoC 단계에서는 row 전체 가져와 JS reduce로 집계 (예: `cohorts/page.tsx`, `overview/page.tsx`). 성능 이슈 시 PostgreSQL RPC 함수로 wrapping.
