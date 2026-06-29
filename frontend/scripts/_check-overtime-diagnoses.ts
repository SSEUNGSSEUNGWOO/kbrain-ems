import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Row = {
  id: string;
  started_at: string | null;
  submitted_at: string | null;
  responses: Record<string, string> | null;
  diagnoses: {
    title: string;
    type: string;
    duration_minutes: number;
    cohorts: { name: string } | null;
  } | null;
  students: {
    name: string;
    department: string | null;
    organizations: { name: string } | null;
  } | null;
};

async function main() {
  const { data, error } = await supabase
    .from('diagnosis_responses')
    .select(
      `id, started_at, submitted_at, responses,
       diagnoses(title, type, duration_minutes, cohorts(name)),
       students(name, department, organizations(name))`
    )
    .not('started_at', 'is', null)
    .is('submitted_at', null)
    .returns<Row[]>();

  if (error) {
    console.error('query error:', error.message);
    process.exit(1);
  }

  const now = Date.now();
  const overtime = (data ?? []).filter((r) => {
    if (!r.started_at || !r.diagnoses) return false;
    const elapsedMs = now - new Date(r.started_at).getTime();
    return elapsedMs >= r.diagnoses.duration_minutes * 60_000;
  });

  console.log(`\n전체 미제출(started_at 있음): ${data?.length ?? 0}건`);
  console.log(`시간 초과: ${overtime.length}건\n`);

  if (overtime.length === 0) {
    console.log('시간 초과 미제출 응답 없음.');
    return;
  }

  // 기수·진단별로 묶어서 출력
  const byCohort = new Map<string, Row[]>();
  for (const r of overtime) {
    const key = `${r.diagnoses?.cohorts?.name ?? '?'} · ${r.diagnoses?.title ?? '?'} (${r.diagnoses?.type ?? '?'})`;
    const arr = byCohort.get(key) ?? [];
    arr.push(r);
    byCohort.set(key, arr);
  }

  for (const [key, rows] of byCohort) {
    console.log(`\n=== ${key} — ${rows.length}명 ===`);
    rows.sort((a, b) =>
      (a.students?.name ?? '').localeCompare(b.students?.name ?? '', 'ko')
    );
    for (const r of rows) {
      const startedAt = new Date(r.started_at!);
      const elapsedMin = Math.floor((now - startedAt.getTime()) / 60_000);
      const answered = r.responses
        ? Object.values(r.responses).filter((v) => (v ?? '').toString().trim().length > 0).length
        : 0;
      console.log(
        `  - ${r.students?.name ?? '(미지정)'} (${r.students?.organizations?.name ?? '-'} / ${r.students?.department ?? '-'}) | ` +
          `시작 ${startedAt.toLocaleString('ko-KR')} · ${elapsedMin}분 경과 · 답안 ${answered}개`
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
