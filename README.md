# KBrain EMS

교육 운영 관리 시스템 (Education Management System).
운영자 대시보드 + 신청자·교육생용 무인증 공개 응답 페이지로 구성된다.

- **운영자** — 기수를 선택해 모집·선발·출결·과제·수료·인증·설문·진단·결과보고서를 관리
- **신청자/교육생** — 로그인 없이 슬러그·토큰 링크로 신청서, 만족도 설문, 사전·사후 진단에 응답

## 구성

```
frontend/            Next.js 16 (App Router) — 모든 애플리케이션 코드
supabase/migrations/ DB 스키마 마이그레이션 (raw SQL)
supabase/seed.sql    로컬 개발용 초기 시드 (익명화본)
docs/                기획·산출물 문서
CLAUDE.md            아키텍처·라우팅·DB 상세 (사람이 읽어도 됨)
```

기술 스택: Next.js 16, React, TypeScript, Tailwind + shadcn/ui, TanStack Query/Form,
Supabase (Postgres + Auth), Bun.

## 시작하기

**1. 의존성 설치**

```bash
cd frontend
bun install
```

**2. 환경변수 설정**

`frontend/.env.example`를 `.env.local`로 복사한 뒤 값을 채운다.
Supabase 키는 프로젝트 대시보드 > Settings > API 에서 가져온다.

```bash
cp .env.example .env.local
```

**3. DB 준비**

Supabase 프로젝트를 만들고 `supabase/migrations/`의 SQL을 순서대로 적용한다.
Supabase Studio의 SQL Editor에 붙여넣거나:

```bash
bunx supabase db push
```

로컬 개발용 더미 데이터가 필요하면 `supabase/seed.sql`을 **1회만** 실행한다
(재실행 시 applicants/students에 중복 row 발생).

개발 DB의 인원수가 운영과 어긋나면 `node scripts/sync-prod-to-dev.mjs`로 차이를 확인하고
`--apply`로 맞춘다. 운영은 조회만 하며, 연락처(email·phone)는 개발의 마스킹 값을 유지한다.

**4. 개발 서버**

```bash
bun run dev        # http://localhost:3100
```

## 명령어

`frontend/`에서 실행한다.

| 명령 | 설명 |
|---|---|
| `bun run dev` | 개발 서버 (포트 3100) |
| `bun run build` | 프로덕션 빌드 |
| `bun run lint` | oxlint |
| `bun run lint:fix` | oxlint --fix + 포맷 |
| `bun run lint:strict` | CI 기준 (경고도 실패 처리) |
| `bun run format` | oxfmt 일괄 적용 |

테스트 스위트는 아직 없다.

## 주의사항

- **RLS 정책이 아직 없다.** 모든 테이블이 RLS 활성 상태지만 정책이 비어 있어, anon 키로는
  모든 쿼리가 거부된다. 현재 운영자·공개 페이지 모두 `service_role` 키로 동작한다.
  따라서 `SUPABASE_SERVICE_ROLE_KEY`는 사실상 DB 마스터 키이니 취급에 주의할 것.
- **개인정보를 커밋하지 말 것.** 실명·연락처가 담긴 명단·덤프·엑셀은 `.gitignore`로
  막아두었지만, 새 경로에 산출물을 만들 때는 먼저 ignore 여부를 확인한다.
  일회성 점검 스크립트는 `frontend/scripts/archive/`(ignore 대상)에 둔다.

## 더 읽을거리

- [`CLAUDE.md`](./CLAUDE.md) — 라우팅 맵, DB 테이블 29개 설명, 인증·데이터 페칭 패턴
- [`frontend/CLAUDE.md`](./frontend/CLAUDE.md) — 프론트엔드 컨벤션 (아이콘·폼·페이지 헤더)
- [`frontend/docs/forms.md`](./frontend/docs/forms.md) — TanStack Form + Zod 패턴
- [`frontend/docs/themes.md`](./frontend/docs/themes.md) — OKLCH 테마 시스템
