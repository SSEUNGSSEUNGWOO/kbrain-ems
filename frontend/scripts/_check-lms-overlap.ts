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
  { file: 'C:\\Users\\USER\\Downloads\\수료내역_260623_2026년 ① AI 리터러시와 업무 활용.xls', code: 'ai_literacy' },
  { file: 'C:\\Users\\USER\\Downloads\\수료내역_260623_2026년 ② 데이터 리터러시.xls', code: 'data_literacy' }
];

const normPhone = (s: string) => s.replace(/[^\d]/g, '');
const normEmail = (s: string) => s.trim().toLowerCase();

async function check(file: string, code: string) {
  console.log(`\n${'='.repeat(80)}\n${code}\n${'='.repeat(80)}`);
  const buf = fs.readFileSync(file);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  const fileCerts = new Set<string>();
  const filePhones = new Set<string>();
  const fileEmails = new Set<string>();
  for (const r of rows) {
    if (String(r['수료'] ?? '').trim().toUpperCase() !== 'Y') continue;
    const cert = String(r['수료번호'] ?? '').trim();
    const phone = normPhone(String(r['휴대폰'] ?? ''));
    const email = normEmail(String(r['이메일'] ?? ''));
    if (cert) fileCerts.add(cert);
    if (phone) filePhones.add(phone);
    if (email) fileEmails.add(email);
  }
  console.log(`  file: certs=${fileCerts.size}, phones=${filePhones.size}, emails=${fileEmails.size}`);

  // DB에서 이 course_code 의 전체 cert/phone/email 가져오기
  type Row = { certificate_no: string | null; phone: string | null; email: string | null; created_at: string };
  const all: Row[] = [];
  for (let from = 0; from < 1_000_000; from += 1000) {
    const res = (await supabase
      .from('lms_completions')
      .select('certificate_no, phone, email, created_at')
      .eq('course_code', code)
      .range(from, from + 999)) as unknown as { data: Row[] | null };
    const batch = res.data ?? [];
    all.push(...batch);
    if (batch.length < 1000) break;
  }
  const today = new Date().toISOString().slice(0, 10);
  const beforeToday = all.filter((r) => !r.created_at.startsWith(today));
  console.log(`  DB total=${all.length}, DB pre-today=${beforeToday.length}`);

  const dbCerts = new Set(beforeToday.map((r) => r.certificate_no).filter((x): x is string => !!x));
  const dbPhones = new Set(beforeToday.map((r) => normPhone(r.phone ?? '')).filter(Boolean));
  const dbEmails = new Set(beforeToday.map((r) => normEmail(r.email ?? '')).filter(Boolean));

  let certOverlap = 0;
  for (const c of fileCerts) if (dbCerts.has(c)) certOverlap++;
  let phoneOverlap = 0;
  for (const p of filePhones) if (dbPhones.has(p)) phoneOverlap++;
  let emailOverlap = 0;
  for (const e of fileEmails) if (dbEmails.has(e)) emailOverlap++;

  console.log(`  overlap with DB(pre-today):`);
  console.log(`    cert_no: ${certOverlap} / ${fileCerts.size}`);
  console.log(`    phone:   ${phoneOverlap} / ${filePhones.size}`);
  console.log(`    email:   ${emailOverlap} / ${fileEmails.size}`);
}

async function main() {
  for (const t of TARGETS) await check(t.file, t.code);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
