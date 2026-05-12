# CLAUDE.md (frontend)

루트 `../CLAUDE.md`가 1차 reference — 라우팅·DB·인증·Server Action 패턴은 모두 그쪽에 있다. 이 파일은 프론트엔드 작업 시 자주 어기게 되는 컨벤션만 모은다.

> `AGENTS.md`는 원본 템플릿(next-shadcn-dashboard-starter)의 가이드로 Clerk·Sentry·mock API 등 이 프로젝트에서 제거된 스택을 가리킨다. 무시할 것.

## 살아있는 docs

- [docs/forms.md](./docs/forms.md) — TanStack Form + Zod, `useAppForm`, `useFormFields<T>()`, multi-step·sheet·dialog 폼
- [docs/themes.md](./docs/themes.md) — OKLCH 테마 시스템, 폰트 설정

`docs/clerk_setup.md`는 사라졌고 `docs/nav-rbac.md`는 Clerk 기반 RBAC을 설명 — 이 프로젝트의 권한 게이트는 `src/lib/auth.ts`의 `getOperator()` / `isDeveloper()` 하나뿐이라 참고 가치 낮음.

## Critical conventions

- **Icons** — `@/components/icons`에서만 import. `@tabler/icons-react` 직접 사용 금지. 새 아이콘은 `src/components/icons/index.tsx`의 `Icons` 객체에 등록.
- **Forms** — `useAppForm` + `useFormFields<T>()` (`@/components/ui/tanstack-form`) + Zod 스키마. 자세한 건 `docs/forms.md`.
- **Page headers** — `PageContainer`의 `pageTitle` / `pageDescription` / `pageHeaderAction` props 사용. `<Heading>` 직접 import 금지.
- **Server data** — Server Component에서는 `createAdminClient()` (`@/lib/supabase/server`) 동기 호출 후 `.select()`. RLS 정책이 아직 없어 anon 클라이언트는 모든 쿼리가 거부됨.
- **Client data** — TanStack Query (`useQuery` / `useMutation`). 브라우저 supabase는 `@/lib/supabase/client`. mutation 후엔 Server Action의 `revalidatePath`로 캐시 무효화.
- **URL search params** — nuqs. 서버는 `searchParamsCache`, 클라이언트는 `useQueryStates`. `useDataTable` 정렬은 `getSortingStateParser`.
- **Mutations** — Server Action (`_actions.ts`, `'use server'`) + `createAdminClient()` + `revalidatePath(...)`. Mock API 호출 금지.
- **Formatting** — oxfmt: 단일 따옴표, JSX 단일 따옴표, trailing comma 없음, 2-space indent. `bun run format`으로 일괄 적용.
