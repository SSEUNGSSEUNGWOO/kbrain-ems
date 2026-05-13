// 일반/특화 교육 cohort 중 회차가 여러 개인 것들을 회차별로 분리.
// 기존 multi-session cohort 삭제 + 회차별 신규 cohort 생성.
// PDF에 회차 명시되었으나 일정 미정인 회차도 빈 cohort로 등록.
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

const { data: insts } = await s.from('instructors').select('id, name').eq('kind', 'main');
const byName = new Map((insts ?? []).map((i) => [i.name, i.id]));

type RoundSeed = {
  date?: string;
  endDate?: string;
  instructors?: string[];
};

type Plan = {
  baseName: string;
  category: 'general' | 'special';
  deliveryMethod?: '대면' | '비대면';
  maxCapacity?: number;
  rounds: RoundSeed[]; // index 0 = 1회차
};

const PLANS: Plan[] = [
  // ─── 일반교육: 2회차 있는 과정 ───
  {
    baseName: '생성형 AI 활용 데이터분석심화',
    category: 'general',
    deliveryMethod: '비대면',
    maxCapacity: 60,
    rounds: [
      { date: '2026-07-27', endDate: '2026-07-28', instructors: ['김용재'] },
      { date: '2026-09-07', endDate: '2026-09-08', instructors: ['김태유'] }
    ]
  },
  {
    baseName: '바이브코딩 LLM 서비스 개발',
    category: 'general',
    deliveryMethod: '대면',
    maxCapacity: 20,
    rounds: [
      { date: '2026-07-29', endDate: '2026-07-30', instructors: ['김용재'] },
      { date: '2026-09-09', endDate: '2026-09-10', instructors: ['신성진'] }
    ]
  },
  // ─── 특화교육 ───
  {
    baseName: '공공 AI 대전환 챌린지',
    category: 'special',
    deliveryMethod: '대면',
    rounds: [
      {
        date: '2026-06-23',
        endDate: '2026-06-24',
        instructors: ['신성진', '현중균']
      },
      {} // 2회차 — 일정 미정
    ]
  },
  {
    baseName: 'AI 테크 브리핑 사례발표',
    category: 'special',
    deliveryMethod: '비대면',
    maxCapacity: 100,
    rounds: [{}, {}, {}, {}, {}] // 1~5회차 모두 일정 미정
  },
  {
    baseName: '고위 공무원 특강',
    category: 'special',
    maxCapacity: 20,
    rounds: [{}, {}, {}, {}] // 1~4회차 모두 일정 미정
  },
  {
    baseName: '강사 양성 교육',
    category: 'special',
    deliveryMethod: '대면',
    maxCapacity: 20,
    rounds: [
      { date: '2026-07-13', endDate: '2026-07-15', instructors: ['신성진'] },
      { date: '2026-08-18', endDate: '2026-08-20', instructors: ['신성진'] }
    ]
  }
];

let removed = 0;
let created = 0;
let sessionCount = 0;

for (const plan of PLANS) {
  // 기존 baseName cohort 삭제 (sessions/session_instructors는 FK CASCADE)
  const { data: existing } = await s
    .from('cohorts')
    .select('id')
    .eq('name', plan.baseName);
  for (const row of existing ?? []) {
    const { error } = await s.from('cohorts').delete().eq('id', row.id);
    if (error) console.error(`[ERR] delete ${plan.baseName}:`, error.message);
    else {
      removed += 1;
      console.log(`[DEL] ${plan.baseName}`);
    }
  }

  // 회차별 cohort 생성
  for (let i = 0; i < plan.rounds.length; i += 1) {
    const round = plan.rounds[i];
    const roundLabel = `${i + 1}회차`;
    const newName = `${plan.baseName} ${roundLabel}`;

    // 이미 존재하면 스킵 (멱등)
    const { data: dup } = await s
      .from('cohorts')
      .select('id')
      .eq('name', newName)
      .maybeSingle();
    if (dup) {
      console.log(`[SKIP] ${newName} (이미 존재)`);
      continue;
    }

    const { data: cohort, error: cErr } = await s
      .from('cohorts')
      .insert({
        name: newName,
        category: plan.category,
        max_capacity: plan.maxCapacity ?? null,
        delivery_method: plan.deliveryMethod ?? null,
        started_at: round.date ?? null,
        ended_at: round.endDate ?? round.date ?? null
      })
      .select('id')
      .single();
    if (cErr) {
      console.error(`[ERR] create ${newName}:`, cErr.message);
      continue;
    }
    created += 1;

    // 일정 있는 회차만 session 추가
    if (round.date) {
      const { data: sess, error: sErr } = await s
        .from('sessions')
        .insert({
          cohort_id: cohort.id,
          session_date: round.date,
          session_end_date: round.endDate ?? null,
          title: roundLabel
        })
        .select('id')
        .single();
      if (sErr) console.error(`  [ERR] session:`, sErr.message);
      else {
        sessionCount += 1;
        for (const insName of round.instructors ?? []) {
          const insId = byName.get(insName);
          if (!insId) {
            console.warn(`  [WARN] instructor not found: ${insName}`);
            continue;
          }
          const { error: siErr } = await s
            .from('session_instructors')
            .insert({ session_id: sess.id, instructor_id: insId, role: 'main' });
          if (siErr) console.error(`  [ERR] session_instructors:`, siErr.message);
        }
      }
    }
    console.log(`[NEW] ${newName} ${round.date ? `(${round.date})` : '(일정 미정)'}`);
  }
}

console.log(`\n완료 — 삭제 ${removed}, 생성 ${created} cohorts / ${sessionCount} sessions`);
