import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error('usage: bun run scripts/_reset-exam-session.ts <token>');
  process.exit(1);
}

(async () => {
  const { data: sess } = await s.from('exam_sessions').select('id, name').eq('token', TOKEN).maybeSingle();
  if (!sess) {
    console.error(`세션 없음: ${TOKEN}`);
    process.exit(1);
  }
  const { error: delErr, count } = await s
    .from('exam_responses')
    .delete({ count: 'exact' })
    .eq('session_id', sess.id);
  if (delErr) throw delErr;
  const { error: upErr } = await s
    .from('exam_sessions')
    .update({
      started_at: null,
      submitted_at: null,
      current_order_no: null,
      auto_score: null,
      manual_score: null,
      total_score: null,
      status: 'in_progress',
      browser_events: [],
      section_progress: {},
      flagged_question_ids: []
    })
    .eq('id', sess.id);
  if (upErr) throw upErr;
  console.log(`✓ ${sess.name} 세션 리셋 완료 (응답 ${count ?? 0}건 삭제)`);
  console.log(`  URL: /exam/${TOKEN}`);
})();
