// 일회성 — 사전학습 수료 명단 2개 (.xls) 직접 upsert
// lms-import-dialog 로직 복제. 수료=Y만 저장, course_code 미리 지정.
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TARGETS = [
  {
    file: 'C:\\Users\\USER\\Downloads\\수료내역_260623_2026년 ① AI 리터러시와 업무 활용.xls',
    courseCode: 'ai_literacy',
    courseLabel: 'AI 리터러시'
  },
  {
    file: 'C:\\Users\\USER\\Downloads\\수료내역_260623_2026년 ② 데이터 리터러시.xls',
    courseCode: 'data_literacy',
    courseLabel: '데이터분석 리터러시'
  }
];

const normPhone = (s: string | undefined | null) => (s ?? '').replace(/[^\d]/g, '');
const normEmail = (s: string | undefined | null) => (s ?? '').trim().toLowerCase();

function excelSerialToDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    const ms = (v - 25569) * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m1 = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}`;
  const mYY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (mYY) {
    const yy = mYY[3];
    const yyyy = yy.length === 2 ? `20${yy.padStart(2, '0')}` : yy;
    return `${yyyy}-${mYY[1].padStart(2, '0')}-${mYY[2].padStart(2, '0')}`;
  }
  const m2 = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return null;
}

type LmsRow = {
  course_code: string;
  course_name: string;
  name: string;
  phone: string | null;
  email: string | null;
  completed: boolean;
  completed_at: string | null;
  certificate_no: string | null;
};

async function importOne(file: string, courseCode: string, courseLabel: string) {
  console.log(`\n${'='.repeat(80)}\n→ ${path.basename(file)}\n  course_code=${courseCode}\n${'='.repeat(80)}`);

  const buf = fs.readFileSync(file);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  const lmsRows: LmsRow[] = [];
  let totalYes = 0;
  for (const r of rows) {
    const completed = String(r['수료'] ?? '').trim().toUpperCase() === 'Y';
    if (!completed) continue;
    totalYes++;
    const name = String(r['이름'] ?? '').trim();
    const phone = normPhone(String(r['휴대폰'] ?? ''));
    const email = normEmail(String(r['이메일'] ?? ''));
    lmsRows.push({
      course_code: courseCode,
      course_name: String(r['과정'] ?? courseLabel).trim(),
      name,
      phone: phone || null,
      email: email || null,
      completed: true,
      completed_at: excelSerialToDate(r['수료일']),
      certificate_no: String(r['수료번호'] ?? '').trim() || null
    });
  }
  console.log(`  수료=Y rows: ${totalYes}`);

  // 같은 batch 내 (course_code, certificate_no) 중복 제거
  const certDedup = new Map<string, LmsRow>();
  const withoutCert: LmsRow[] = [];
  for (const r of lmsRows) {
    if (r.certificate_no) certDedup.set(`${r.course_code}::${r.certificate_no}`, r);
    else withoutCert.push(r);
  }
  const withCert = [...certDedup.values()];
  console.log(`  withCert: ${withCert.length}, withoutCert: ${withoutCert.length}`);

  let inserted = 0;
  let updated = 0;

  if (withCert.length > 0) {
    // chunk by 500 to avoid PostgREST payload limits
    const CHUNK = 500;
    for (let i = 0; i < withCert.length; i += CHUNK) {
      const slice = withCert.slice(i, i + CHUNK);
      const { data, error } = (await supabase
        .from('lms_completions')
        .upsert(slice, { onConflict: 'course_code,certificate_no' })
        .select('id, created_at, updated_at')) as unknown as {
        data: { id: string; created_at: string; updated_at: string }[] | null;
        error: { message: string } | null;
      };
      if (error) throw new Error(`upsert: ${error.message}`);
      for (const r of data ?? []) {
        if (r.created_at === r.updated_at) inserted++;
        else updated++;
      }
      console.log(`  upserted ${i + slice.length}/${withCert.length}`);
    }
  }

  if (withoutCert.length > 0) {
    const { data, error } = (await supabase
      .from('lms_completions')
      .insert(withoutCert)
      .select('id')) as unknown as {
      data: { id: string }[] | null;
      error: { message: string } | null;
    };
    if (error) throw new Error(`insert noCert: ${error.message}`);
    inserted += (data ?? []).length;
  }

  console.log(`  ✓ inserted=${inserted}  updated=${updated}`);
  return { totalYes, inserted, updated };
}

async function main() {
  const summary: { course: string; total: number; inserted: number; updated: number }[] = [];
  for (const t of TARGETS) {
    const r = await importOne(t.file, t.courseCode, t.courseLabel);
    summary.push({ course: t.courseCode, total: r.totalYes, inserted: r.inserted, updated: r.updated });
  }
  console.log('\n' + '='.repeat(80) + '\nSUMMARY\n' + '='.repeat(80));
  for (const s of summary) {
    console.log(`  ${s.course.padEnd(16)} 수료 ${s.total} → 신규 ${s.inserted} / 갱신 ${s.updated}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
