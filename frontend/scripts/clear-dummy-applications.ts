// 더미 신청자·응답 데이터 삭제 (seed-dummy-applications.ts로 박은 것 정리).
// applications, application_answers는 FK CASCADE로 함께 삭제된다.
// organizations는 다른 데이터에서도 쓰일 수 있으므로 건드리지 않는다.
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

const PERSONA_NAMES = [
  '김민수',
  '이지영',
  '박철호',
  '정수연',
  '최영준',
  '강은지',
  '윤도현',
  '임서연',
  '한지훈',
  '송미라'
];

const { data: rows, error } = await s
  .from('applicants')
  .select('id, name, email')
  .in('name', PERSONA_NAMES)
  .like('email', '%@gov.kr');

if (error) {
  console.error('조회 실패:', error.message);
  process.exit(1);
}

console.log(`\n삭제 대상 applicants: ${rows?.length ?? 0}명`);
for (const r of rows ?? []) {
  console.log(`  - ${r.name} <${r.email}>`);
}

if (!rows || rows.length === 0) {
  console.log('\n삭제할 더미 데이터 없음.');
  process.exit(0);
}

const ids = rows.map((r) => r.id);
const { error: delErr } = await s.from('applicants').delete().in('id', ids);
if (delErr) {
  console.error('삭제 실패:', delErr.message);
  process.exit(1);
}

console.log(`\n[OK] ${ids.length}명 + 연결된 applications·answers 모두 삭제됨.`);
