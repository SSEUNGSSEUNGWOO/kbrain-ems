// 자기주도형 수행평가 명단(외부 사이트 export .xls) → students 등록.
//
// 파일 포맷: NO / 아이디 / 이름 / 전화번호 / 이메일 / 소속기관구분 / 소속기관 / 설문분류
//            + 사전설문 24문항. 1인 1행(사전설문).
// 설문항목 매핑 (자기주도형 1회차 등록분과 동일 규칙):
//   3(서술형) → department, 6(서술형) → job_role(번호 접두 제거), 7(단일선택) → job_title
//
// 사용법:
//   bun run scripts/import-selfdirected-roster.ts [--dry-run]

import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const DRY = process.argv.includes('--dry-run');

const DIR = 'C:/Users/USER/Documents/카카오톡 받은 파일/';
const TARGETS = [
  { label: '그린 자기주도형 2회차', cohortId: '8269115f-48cd-43f4-a907-7d688ed0fa54',
    file: '2026년 AI 챔피언 그린(초급) 수행평가 2회차 (8월 26일, 자기주도형).xls' },
  { label: '블루 자기주도형 2회차', cohortId: 'd721d143-c950-4e0b-84a7-47e84a9271f2',
    file: '2026년 AI 챔피언 블루(중급) 수행평가 2회차 (8월 26일, 자기주도형).xls' }
];
const EXAM_DATE = '2026-08-26';
// 서술형 답이 전부 "테스트"인 운영진 확인용 행 — 제외할 이메일을 env로 지정 (쉼표 구분)
const TEST_EMAILS = new Set(
  (process.env.IMPORT_TEST_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)
);

const S = (v: unknown) => String(v ?? '').trim();
const stripNo = (v: string) => v.replace(/^\s*\d+\.\s*/, '').trim();
const digits = (v: string | null) => (v ?? '').replace(/\D/g, '');

// 설문항목 2(소속기관구분) → applicants.category (기존 표기 규칙에 맞춤)
function toCategory(v: string): string | null {
  const s = stripNo(v);
  if (s.startsWith('중앙행정기관')) return '중앙부처';
  if (s.startsWith('광역자치단체')) return '광역지자체';
  if (s.startsWith('기초자치단체')) return '기초지자체';
  if (s.startsWith('공공기관')) return '공공기관';
  if (s.startsWith('교육행정기관')) return '교육행정기관';
  if (s.startsWith('기타')) return '기타';
  return null;
}

async function run() {
  console.log(DRY ? '[--dry-run] DB 쓰기 없음\n' : '');
  // 기존 organizations 로드 (이름 → id)
  const orgMap = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('organizations').select('id, name').range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const o of data) orgMap.set(o.name.trim(), o.id);
    if (data.length < 1000) break;
  }
  console.log(`기존 기관 ${orgMap.size}개 로드`);

  for (const t of TARGETS) {
    const wb = XLSX.readFile(DIR + t.file);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: null });
    const cols = Object.keys(rows[0] ?? {});
    // 정확 일치 우선 — '소속기관' 을 부분일치로 찾으면 빈 컬럼인 '소속기관구분' 이 먼저 걸린다
    const col = (frag: string) => {
      const norm = (s: string) => s.replace(/\s+/g, '');
      const target = norm(frag);
      return cols.find((c) => norm(c) === target) ?? cols.find((c) => norm(c).includes(target))!;
    };
    const C = {
      name: col('이름'), phone: col('전화번호'), email: col('이메일'), org: col('소속기관'),
      cat: col('설문항목2'), dept: col('설문항목3'), role: col('설문항목6'), title: col('설문항목7')
    };

    const skipped: string[] = [];
    const parsed = rows.map((r) => ({
      name: S(r[C.name]),
      phone: S(r[C.phone]) || null,
      email: S(r[C.email]).toLowerCase() || null,
      orgName: S(r[C.org]),
      department: S(r[C.dept]) || null,
      job_role: stripNo(S(r[C.role])) || null,
      job_title: S(r[C.title]) || null,
      category: toCategory(S(r[C.cat]))
    })).filter((p) => {
      if (!p.name) return false;
      if (p.email && TEST_EMAILS.has(p.email)) { skipped.push(`${p.name}(${p.email})`); return false; }
      return true;
    });

    // 신규 기관 생성
    const needOrgs = [...new Set(parsed.map((p) => p.orgName).filter(Boolean))].filter((n) => !orgMap.has(n));
    console.log(`\n■ ${t.label} — ${parsed.length}명 (제외 ${skipped.length}${skipped.length ? ': ' + skipped.join(', ') : ''})`);
    console.log(`   신규 기관 ${needOrgs.length}개${needOrgs.length ? ' 예: ' + needOrgs.slice(0, 5).join(', ') : ''}`);
    if (!DRY && needOrgs.length) {
      for (let i = 0; i < needOrgs.length; i += 200) {
        const chunk = needOrgs.slice(i, i + 200).map((name) => ({ name }));
        const { data, error } = await sb.from('organizations').insert(chunk).select('id, name');
        if (error) throw new Error(error.message);
        for (const o of data ?? []) orgMap.set(o.name.trim(), o.id);
      }
    }

    // students.applicant_id 는 NOT NULL — 기존 지원자를 이메일·전화로 재사용하고 없으면 새로 만든다
    const byEmail = new Map<string, string>();
    const byPhone = new Map<string, string>();
    for (let from = 0; ; from += 1000) {
      const { data } = await sb.from('applicants').select('id, email, phone, personal_email').range(from, from + 999);
      if (!data || data.length === 0) break;
      for (const a of data) {
        for (const e of [a.email, a.personal_email]) {
          const k = S(e).toLowerCase();
          if (k && !byEmail.has(k)) byEmail.set(k, a.id);
        }
        const p = digits(a.phone);
        if (p && !byPhone.has(p)) byPhone.set(p, a.id);
      }
      if (data.length < 1000) break;
    }
    const resolved = parsed.map((p) => ({
      p, applicantId: (p.email ? byEmail.get(p.email) : undefined) ?? (p.phone ? byPhone.get(digits(p.phone)) : undefined) ?? null
    }));
    const reuse = resolved.filter((r) => r.applicantId).length;
    const noOrgCnt = parsed.filter((p) => p.orgName && !orgMap.has(p.orgName)).length;
    console.log(`   지원자 재사용 ${reuse} / 신규 생성 ${resolved.length - reuse}`);
    console.log(`   기관 미매칭 ${noOrgCnt}명 / 전화 결측 ${parsed.filter((p) => !p.phone).length} / 이메일 결측 ${parsed.filter((p) => !p.email).length}`);

    if (DRY) { console.log(`   [dry-run] 저장 예정 ${parsed.length}명`); continue; }

    for (const r of resolved) {
      if (r.applicantId) continue;
      const { data, error } = await sb.from('applicants').insert({
        name: r.p.name, email: r.p.email, phone: r.p.phone,
        organization_id: r.p.orgName ? (orgMap.get(r.p.orgName) ?? null) : null,
        department: r.p.department, job_title: r.p.job_title, job_role: r.p.job_role, category: r.p.category
      }).select('id').single();
      if (error) throw new Error(error.message);
      r.applicantId = data.id;
    }
    const payload = resolved.map((r) => ({
      cohort_id: t.cohortId, applicant_id: r.applicantId!,
      organization_id: r.p.orgName ? (orgMap.get(r.p.orgName) ?? null) : null,
      name: r.p.name, email: r.p.email, phone: r.p.phone,
      department: r.p.department, job_title: r.p.job_title, job_role: r.p.job_role
    }));

    const { count: before } = await sb.from('students').select('id', { count: 'exact', head: true }).eq('cohort_id', t.cohortId);
    if ((before ?? 0) > 0) { console.log(`   ⚠ 이미 학생 ${before}명 존재 — 중복 방지를 위해 건너뜀`); continue; }
    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await sb.from('students').insert(payload.slice(i, i + 200));
      if (error) throw new Error(error.message);
    }
    const { count: after } = await sb.from('students').select('id', { count: 'exact', head: true }).eq('cohort_id', t.cohortId);
    console.log(`   저장 완료 → 학생 ${after}명`);

    const { error: cErr } = await sb.from('cohorts')
      .update({ started_at: EXAM_DATE, ended_at: EXAM_DATE }).eq('id', t.cohortId);
    if (cErr) throw new Error(cErr.message);
    console.log(`   일정 설정 ${EXAM_DATE}`);
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
