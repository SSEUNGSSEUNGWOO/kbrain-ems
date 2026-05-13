// PDF "260511_교육 일정 세부표"의 2.일반교육·3.특화교육 cohort + sessions 일괄 등록.
// 멱등성: 이미 같은 name으로 등록된 cohort는 건너뜀.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const s = createClient(url, key);

const { data: insts } = await s.from('instructors').select('id, name').eq('kind', 'main');
const byName = new Map((insts ?? []).map((i) => [i.name, i.id]));

type SessionSeed = {
  date: string;
  endDate?: string;
  title: string;
  instructors: string[]; // 강사 이름
};

type CohortSeed = {
  name: string;
  category: 'general' | 'special';
  maxCapacity?: number;
  startedAt?: string;
  endedAt?: string;
  deliveryMethod?: '대면' | '비대면';
  sessions: SessionSeed[];
};

const seeds: CohortSeed[] = [
  // ──────────── 일반교육 ────────────
  {
    name: 'AI 리터러시와 업무활용',
    category: 'general',
    maxCapacity: 80,
    startedAt: '2026-05-26',
    endedAt: '2026-05-26',
    deliveryMethod: '비대면',
    sessions: [{ date: '2026-05-26', title: '1회차', instructors: ['김태유'] }]
  },
  {
    name: '데이터 리터러시',
    category: 'general',
    maxCapacity: 80,
    startedAt: '2026-06-02',
    endedAt: '2026-06-02',
    deliveryMethod: '비대면',
    sessions: [{ date: '2026-06-02', title: '1회차', instructors: ['현중균'] }]
  },
  {
    name: '관리자 AI 리더십',
    category: 'general',
    maxCapacity: 80,
    startedAt: '2026-06-09',
    endedAt: '2026-06-09',
    deliveryMethod: '비대면',
    sessions: [{ date: '2026-06-09', title: '1회차', instructors: ['신성진'] }]
  },
  {
    name: '생성형 AI 활용 노코드 데이터분석',
    category: 'general',
    maxCapacity: 60,
    startedAt: '2026-06-16',
    endedAt: '2026-06-16',
    deliveryMethod: '비대면',
    sessions: [{ date: '2026-06-16', title: '1회차', instructors: ['김태유'] }]
  },
  {
    name: 'AI 행정 융합 기획',
    category: 'general',
    maxCapacity: 60,
    startedAt: '2026-06-29',
    endedAt: '2026-06-30',
    deliveryMethod: '비대면',
    sessions: [
      { date: '2026-06-29', endDate: '2026-06-30', title: '1회차', instructors: ['이중균'] }
    ]
  },
  {
    name: '노코드 AI 서비스 구현',
    category: 'general',
    maxCapacity: 20,
    startedAt: '2026-07-06',
    endedAt: '2026-07-07',
    deliveryMethod: '대면',
    sessions: [
      { date: '2026-07-06', endDate: '2026-07-07', title: '1회차', instructors: ['신성진'] }
    ]
  },
  {
    name: '생성형 AI 활용 데이터분석심화',
    category: 'general',
    maxCapacity: 60,
    startedAt: '2026-07-27',
    endedAt: '2026-09-08',
    deliveryMethod: '비대면',
    sessions: [
      { date: '2026-07-27', endDate: '2026-07-28', title: '1회차', instructors: ['김용재'] },
      { date: '2026-09-07', endDate: '2026-09-08', title: '2회차', instructors: ['김태유'] }
    ]
  },
  {
    name: '바이브코딩 LLM 서비스 개발',
    category: 'general',
    maxCapacity: 20,
    startedAt: '2026-07-29',
    endedAt: '2026-09-10',
    deliveryMethod: '대면',
    sessions: [
      { date: '2026-07-29', endDate: '2026-07-30', title: '1회차', instructors: ['김용재'] },
      { date: '2026-09-09', endDate: '2026-09-10', title: '2회차', instructors: ['신성진'] }
    ]
  },
  // ──────────── 특화교육 ────────────
  {
    name: '공공 AI 대전환 챌린지',
    category: 'special',
    deliveryMethod: '대면',
    startedAt: '2026-06-23',
    endedAt: '2026-06-24',
    sessions: [
      {
        date: '2026-06-23',
        endDate: '2026-06-24',
        title: '1회차 (해커톤·사례발표)',
        instructors: ['신성진', '현중균']
      }
      // 2회차 일정 미정 — 비워둠
    ]
  },
  {
    name: 'AI 테크 브리핑 사례발표',
    category: 'special',
    maxCapacity: 100,
    deliveryMethod: '비대면',
    // 정확한 날짜 미정 — sessions 비워둠
    sessions: []
  },
  {
    name: '고위 공무원 특강',
    category: 'special',
    maxCapacity: 20,
    // 일정 미정 — sessions 비워둠
    sessions: []
  },
  {
    name: '강사 양성 교육',
    category: 'special',
    maxCapacity: 20,
    startedAt: '2026-07-13',
    endedAt: '2026-08-20',
    deliveryMethod: '대면',
    sessions: [
      { date: '2026-07-13', endDate: '2026-07-15', title: '1회차', instructors: ['신성진'] },
      { date: '2026-08-18', endDate: '2026-08-20', title: '2회차', instructors: ['신성진'] }
    ]
  }
];

let created = 0;
let skipped = 0;
let sessionCount = 0;

for (const seed of seeds) {
  const { data: existing } = await s
    .from('cohorts')
    .select('id')
    .eq('name', seed.name)
    .maybeSingle();

  if (existing) {
    console.log(`[SKIP] ${seed.name} (이미 존재)`);
    skipped += 1;
    continue;
  }

  const { data: cohort, error: cErr } = await s
    .from('cohorts')
    .insert({
      name: seed.name,
      category: seed.category,
      max_capacity: seed.maxCapacity ?? null,
      started_at: seed.startedAt ?? null,
      ended_at: seed.endedAt ?? null,
      delivery_method: seed.deliveryMethod ?? null
    })
    .select('id')
    .single();
  if (cErr) {
    console.error(`[ERR] ${seed.name}:`, cErr.message);
    continue;
  }
  created += 1;

  for (const ses of seed.sessions) {
    const { data: sessionRow, error: sErr } = await s
      .from('sessions')
      .insert({
        cohort_id: cohort.id,
        session_date: ses.date,
        session_end_date: ses.endDate ?? null,
        title: ses.title
      })
      .select('id')
      .single();
    if (sErr) {
      console.error(`  [ERR] ${seed.name} ${ses.title}:`, sErr.message);
      continue;
    }
    sessionCount += 1;

    for (const insName of ses.instructors) {
      const insId = byName.get(insName);
      if (!insId) {
        console.warn(`  [WARN] instructor not found: ${insName}`);
        continue;
      }
      const { error: siErr } = await s
        .from('session_instructors')
        .insert({ session_id: sessionRow.id, instructor_id: insId, role: 'main' });
      if (siErr) console.error(`  [ERR] session_instructors:`, siErr.message);
    }
  }
  console.log(`[OK] ${seed.name} (sessions: ${seed.sessions.length})`);
}

console.log(`\n완료 — 생성 ${created}, 스킵 ${skipped}, sessions ${sessionCount}`);
