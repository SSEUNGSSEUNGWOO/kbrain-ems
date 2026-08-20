/**
 * 기관맞춤형 2회차 (8/27) 신청자 명단 import — 그린 51명 + 블루 12명.
 * 1회차와 동일 규칙: applicants(전화 기준 dedup) + applications(selected) + students.
 * 파일 포맷: 외부 신청 시스템 xlsx 재저장본 (헤더 1행, 설문항목 1~8)
 *   항목1 기관구분 / 항목2 소속·부서 / 항목3 상위기관 / 항목4 사무실번호
 *   항목5 내부메일(korea.kr) / 항목6 외부메일 / 항목7 직렬 / 항목8 직급
 * dry-run 기본, --apply 로 반영.
 *
 * 사용법:
 *   bun run scripts/import-agency-round2.ts <그린.xlsx> <블루.xlsx> [--apply]
 */
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const APPLY = process.argv.includes('--apply');

const COURSE_DATE = '2026-08-27';
const COHORT_NAMES = ['AI 챔피언 그린 기관맞춤형 2회차', 'AI 챔피언 블루 기관맞춤형 2회차'];

const paths = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (paths.length !== COHORT_NAMES.length) {
  console.error('사용법: bun run scripts/import-agency-round2.ts <그린.xlsx> <블루.xlsx> [--apply]');
  process.exit(1);
}
const FILES = COHORT_NAMES.map((cohortName, i) => ({ file: paths[i], cohortName }));

const CAT_MAP: [RegExp, string][] = [
  [/중앙행정기관/, '중앙부처'],
  [/광역/, '광역지자체'],
  [/기초/, '기초지자체'],
  [/공공기관/, '공공기관'],
  [/교육/, '교육행정기관']
];
const mapCategory = (raw: string): string => {
  for (const [re, v] of CAT_MAP) if (re.test(raw)) return v;
  return raw.replace(/^\d+\.\s*/, '').trim();
};

const normPhone = (raw: string): string => {
  const d = raw.replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return raw.trim();
};

type Row = {
  name: string;
  phone: string;
  email: string; // 내부(korea.kr)
  personalEmail: string; // 외부
  org: string;
  dept: string;
  office: string;
  jobRole: string;
  jobTitle: string;
  category: string;
};

function parseFile(file: string): Row[] {
  const wb = XLSX.read(fs.readFileSync(file));
  const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: ''
  });
  const out: Row[] = [];
  for (const r of rows.slice(1)) {
    const name = String(r[2] ?? '').trim();
    if (!name || name.startsWith('테스트')) continue;
    if (String(r[7] ?? '').trim() !== '사전설문') continue;
    const topEmail = String(r[4] ?? '').trim();
    out.push({
      name,
      phone: normPhone(String(r[3] ?? '')),
      email: String(r[12] ?? '').trim() || topEmail,
      personalEmail: String(r[13] ?? '').trim() || topEmail,
      org: String(r[6] ?? '').trim(),
      dept: String(r[9] ?? '').trim(),
      office: String(r[11] ?? '').trim(),
      jobRole: String(r[14] ?? '').trim(),
      jobTitle: String(r[15] ?? '').trim(),
      category: mapCategory(String(r[8] ?? ''))
    });
  }
  return out;
}

async function getOrCreateCohort(name: string): Promise<string> {
  const { data: ex } = await s.from('cohorts').select('id').eq('name', name).maybeSingle();
  if (ex) return ex.id;
  if (!APPLY) {
    console.log(`  🔍 dry-run cohort 생성 예정: ${name} (교육일 ${COURSE_DATE})`);
    return 'DRY';
  }
  const { data, error } = await s
    .from('cohorts')
    .insert({
      name,
      category: 'champion',
      delivery_method: '기관맞춤형',
      started_at: COURSE_DATE,
      ended_at: COURSE_DATE
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`cohort 생성 실패: ${name} - ${error?.message}`);
  console.log(`  ✅ cohort 생성: ${name}`);
  return data.id;
}

const orgCache = new Map<string, string>();
async function getOrCreateOrg(name: string, category: string): Promise<string> {
  if (orgCache.has(name)) return orgCache.get(name)!;
  const { data: ex } = await s.from('organizations').select('id').eq('name', name).maybeSingle();
  if (ex) {
    orgCache.set(name, ex.id);
    return ex.id;
  }
  if (!APPLY) {
    orgCache.set(name, 'DRY-ORG');
    console.log(`  🔍 org 생성 예정: ${name}`);
    return 'DRY-ORG';
  }
  const orgCat = category === '중앙부처' ? 'central' : null;
  const { data, error } = await s
    .from('organizations')
    .insert(orgCat ? { name, category: orgCat } : { name })
    .select('id')
    .single();
  if (error || !data) throw new Error(`org 생성 실패: ${name} - ${error?.message}`);
  orgCache.set(name, data.id);
  return data.id;
}

async function importOne(file: string, cohortName: string) {
  console.log(`\n=== ${cohortName} ===`);
  const rows = parseFile(file);
  console.log(`  파싱: ${rows.length}명`);
  const cohortId = await getOrCreateCohort(cohortName);

  let newApplicants = 0,
    existApplicants = 0,
    newApps = 0,
    dupApps = 0,
    newStudents = 0,
    dupStudents = 0;

  for (const r of rows) {
    const orgId = await getOrCreateOrg(r.org, r.category);
    const notes = r.office ? `사무실: ${r.office}` : null;

    // applicant dedup: 전화 → 이메일
    let applicantId: string | null = null;
    if (r.phone) {
      const { data } = await s.from('applicants').select('id').eq('phone', r.phone).maybeSingle();
      if (data) applicantId = data.id;
    }
    if (!applicantId && r.email) {
      const { data } = await s.from('applicants').select('id').eq('email', r.email).maybeSingle();
      if (data) applicantId = data.id;
    }
    if (applicantId) {
      existApplicants++;
    } else {
      newApplicants++;
      if (APPLY) {
        const { data, error } = await s
          .from('applicants')
          .insert({
            name: r.name,
            phone: r.phone,
            email: r.email,
            personal_email: r.personalEmail,
            organization_id: orgId,
            department: r.dept,
            job_title: r.jobTitle,
            job_role: r.jobRole,
            category: r.category
          })
          .select('id')
          .single();
        if (error || !data) {
          console.log(`  ❌ applicant 실패: ${r.name} - ${error?.message}`);
          continue;
        }
        applicantId = data.id;
      }
    }

    if (APPLY && applicantId) {
      // application (unique applicant_id+cohort_id)
      const { data: exApp } = await s
        .from('applications')
        .select('id')
        .eq('applicant_id', applicantId)
        .eq('cohort_id', cohortId)
        .maybeSingle();
      if (exApp) {
        dupApps++;
      } else {
        const { error } = await s.from('applications').insert({
          applicant_id: applicantId,
          cohort_id: cohortId,
          status: 'selected',
          applied_at: COURSE_DATE,
          decided_at: COURSE_DATE
        });
        if (error) console.log(`  ❌ application 실패: ${r.name} - ${error.message}`);
        else newApps++;
      }

      // student (cohort 내 name+phone dedup)
      const { data: exSt } = await s
        .from('students')
        .select('id')
        .eq('cohort_id', cohortId)
        .eq('name', r.name)
        .eq('phone', r.phone)
        .maybeSingle();
      if (exSt) {
        dupStudents++;
      } else {
        const { error } = await s.from('students').insert({
          cohort_id: cohortId,
          applicant_id: applicantId,
          organization_id: orgId,
          name: r.name,
          phone: r.phone,
          email: r.email,
          personal_email: r.personalEmail,
          department: r.dept,
          job_title: r.jobTitle,
          job_role: r.jobRole,
          notes
        });
        if (error) console.log(`  ❌ student 실패: ${r.name} - ${error.message}`);
        else newStudents++;
      }
    }
  }

  console.log(
    `  applicants: 기존 ${existApplicants} · 신규 ${newApplicants}` +
      (APPLY
        ? ` | applications: +${newApps} (중복 ${dupApps}) | students: +${newStudents} (중복 ${dupStudents})`
        : ' | (dry-run — applications/students는 apply 시 생성)')
  );
}

async function main() {
  console.log(`mode: ${APPLY ? 'APPLY' : 'dry-run'}`);
  for (const f of FILES) await importOne(f.file, f.cohortName);
  if (!APPLY) console.log('\n실제 반영은 --apply 로 재실행.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
