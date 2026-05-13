// 모집 라운드 5개 시드.
// 출처: docs/EMS/260511_교육 일정 세부표.hwp 표 헤더 추출.
// cohort 매핑은 별도(운영자 UI 또는 후속 스크립트)로 처리한다.
//
// 멱등성: round_no UNIQUE 제약 사용. 이미 있으면 update.
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

type RoundSeed = {
  round_no: number;
  label: string;
  application_start_at: string;
  application_end_at: string;
  selection_at: string;
  announce_at: string;
  note: string;
};

const ROUNDS: RoundSeed[] = [
  {
    round_no: 1,
    label: '1차 모집',
    application_start_at: '2026-05-15',
    application_end_at: '2026-05-22',
    selection_at: '2026-05-25',
    announce_at: '2026-05-27',
    note: '챔피언 그린 1회차 / 챔피언 블루 1회차 / 일반 ①·②'
  },
  {
    round_no: 2,
    label: '2차 모집',
    application_start_at: '2026-05-15',
    application_end_at: '2026-05-29',
    selection_at: '2026-06-04',
    announce_at: '2026-06-08',
    note: '5월 교육과정'
  },
  {
    round_no: 3,
    label: '3차 모집',
    application_start_at: '2026-06-08',
    application_end_at: '2026-06-19',
    selection_at: '2026-06-24',
    announce_at: '2026-06-26',
    note: '6월 교육과정'
  },
  {
    round_no: 4,
    label: '4차 모집',
    application_start_at: '2026-07-06',
    application_end_at: '2026-07-16',
    selection_at: '2026-07-22',
    announce_at: '2026-07-24',
    note: '7월 교육과정'
  },
  {
    round_no: 5,
    label: '5차 모집',
    application_start_at: '2026-08-10',
    application_end_at: '2026-08-21',
    selection_at: '2026-08-26',
    announce_at: '2026-08-28',
    note: '8월 교육과정'
  }
];

let created = 0;
let updated = 0;

for (const r of ROUNDS) {
  const { data: existing } = await s
    .from('recruitment_rounds')
    .select('id')
    .eq('round_no', r.round_no)
    .maybeSingle();

  if (existing) {
    const { error } = await s
      .from('recruitment_rounds')
      .update({
        label: r.label,
        application_start_at: r.application_start_at,
        application_end_at: r.application_end_at,
        selection_at: r.selection_at,
        announce_at: r.announce_at,
        note: r.note
      })
      .eq('id', existing.id);
    if (error) {
      console.error(`[ERR] update round ${r.round_no}:`, error.message);
      continue;
    }
    updated += 1;
    console.log(
      `[UPD] ${r.label}  ${r.application_start_at}~${r.application_end_at}  선발 ${r.selection_at}  통보 ${r.announce_at}  (${r.note})`
    );
  } else {
    const { error } = await s.from('recruitment_rounds').insert(r);
    if (error) {
      console.error(`[ERR] insert round ${r.round_no}:`, error.message);
      continue;
    }
    created += 1;
    console.log(
      `[NEW] ${r.label}  ${r.application_start_at}~${r.application_end_at}  선발 ${r.selection_at}  통보 ${r.announce_at}  (${r.note})`
    );
  }
}

console.log(`\n완료 — 생성 ${created}, 갱신 ${updated}`);
