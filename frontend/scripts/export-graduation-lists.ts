/**
 * AI 행정 융합·블루 1회차·블루 2회차 수료자 명단 xlsx 생성.
 * - 행정: 출석 전 회차 = 수료
 * - 블루: 채점표에 이름/이메일 있음 = 수료
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const OUT_DIR = 'C:/kbrain/수료자명단';

type Row = {
  no: number;
  name: string;
  organization: string;
  category: string;
  phone: string;
  email: string;
  status: '수료' | '미수료';
  reason?: string;
};

async function writeXlsx(title: string, filename: string, rows: Row[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(title);
  ws.columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: '이름', key: 'name', width: 12 },
    { header: '소속기관구분', key: 'category', width: 14 },
    { header: '소속기관', key: 'organization', width: 34 },
    { header: '전화번호', key: 'phone', width: 16 },
    { header: '이메일', key: 'email', width: 28 },
    { header: '수료여부', key: 'status', width: 10 },
    { header: '비고', key: 'reason', width: 24 }
  ];
  // 헤더 스타일
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
  ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  for (const r of rows) ws.addRow(r);
  // 미수료 행은 붉게
  for (let i = 2; i <= rows.length + 1; i++) {
    const status = ws.getCell(i, 7).value;
    if (status === '미수료') {
      ws.getRow(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    }
  }
  const outPath = `${OUT_DIR}/${filename}`;
  await wb.xlsx.writeFile(outPath);
  console.log(`✓ ${outPath}  (${rows.length}건)`);
}

(async () => {
  // ============= AI 행정 융합 =============
  {
    const cid = '6d07ff5d-bf70-419d-b2d8-66727b92a407';
    const { data: ses } = await s.from('sessions').select('id').eq('cohort_id', cid);
    const sessIds = (ses ?? []).map((x) => x.id);
    const { data: stus } = await s.from('students')
      .select('id, name, phone, applicant_id, applicants(email, personal_email, category), organizations(name)')
      .eq('cohort_id', cid).order('name');
    // 취소 관련 status 학생 제외 (same_day_cancel, cancel_confirmed, cancel_notice, withdrawn, rejected)
    const applicantIds = (stus ?? []).map((x) => x.applicant_id).filter((x): x is string => Boolean(x));
    const cancelledApplicants = new Set<string>();
    if (applicantIds.length > 0) {
      const { data: apps } = await s.from('applications')
        .select('applicant_id, status').eq('cohort_id', cid).in('applicant_id', applicantIds);
      for (const a of apps ?? []) {
        if (['same_day_cancel','cancel_confirmed','cancel_notice','withdrawn','rejected'].includes(a.status)) {
          cancelledApplicants.add(a.applicant_id);
        }
      }
    }
    const { data: attn } = await s.from('attendance_records').select('student_id, status').in('session_id', sessIds);
    const cntBy: Record<string, number> = {};
    for (const r of attn ?? []) {
      if (['present', 'late', 'early_leave'].includes(r.status)) {
        cntBy[r.student_id] = (cntBy[r.student_id] ?? 0) + 1;
      }
    }
    const rows: Row[] = [];
    let no = 0;
    for (const st of (stus ?? []).filter((x) => !x.name?.startsWith('테스트') && !cancelledApplicants.has(x.applicant_id ?? ''))) {
      no++;
      const cnt = cntBy[st.id] ?? 0;
      const isGrad = cnt === sessIds.length;
      const ap = (st as any).applicants;
      rows.push({
        no,
        name: st.name!,
        category: ap?.category ?? '',
        organization: (st as any).organizations?.name ?? '',
        phone: st.phone ?? '',
        email: ap?.personal_email || ap?.email || '',
        status: isGrad ? '수료' : '미수료',
        reason: isGrad ? '' : `출석 ${cnt}/${sessIds.length}회`
      });
    }
    await writeXlsx('AI 행정 융합 수료자', 'AI행정융합_수료자명단.xlsx', rows);
  }

  // ============= 블루 1·2회차 =============
  const examData = JSON.parse(fs.readFileSync('C:/Users/USER/AppData/Local/Temp/blue_exam.json', 'utf8'));
  for (const [label, key, cid, fname] of [
    ['AI 챔피언 블루 1회차', 'blue1', 'b5149035-b7d2-440e-9016-6c2997912b0e', 'AI챔피언블루1회차_수료자명단.xlsx'],
    ['AI 챔피언 블루 2회차', 'blue2', '06781a96-9229-42ec-b59c-89ce11378d3e', 'AI챔피언블루2회차_수료자명단.xlsx']
  ] as const) {
    const applicants: { name: string; email: string }[] = examData[key];
    const applicantNames = new Set(applicants.map((a) => a.name));
    const applicantEmails = new Set(applicants.filter((a) => a.email).map((a) => a.email));
    const { data: stus } = await s.from('students')
      .select('id, name, phone, applicant_id, applicants(email, personal_email, category), organizations(name)')
      .eq('cohort_id', cid).order('name');
    // 취소 관련 status 학생 제외 (same_day_cancel, cancel_confirmed, cancel_notice, withdrawn, rejected)
    const applicantIds = (stus ?? []).map((x) => x.applicant_id).filter((x): x is string => Boolean(x));
    const cancelledApplicants = new Set<string>();
    if (applicantIds.length > 0) {
      const { data: apps } = await s.from('applications')
        .select('applicant_id, status').eq('cohort_id', cid).in('applicant_id', applicantIds);
      for (const a of apps ?? []) {
        if (['same_day_cancel','cancel_confirmed','cancel_notice','withdrawn','rejected'].includes(a.status)) {
          cancelledApplicants.add(a.applicant_id);
        }
      }
    }
    const rows: Row[] = [];
    let no = 0;
    for (const st of (stus ?? []).filter((x) => !x.name?.startsWith('테스트') && !cancelledApplicants.has(x.applicant_id ?? ''))) {
      const ap = (st as any).applicants;
      const em = String(ap?.email ?? '').toLowerCase();
      const isGrad = applicantNames.has(st.name!) || (em && applicantEmails.has(em));
      if (!isGrad) continue; // 미수료(완전 이탈)는 명단에서 제외
      no++;
      rows.push({
        no,
        name: st.name!,
        category: ap?.category ?? '',
        organization: (st as any).organizations?.name ?? '',
        phone: st.phone ?? '',
        email: ap?.personal_email || ap?.email || '',
        status: '수료'
      });
    }
    await writeXlsx(label, fname, rows);
  }

  // ============= 노코드 AI 서비스 구현 =============
  {
    const cid = '40cef9d6-17e9-4c40-bb09-723d41daa0d5';
    const { data: stus } = await s.from('students')
      .select('id, name, phone, applicant_id, applicants(email, personal_email, category), organizations(name)')
      .eq('cohort_id', cid).order('name');
    const applicantIds = (stus ?? []).map((x) => x.applicant_id).filter((x): x is string => Boolean(x));
    const cancelledApplicants = new Set<string>();
    if (applicantIds.length > 0) {
      const { data: apps } = await s.from('applications')
        .select('applicant_id, status').eq('cohort_id', cid).in('applicant_id', applicantIds);
      for (const a of apps ?? []) {
        if (['same_day_cancel','cancel_confirmed','cancel_notice','withdrawn','rejected'].includes(a.status)) {
          cancelledApplicants.add(a.applicant_id);
        }
      }
    }
    const rows: Row[] = [];
    let no = 0;
    for (const st of (stus ?? []).filter((x) => !x.name?.startsWith('테스트') && !cancelledApplicants.has(x.applicant_id ?? ''))) {
      no++;
      const ap = (st as any).applicants;
      rows.push({
        no,
        name: st.name!,
        category: ap?.category ?? '',
        organization: (st as any).organizations?.name ?? '',
        phone: st.phone ?? '',
        email: ap?.personal_email || ap?.email || '',
        status: '수료'
      });
    }
    await writeXlsx('노코드 AI 서비스 구현 수료자', '노코드AI서비스구현_수료자명단.xlsx', rows);
  }
})();
