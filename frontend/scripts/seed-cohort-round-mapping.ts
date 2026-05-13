// cohort 시작일 기준으로 모집 라운드를 추정해 매핑.
//
// 룰:
//   1) EXPLICIT_OVERRIDES에 명시된 cohort는 강제 매핑 (HWP 비고 우선).
//   2) started_at NULL이면 미매핑 (skip).
//   3) started_at이 1차 통보일(2026-05-27)보다 이르면 미매핑 (라운드 모집 이전 시작).
//   4) 그 외에는 cohort.started_at이 어느 라운드 통보일 이후~다음 통보일 이전인지로 결정.
//
// 멱등성: 매번 모든 cohort를 재평가해 update.
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

// HWP 비고에 명시된 케이스 — 자동 룰과 다를 때만 적시.
// 예: '블루 1회차'는 1차 모집 비고에 명시되어 있으나 시작이 6/15라 자동 룰은 2차로 추론한다.
const EXPLICIT_OVERRIDES: Record<string, number> = {
  'AI 챔피언 블루 26-1기': 1
  // 'AI 리터러시와 업무활용'은 일정 미정 처리 — 매핑 제외
};

const { data: rounds } = await s
  .from('recruitment_rounds')
  .select('id, round_no, announce_at')
  .order('round_no');

if (!rounds || rounds.length === 0) {
  console.error('recruitment_rounds가 비어 있습니다. seed-recruitment-rounds.ts 먼저 실행하세요.');
  process.exit(1);
}

const roundsByNo = new Map<number, { id: string; announce_at: string | null }>();
for (const r of rounds) {
  roundsByNo.set(r.round_no, { id: r.id, announce_at: r.announce_at });
}

function pickRoundNo(startedAt: string): number | null {
  // sorted by round_no asc, announce_at도 같은 순서
  const ordered = rounds!;
  for (let i = 0; i < ordered.length; i++) {
    const cur = ordered[i];
    const next = ordered[i + 1];
    if (!cur.announce_at) continue;
    if (startedAt < cur.announce_at) {
      // 라운드 통보일보다 일찍 시작 — 그 라운드 대상 아님
      continue;
    }
    if (!next || !next.announce_at || startedAt < next.announce_at) {
      return cur.round_no;
    }
  }
  return null;
}

const { data: cohorts } = await s
  .from('cohorts')
  .select('id, name, started_at, recruitment_round_id')
  .order('started_at', { ascending: true, nullsFirst: false });

if (!cohorts) {
  console.error('cohorts 조회 실패');
  process.exit(1);
}

let mapped = 0;
let skipped = 0;
let unchanged = 0;

console.log('\n== cohort 라운드 매핑 ==\n');

for (const c of cohorts) {
  let targetRoundNo: number | null = null;
  let reason = '';

  if (EXPLICIT_OVERRIDES[c.name]) {
    targetRoundNo = EXPLICIT_OVERRIDES[c.name];
    reason = 'HWP 비고 명시';
  } else if (!c.started_at) {
    targetRoundNo = null;
    reason = '일정 미정';
  } else {
    targetRoundNo = pickRoundNo(c.started_at);
    reason = targetRoundNo ? '자동 추론' : '1차 통보 이전 시작';
  }

  const targetRoundId = targetRoundNo ? roundsByNo.get(targetRoundNo)?.id ?? null : null;

  if (c.recruitment_round_id === targetRoundId) {
    unchanged += 1;
    continue;
  }

  if (targetRoundId === null) {
    // 매핑 해제만 — 이미 NULL이면 skip
    if (c.recruitment_round_id) {
      await s.from('cohorts').update({ recruitment_round_id: null }).eq('id', c.id);
    }
    console.log(`  [SKIP ${reason.padEnd(12)}] ${c.name}  (시작 ${c.started_at ?? '—'})`);
    skipped += 1;
    continue;
  }

  await s.from('cohorts').update({ recruitment_round_id: targetRoundId }).eq('id', c.id);
  console.log(
    `  [${targetRoundNo}차  ${reason.padEnd(12)}] ${c.name}  (시작 ${c.started_at ?? '—'})`
  );
  mapped += 1;
}

console.log(`\n완료 — 매핑 ${mapped}, 미매핑 ${skipped}, 변경없음 ${unchanged} / 전체 ${cohorts.length}`);
