# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Monorepo with two subprojects:

- `frontend/` — Next.js 16 (App Router) web app. All frontend work happens here.
- `supabase/` — Supabase CLI config (`config.toml`) and SQL migrations.

`frontend/CLAUDE.md` has detailed frontend conventions (data fetching, forms, icons, page headers) — read it before touching frontend code. `frontend/AGENTS.md` is the original template's agent guide and references Clerk/Sentry that were removed; ignore it.

## Commands

Run from `frontend/`:

```bash
bun run dev      # dev server → http://localhost:3100
bun run build    # production build
bun run lint     # oxlint
bun run lint:fix # oxlint --fix + format
bun run format   # oxfmt
```

No test suite configured yet.

## Architecture

**Operator-only internal tool.** No student or instructor logins. 6–7 operators manage 2 concurrent cohorts (~24 students each).

### Routing — cohort-scoped

Operators pick a cohort first, then manage its 6 domains:

```
/dashboard/cohorts                          Cohort list (entry point — /dashboard redirects here)
/dashboard/cohorts/[cohortId]               Cohort overview (links to 6 domain pages)
/dashboard/cohorts/[cohortId]/recruitment   모집
/dashboard/cohorts/[cohortId]/selection     선발
/dashboard/cohorts/[cohortId]/attendance    출결
/dashboard/cohorts/[cohortId]/assignments   과제
/dashboard/cohorts/[cohortId]/completion    수료
/dashboard/cohorts/[cohortId]/certification 인증
```

### Sidebar — dynamically cohort-aware

`src/components/layout/app-sidebar.tsx` uses `usePathname` + `useMemo` to extract `cohortId` from the URL. When inside a cohort path it appends an "교육과정" group with 6 domain links scoped to that cohort; outside it shows only "대시보드" and "기수 목록".

`src/config/nav-config.ts` is intentionally minimal (two static items). Domain links are built at runtime.

### Supabase

**Clients** — always import from here, never instantiate directly:
- `src/lib/supabase/client.ts` — browser / Client Components
- `src/lib/supabase/server.ts` — Server Components, Route Handlers, Server Actions (async, uses `cookies()`)

**Schema** (`supabase/migrations/20260428090138_initial_schema.sql`):
| Table | Purpose | Notable constraints |
|---|---|---|
| `cohorts` | 교육 기수 | unique `name`, `updated_at` trigger |
| `organizations` | 소속 기관 | unique `name`, `updated_at` trigger |
| `students` | 교육생 마스터 | FK → `cohorts` (RESTRICT), → `organizations` (SET NULL), `updated_at` trigger |

**RLS**: enabled on all tables. Current policy (`*_dev_open_all`) is fully open — **dev scaffold only**. When Supabase Auth is added, drop these policies and replace with operator-whitelist row-level policies.

**Applying migrations**: `supabase link` is not configured. Apply SQL manually via the Supabase Dashboard SQL Editor.

### Server Actions

Colocate in `_actions.ts` next to the page (e.g., `src/app/dashboard/cohorts/_actions.ts`). Mark `'use server'`, call `await createClient()`, mutate, then `revalidatePath(...)`.

### Auth — not yet implemented

Clerk was removed from the template. Supabase Auth is the planned replacement. RLS is intentionally open until auth is wired up; do not assume any user identity is available in server code yet.

### Data fetching

- Server Components: call `await createClient()` then query directly.
- Client Components: TanStack Query (`useQuery` / `useMutation`), query client at `src/lib/query-client.ts`.
- Forms: `useAppForm` + `useFormFields<T>()` from `@/components/ui/tanstack-form` with Zod schemas. See `frontend/docs/forms.md`.
