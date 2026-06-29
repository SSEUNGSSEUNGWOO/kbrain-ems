// 3개 cohort 파일 신청자 vs DB applications 비교 — 누락자 찾기.
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
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

const TARGETS = [
  {
    file:
      'C:\\Dev\\새 폴더\\6월 26일 18시 마감된 신청자 내역 파일\\(260626_1800) 2026년 AI 챔피언 그린(초급) 종합과정 3회차.xls',
    cohortId: 'a58022fc-324a-44cb-b418-91f008e7f1a0',
    cohortName: 'AI 챔피언 그린 3회차'
  },
  {
    file:
      'C:\\Dev\\새 폴더\\6월 26일 18시 마감된 신청자 내역 파일\\(260626_1800) 2026년 AI 챔피언 그린(초급) 종합과정 4회차.xls',
    cohortId: '6ef1b2f3-3054-4933-87d9-7964842e2250',
    cohortName: 'AI 챔피언 그린 4회차'
  },
  {
    file:
      'C:\\Dev\\새 폴더\\6월 26일 18시 마감된 신청자 내역 파일\\(260626_1800) 2026년 AI 챔피언 블루(중급) 종합과정 4회차.xls',
    cohortId: '385f6497-0b85-41d9-8668-bc0c8cf8f9b6',
    cohortName: 'AI 챔피언 블루 4회차'
  }
];

function readRows(p: string): unknown[][] {
  const buf = fs.readFileSync(p);
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  } catch {
    wb = XLSX.read(buf.toString('utf8'), { type: 'string' });
  }
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: null,
    raw: false
  });
}

const norm = (s: unknown): string => (s == null ? '' : String(s).trim());

async function main() {
  for (const t of TARGETS) {
    console.log('\n' + '█'.repeat(80));
    console.log(`█  파일: ${path.basename(t.file)}`);
    console.log('█'.repeat(80));

    if (!fs.existsSync(t.file)) {
      console.log('  ❌ 파일 없음');
      continue;
    }

    // 파일 신청자
    const rows = readRows(t.file).slice(1).filter((r) => norm((r as unknown[])[1])); // 아이디 있는 행만
    const fileApplicants = rows.map((r) => ({
      id: norm((r as unknown[])[1]),
      name: norm((r as unknown[])[2]),
      phone: norm((r as unknown[])[3]),
      email: norm((r as unknown[])[4]),
      org: norm((r as unknown[])[6]),
      surveyType: norm((r as unknown[])[7])
    }));
    const preRows = fileApplicants.filter((r) => r.surveyType === '사전설문');
    console.log(`  파일: 전체 ${fileApplicants.length}행, 사전설문 ${preRows.length}명`);

    const cohort = { id: t.cohortId, name: t.cohortName };
    console.log(`  cohort: ${cohort.name} (${cohort.id})`);

    // DB applications + applicants
    type DbApp = {
      id: string;
      applicant_id: string;
      applicants: { name: string; phone: string | null; email: string | null } | null;
    };
    const { data: apps } = await supabase
      .from('applications')
      .select('id, applicant_id, applicants(name, phone, email)')
      .eq('cohort_id', cohort.id)
      .is('track_id', null)
      .returns<DbApp[]>();
    console.log(`  DB applications: ${apps?.length ?? 0}건`);

    // 누락자 찾기 — 파일 신청자 중 DB에 매칭 없는 사람
    const dbByPhone = new Map<string, DbApp>();
    const dbByEmail = new Map<string, DbApp>();
    const dbByName = new Map<string, DbApp[]>();
    for (const a of apps ?? []) {
      if (a.applicants?.phone) dbByPhone.set(a.applicants.phone, a);
      if (a.applicants?.email) dbByEmail.set(a.applicants.email.toLowerCase(), a);
      if (a.applicants?.name) {
        const arr = dbByName.get(a.applicants.name) ?? [];
        arr.push(a);
        dbByName.set(a.applicants.name, arr);
      }
    }

    const missing: typeof preRows = [];
    for (const f of preRows) {
      let hit = false;
      if (f.phone && dbByPhone.has(f.phone)) hit = true;
      else if (f.email && dbByEmail.has(f.email.toLowerCase())) hit = true;
      else if (f.name && dbByName.has(f.name)) hit = true; // 동명이인 가능성 — 약한 매칭
      if (!hit) missing.push(f);
    }

    console.log(`\n  📋 파일=${preRows.length}, DB=${apps?.length ?? 0}, 누락=${missing.length}건`);

    if (missing.length > 0) {
      console.log(`\n  ── 누락된 신청자 (파일에 있고 DB에 없음) ──`);
      for (const m of missing) {
        console.log(`    ${m.name} (${m.id}) | ${m.org} | ${m.phone} | ${m.email}`);
      }
    }

    // 역방향: DB에 있고 파일에 없는 경우 (혹시?)
    const fileByPhone = new Set(preRows.map((f) => f.phone).filter(Boolean));
    const fileByEmail = new Set(preRows.map((f) => f.email.toLowerCase()).filter(Boolean));
    const fileByName = new Set(preRows.map((f) => f.name).filter(Boolean));
    const extra: DbApp[] = [];
    for (const a of apps ?? []) {
      if (!a.applicants) continue;
      const hit =
        (a.applicants.phone && fileByPhone.has(a.applicants.phone)) ||
        (a.applicants.email && fileByEmail.has(a.applicants.email.toLowerCase())) ||
        (a.applicants.name && fileByName.has(a.applicants.name));
      if (!hit) extra.push(a);
    }
    if (extra.length > 0) {
      console.log(`\n  ── DB에 있는데 파일엔 없는 경우 (참고) ──`);
      for (const e of extra) {
        console.log(`    ${e.applicants?.name} | ${e.applicants?.phone ?? '-'} | ${e.applicants?.email ?? '-'}`);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
