/**
 * 기관맞춤형 인증평가·사전접속테스트 일정 캘린더 이벤트 등록.
 * (title, event_date, category, capacity)
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const EVENTS: {
  title: string;
  event_date: string;
  event_time?: string | null;
  category: string;
  capacity?: number | null;
}[] = [
  // 인증평가 (그린·블루 각 4개월)
  { title: '그린(중급) 기관맞춤형 인증평가 7월', event_date: '2026-07-30', category: '인증평가', capacity: 100 },
  { title: '그린(중급) 기관맞춤형 인증평가 8월', event_date: '2026-08-27', category: '인증평가', capacity: 100 },
  { title: '그린(중급) 기관맞춤형 인증평가 9월', event_date: '2026-09-29', category: '인증평가', capacity: 100 },
  { title: '그린(중급) 기관맞춤형 인증평가 10월', event_date: '2026-10-27', category: '인증평가', capacity: 100 },
  { title: '블루(고급) 기관맞춤형 인증평가 7월', event_date: '2026-07-30', category: '인증평가', capacity: 100 },
  { title: '블루(고급) 기관맞춤형 인증평가 8월', event_date: '2026-08-27', category: '인증평가', capacity: 100 },
  { title: '블루(고급) 기관맞춤형 인증평가 9월', event_date: '2026-09-30', category: '인증평가', capacity: 100 },
  { title: '블루(고급) 기관맞춤형 인증평가 10월', event_date: '2026-10-28', category: '인증평가', capacity: 100 },

  // 사전접속테스트 (그린·블루 공통, 월 1회)
  { title: '사전접속테스트 (7월)', event_date: '2026-07-23', event_time: '10:00', category: '사전접속테스트' },
  { title: '사전접속테스트 (8월)', event_date: '2026-08-13', event_time: '10:00', category: '사전접속테스트' },
  { title: '사전접속테스트 (9월)', event_date: '2026-09-22', event_time: '10:00', category: '사전접속테스트' },
  { title: '사전접속테스트 (10월)', event_date: '2026-10-22', event_time: '10:00', category: '사전접속테스트' }
];

(async () => {
  let created = 0, skipped = 0;
  for (const e of EVENTS) {
    const { data: existing } = await s
      .from('calendar_events')
      .select('id')
      .eq('title', e.title)
      .eq('event_date', e.event_date)
      .maybeSingle();
    if (existing) {
      console.log(`  · SKIP ${e.title} (${e.event_date})`);
      skipped++;
      continue;
    }
    const { error } = await s.from('calendar_events').insert(e);
    if (error) {
      console.log(`  ✗ ERR ${e.title}: ${error.message}`);
      continue;
    }
    console.log(`  ✓ ${e.title} (${e.event_date}${e.event_time ? ` ${e.event_time}` : ''})`);
    created++;
  }
  console.log(`\n완료: 신규 ${created}, 스킵 ${skipped}`);
})();
