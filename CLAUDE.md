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

**Operator-only internal tool.** No student or instructor logins. 6–7 operators manage 2 concurrent cohorts (~24 students each).

### Routing — cohort-scoped

Operators pick a cohort first, then manage its domains. `students/` is a cross-cutting roster page (used by 출결·과제 등 모든 도메인이 공유), not one of the 6 lifecycle domains.

```
/dashboard/cohorts                          Cohort list (entry point — /dashboard redirects here)
/dashboard/cohorts/[cohortId]               Cohort overview (links to domain pages)
/dashboard/cohorts/[cohortId]/students      교육생 명단 (공통 마스터)
/dashboard/cohorts/[cohortId]/recruitment   모집
/dashboard/cohorts/[cohortId]/selection     선발
/dashboard/cohorts/[cohortId]/attendance    출결  (회차 상세: /attendance/[sessionId])
/dashboard/cohorts/[cohortId]/assignments   과제  (과제 상세: /assignments/[assignmentId])
/dashboard/cohorts/[cohortId]/completion    수료
/dashboard/cohorts/[cohortId]/certification 인증
```

### Sidebar — dynamically cohort-aware

`src/components/layout/app-sidebar.tsx` uses `usePathname` + `useMemo` to extract `cohortId` from the URL. When inside a cohort path it appends an "교육과정" group with 6 domain links scoped to that cohort; outside it shows only "대시보드" and "기수 목록".

`src/config/nav-config.ts` is intentionally minimal (two static items). Domain links are built at runtime.

### Database (Neon + Drizzle ORM)

**DB 연결**: `src/lib/db/index.ts` — Neon serverless driver + Drizzle ORM
**스키마**: `src/lib/db/schema.ts` — 7개 테이블 정의 (Drizzle pgTable)

```ts
import { db } from '@/lib/db';
import { cohorts, students, ... } from '@/lib/db/schema';
```

| Table | Purpose | Notable constraints |
|---|---|---|
| `cohorts` | 교육 기수 | unique `name` |
| `organizations` | 소속 기관 | unique `name` |
| `students` | 교육생 마스터 | FK → `cohorts` (RESTRICT), → `organizations` (SET NULL) |
| `sessions` | 수업 회차(날짜·시간·휴게) | FK → `cohorts` (CASCADE) |
| `attendanceRecords` | 회차×학생 출결 | unique `(session_id, student_id)`, status: present/absent/late/early_leave/excused |
| `assignments` | 기수별 과제 | FK → `cohorts` (CASCADE) |
| `assignmentSubmissions` | 과제×학생 제출 | unique `(assignment_id, student_id)`, status: not_submitted/submitted/late |

환경변수: `.env.local`에 `DATABASE_URL` (Neon pooled connection string). Seed data: `seed_students.sql`.

### Server Actions

Colocate in `_actions.ts` next to the page (e.g., `src/app/dashboard/cohorts/_actions.ts`). Mark `'use server'`, call `await createClient()`, mutate, then `revalidatePath(...)`.

### Auth — not yet implemented

Clerk was removed from the template. Supabase Auth is the planned replacement. RLS is intentionally open until auth is wired up; do not assume any user identity is available in server code yet.

### Data fetching

- Server Components: call `await createClient()` then query directly.
- Client Components: TanStack Query (`useQuery` / `useMutation`), query client at `src/lib/query-client.ts`.
- Forms: `useAppForm` + `useFormFields<T>()` from `@/components/ui/tanstack-form` with Zod schemas. See `frontend/docs/forms.md`.
