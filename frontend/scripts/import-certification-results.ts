// 외부 사이트 인증평가 결과 엑셀 → certification_results upsert.
//
// 사용법:
//   bun run scripts/import-certification-results.ts <엑셀경로> <cohortId> [--dry-run]
//
// 첫 실행 시 헤더를 stdout 으로 찍음 → COLUMN_MAP 을 파일 상단에서 조정 후 재실행 권장.
//
// 매칭 순서: phone(정규화) → email → name.
// 미매칭 row 는 student_id=null 로 저장 (인증 페이지 '미매칭' 섹션에 노출).

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

// ---------- 환경변수 로드 ----------
const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ---------- 인자 ----------
const [, , FILE_ARG, COHORT_ID, ...flags] = process.argv;
const DRY_RUN = flags.includes('--dry-run');

if (!FILE_ARG || !COHORT_ID) {
  console.error(
    '사용법: bun run scripts/import-certification-results.ts <엑셀경로> <cohortId> [--dry-run]'
  );
  process.exit(1);
}

// ---------- 컬럼 매핑 (엑셀 헤더 확인 후 조정) ----------
// 헤더가 확정되면 이 매핑을 갱신. 값이 배열이면 첫 번째로 매칭되는 헤더 사용.
const COLUMN_MAP = {
  name: ['이름', '성명'],
  phone: ['휴대전화', '연락처', '전화번호', '휴대폰'],
  email: ['이메일', 'email', 'Email'],
  passed: ['합격여부', '합격', '결과'],
  total_score: ['총점', '점수', '최종점수'],
  grade: ['등급'],
  exam_no: ['수험번호', '응시번호'],
  cert_no: ['인증번호', '수료번호', '자격번호'],
  exam_date: ['응시일', '시험일', '평가일']
};

// section_scores 는 위 매핑에 없는 나머지 숫자형 컬럼을 자동으로 잡음.
// 명시적으로 섹션명을 강제하고 싶으면 아래에 열거:
const SECTION_COLUMNS: string[] = [
  // 예: '객관식', '서술형', '작업형'
];

// 위 COLUMN_MAP 에서 어떤 컬럼도 안 잡힐 경우 무시할 헤더 (합계·순번 등)
const IGNORE_COLUMNS: string[] = ['NO', '번호', '순번'];

// ---------- 유틸 ----------
const normPhone = (s: unknown) => String(s ?? '').replace(/[^\d]/g, '');
const normEmail = (s: unknown) => String(s ?? '').trim().toLowerCase();
const normStr = (s: unknown) => String(s ?? '').trim();
const toBool = (s: unknown): boolean | null => {
  const v = normStr(s).toLowerCase();
  if (['합격', 'pass', 'y', 'yes', 'o', 'true', '1'].includes(v)) return true;
  if (['불합격', 'fail', 'n', 'no', 'x', 'false', '0'].includes(v)) return false;
  return null;
};
const toNum = (s: unknown): number | null => {
  if (s === null || s === undefined || s === '') return null;
  const n = typeof s === 'number' ? s : Number(String(s).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const toDate = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    const ms = (v - 25569) * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m1 = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}`;
  return null;
};

function pick(row: Record<string, unknown>, keys: string[] | string): unknown {
  const list = Array.isArray(keys) ? keys : [keys];
  for (const k of list) if (row[k] !== undefined) return row[k];
  return undefined;
}

// ---------- main ----------
async function main() {
  const buf = fs.readFileSync(FILE_ARG);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  if (rows.length === 0) {
    console.log('빈 시트입니다.');
    return;
  }

  const headers = Object.keys(rows[0]);
  console.log(`\n엑셀 헤더 (${headers.length}개):`);
  for (const h of headers) console.log(`  · ${h}`);

  // 매핑 안 된 헤더 = 자동 섹션 후보 (또는 IGNORE)
  const mappedHeaders = new Set<string>();
  for (const v of Object.values(COLUMN_MAP)) {
    for (const h of v as string[]) if (headers.includes(h)) mappedHeaders.add(h);
  }
  const autoSectionCols = headers.filter(
    (h) => !mappedHeaders.has(h) && !IGNORE_COLUMNS.includes(h)
  );
  const sectionCols = SECTION_COLUMNS.length > 0 ? SECTION_COLUMNS : autoSectionCols;

  console.log(`\n섹션 컬럼 (${sectionCols.length}개): ${sectionCols.join(', ') || '없음'}`);

  // 학생 명단 로드 (매칭용)
  const { data: students, error: stuErr } = await supabase
    .from('students')
    .select('id, name, phone, email')
    .eq('cohort_id', COHORT_ID);
  if (stuErr) throw new Error(stuErr.message);
  console.log(`\ncohort 학생 수: ${students?.length ?? 0}명`);

  const byPhone = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const s of students ?? []) {
    const p = normPhone(s.phone);
    if (p) byPhone.set(p, s.id);
    const e = normEmail(s.email);
    if (e) byEmail.set(e, s.id);
    const n = normStr(s.name);
    if (n) {
      const arr = byName.get(n) ?? [];
      arr.push(s.id);
      byName.set(n, arr);
    }
  }

  // 파싱 + 매칭
  const toUpsert: Record<string, unknown>[] = [];
  let matched = 0;
  let unmatched = 0;
  for (const r of rows) {
    const name = normStr(pick(r, COLUMN_MAP.name));
    if (!name) continue;

    const phone = normPhone(pick(r, COLUMN_MAP.phone)) || null;
    const email = normEmail(pick(r, COLUMN_MAP.email)) || null;

    let studentId: string | null = null;
    if (phone && byPhone.has(phone)) studentId = byPhone.get(phone)!;
    else if (email && byEmail.has(email)) studentId = byEmail.get(email)!;
    else if (byName.get(name)?.length === 1) studentId = byName.get(name)![0];

    if (studentId) matched++;
    else unmatched++;

    const section_scores: Record<string, number | string> = {};
    for (const sec of sectionCols) {
      const v = r[sec];
      if (v === null || v === undefined || v === '') continue;
      const n = toNum(v);
      section_scores[sec] = n ?? String(v);
    }

    toUpsert.push({
      cohort_id: COHORT_ID,
      student_id: studentId,
      name,
      phone,
      email,
      passed: toBool(pick(r, COLUMN_MAP.passed)),
      total_score: toNum(pick(r, COLUMN_MAP.total_score)),
      grade: normStr(pick(r, COLUMN_MAP.grade)) || null,
      section_scores,
      exam_no: normStr(pick(r, COLUMN_MAP.exam_no)) || null,
      cert_no: normStr(pick(r, COLUMN_MAP.cert_no)) || null,
      exam_date: toDate(pick(r, COLUMN_MAP.exam_date)),
      raw: r
    });
  }

  console.log(`\n파싱된 row: ${toUpsert.length}건 (매칭 ${matched} / 미매칭 ${unmatched})`);

  if (DRY_RUN) {
    console.log('\n--dry-run 모드: DB 쓰기 스킵.');
    console.log('\n샘플 3건:');
    for (const r of toUpsert.slice(0, 3)) console.log(JSON.stringify(r, null, 2));
    return;
  }

  // upsert — (cohort_id, cert_no) 있으면 cert_no 기준, 없으면 (cohort_id, student_id) 기준
  const withCert = toUpsert.filter((r) => r.cert_no);
  const noCert = toUpsert.filter((r) => !r.cert_no);

  let inserted = 0;
  let updated = 0;

  if (withCert.length > 0) {
    const { data, error } = await supabase
      .from('certification_results')
      .upsert(withCert, { onConflict: 'cohort_id,cert_no' })
      .select('id, created_at, updated_at');
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      if ((r as { created_at: string; updated_at: string }).created_at ===
          (r as { created_at: string; updated_at: string }).updated_at) inserted++;
      else updated++;
    }
  }

  if (noCert.length > 0) {
    // student_id 있는 것만 (cohort_id, student_id) unique key 이용
    const withStudent = noCert.filter((r) => r.student_id);
    const noStudent = noCert.filter((r) => !r.student_id);

    if (withStudent.length > 0) {
        const { data, error } = await supabase
        .from('certification_results')
        .upsert(withStudent, { onConflict: 'cohort_id,student_id' })
        .select('id, created_at, updated_at');
      if (error) throw new Error(error.message);
      for (const r of data ?? []) {
        if ((r as { created_at: string; updated_at: string }).created_at ===
            (r as { created_at: string; updated_at: string }).updated_at) inserted++;
        else updated++;
      }
    }

    if (noStudent.length > 0) {
      // student_id 도 cert_no 도 없는 row — insert 만 (중복 검사 없음)
        const { data, error } = await supabase
        .from('certification_results')
        .insert(noStudent)
        .select('id');
      if (error) throw new Error(error.message);
      inserted += data?.length ?? 0;
    }
  }

  console.log(`\n완료: 신규 ${inserted} / 업데이트 ${updated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
