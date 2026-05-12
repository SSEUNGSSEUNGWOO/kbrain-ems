// 일회성 — 1·2기에서 [보수교육] 회차 삭제 (전문인재 트랙용이 아니므로).
// sessions 삭제 시 session_instructors, attendance_records는 CASCADE로 자동 삭제.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const COHORT_IDS = [
  '2b265ae5-814d-404b-83e8-e1c810a62825',
  '256c5c6f-ef95-4073-8a27-a9b5fbc44316'
];

const { data, error } = await supabase
  .from('sessions')
  .delete()
  .in('cohort_id', COHORT_IDS)
  .like('title', '[보수교육]%')
  .select('id, cohort_id, title');

if (error) {
  console.error(error.message);
  process.exit(1);
}
console.log('삭제된 sessions:', data);
