// 5/7자 AI 챔피언 고급 1회차 만족도 CSV → 전문인재 26-1기·26-2기 두 설문에 동일 적재.
// 기존 응답 wipe → CSV 26건 익명 응답 insert.
//
// 실행: bun run scripts/import-ai-champion-week1.ts
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

const SURVEY_IDS = [
  'cf21aaa7-055c-4653-accd-2113604f9980', // 전문인재 26-1기
  '813e9d10-1b48-4964-ac23-567052f1c13d' // 전문인재 26-2기
];

const CSV_PATH = path.resolve(__dirname, 'ai-champion-week1.csv');

// RFC4180 lite — 큰따옴표 인용 + "" escape 처리
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cur);
      cur = '';
    } else if (c === '\n') {
      row.push(cur);
      cur = '';
      rows.push(row);
      row = [];
    } else if (c !== '\r') {
      cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

// "2026/05/07 5:34:13 오후 GMT+9" → ISO
function parseKoreanTimestamp(ts: string): string {
  const m = ts.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(오전|오후)\s+GMT([+-]\d+)/);
  if (!m) throw new Error('Bad timestamp: ' + ts);
  const [, y, mo, d, h, mi, sec, ampm, tz] = m;
  let hour = parseInt(h);
  if (ampm === '오후' && hour < 12) hour += 12;
  if (ampm === '오전' && hour === 12) hour = 0;
  const offset = parseInt(tz);
  const sign = offset >= 0 ? '+' : '-';
  const offsetStr = `${sign}${String(Math.abs(offset)).padStart(2, '0')}:00`;
  return `${y}-${mo}-${d}T${String(hour).padStart(2, '0')}:${mi}:${sec}${offsetStr}`;
}

const csv = fs.readFileSync(CSV_PATH, 'utf8');
const rows = parseCSV(csv);
const dataRows = rows.slice(1).filter((r) => r.length > 1 && r[0].trim().length > 0);
console.log(`CSV parsed: ${dataRows.length} data rows`);

for (const surveyId of SURVEY_IDS) {
  console.log(`\n=== survey ${surveyId} ===`);

  // 문항 가져오기 (question_no 1~27)
  const { data: questions, error: qErr } = await s
    .from('survey_questions')
    .select('id, question_no, type')
    .eq('survey_id', surveyId)
    .order('question_no');
  if (qErr || !questions) {
    console.error('questions:', qErr);
    continue;
  }
  const byNo = new Map(questions.map((q) => [q.question_no, q]));

  // 기존 응답 wipe
  const { error: delErr } = await s.from('survey_responses').delete().eq('survey_id', surveyId);
  if (delErr) {
    console.error('delete:', delErr);
    continue;
  }
  console.log('기존 응답 삭제');

  // CSV row → insert payload
  const inserts = dataRows.map((cells) => {
    const ts = parseKoreanTimestamp(cells[0]);
    const responses: Record<string, number | string> = {};
    for (let qNo = 1; qNo <= 27; qNo++) {
      const cell = cells[qNo] ?? '';
      const trimmed = cell.trim();
      if (trimmed.length === 0) continue;
      const q = byNo.get(qNo);
      if (!q) continue;
      if (q.type === 'likert10') {
        const v = parseInt(trimmed);
        if (!isNaN(v) && v >= 1 && v <= 10) responses[q.id] = v;
      } else if (q.type === 'text') {
        responses[q.id] = trimmed;
      }
    }
    return {
      survey_id: surveyId,
      student_id: null,
      responses,
      submitted_at: ts
    };
  });

  const { error: insErr } = await s.from('survey_responses').insert(inserts);
  if (insErr) {
    console.error('insert:', insErr);
    continue;
  }
  console.log(`${inserts.length}건 적재 완료`);
}

console.log('\n✅ 임포트 완료');
