// 2차 인증평가(260728~30, 8개 기수+특화) 채점결과표 → certification_results.
//
// import-certification-results.ts(블루 1·2회차용)와 동일 정책:
//   - 시트별 cohort 매핑, 학생 매칭은 이메일(공식·개인) → 유일 이름 순
//   - cohort 단위 wipe & insert (엑셀이 truth) — 기존 응시명단 행의 exam_date는 보존해 재기록
//   - 합불: 시트에 '합격여부' 컬럼 있으면 그 값, 없으면(교육형) 최종점수 75점 이상
//
// 사용법: bun run scripts/import-certification-results-2nd.ts <엑셀경로> [--dry-run]

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

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const FILE = positional[0];
const DRY_RUN = process.argv.includes('--dry-run');
if (!FILE) {
  console.error('사용법: bun run scripts/import-certification-results-2nd.ts <엑셀경로> [--dry-run]');
  process.exit(1);
}

// 시트명 부분 매칭 → cohort 이름 (순서 중요: 구체적인 것 먼저)
const SHEET_TO_COHORT_NAME: { pattern: RegExp; cohortName: string }[] = [
  { pattern: /그린.*자기주도형 1회차/, cohortName: 'AI 챔피언 그린 자기주도형 1회차' },
  { pattern: /그린.*기관맞춤형 1회차/, cohortName: 'AI 챔피언 그린 기관맞춤형 1회차' },
  { pattern: /그린.*특화/, cohortName: 'AI 챔피언 그린(초급) 종합과정 (특화)' },
  { pattern: /그린.*종합과정 1회차/, cohortName: 'AI 챔피언 그린 1회차' },
  { pattern: /그린.*종합과정 2회차/, cohortName: 'AI 챔피언 그린 2회차' },
  { pattern: /블루.*자기주도형 1회차/, cohortName: 'AI 챔피언 블루 자기주도형 1회차' },
  { pattern: /블루.*기관맞춤형 1회차/, cohortName: 'AI 챔피언 블루 기관맞춤형 1회차' },
  { pattern: /블루.*종합과정 3회차/, cohortName: 'AI 챔피언 블루 3회차' },
  { pattern: /블루.*종합과정 4회차/, cohortName: 'AI 챔피언 블루 4회차' }
];

// 섹션 점수 헤더 → 라벨
const SECTION_LABELS: { pattern: RegExp; label: string }[] = [
  { pattern: /^객관식/, label: '객관식' },
  { pattern: /^과목1/, label: '과목1' },
  { pattern: /^과목2/, label: '과목2' },
  { pattern: /^과목3/, label: '과목3' },
  { pattern: /^사전평가/, label: '사전평가' },
  { pattern: /^사전온라인/, label: '사전온라인' },
  { pattern: /^수업참여도/, label: '수업참여도' }
];

const PASS_THRESHOLD = 75;

const normHeader = (h: string) => h.replace(/[\r\n]+/g, ' ').trim();
const normEmail = (s: unknown) => String(s ?? '').trim().toLowerCase();
const normStr = (s: unknown) => String(s ?? '').trim();
const toNum = (s: unknown): number | null => {
  if (s === null || s === undefined || s === '') return null;
  const n = typeof s === 'number' ? s : Number(String(s).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

function findKey(row: Record<string, unknown>, matcher: RegExp | string): string | undefined {
  for (const k of Object.keys(row)) {
    const n = normHeader(k);
    if (typeof matcher === 'string' ? n === matcher : matcher.test(n)) return k;
  }
  return undefined;
}
const findVal = (row: Record<string, unknown>, m: RegExp | string) => {
  const k = findKey(row, m);
  return k !== undefined ? row[k] : undefined;
};

async function processSheet(sheetName: string, rows: Record<string, unknown>[]) {
  const map = SHEET_TO_COHORT_NAME.find((m) => m.pattern.test(sheetName));
  if (!map) {
    console.log(`  [SKIP] 시트 "${sheetName}" — cohort 매핑 없음`);
    return { inserted: 0, unmatched: 0, passed: 0 };
  }
  const { data: cohort } = await supabase
    .from('cohorts')
    .select('id, name')
    .eq('name', map.cohortName)
    .maybeSingle();
  if (!cohort) throw new Error(`cohort 없음: ${map.cohortName}`);
  console.log(`  → cohort: ${cohort.name}`);

  // 기존 응시명단 행의 시험일 보존
  const { data: prev } = await supabase
    .from('certification_results' as never)
    .select('exam_date')
    .eq('cohort_id', cohort.id)
    .not('exam_date', 'is', null)
    .limit(1) as unknown as { data: { exam_date: string }[] | null };
  const examDate = prev?.[0]?.exam_date ?? null;

  const { data: students, error: stuErr } = await supabase
    .from('students')
    .select('id, name, email, personal_email')
    .eq('cohort_id', cohort.id);
  if (stuErr) throw new Error(stuErr.message);

  const byEmail = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const s of students ?? []) {
    for (const raw of [s.email, s.personal_email]) {
      const e = normEmail(raw);
      if (e && !byEmail.has(e)) byEmail.set(e, s.id);
    }
    const n = normStr(s.name);
    if (n) byName.set(n, [...(byName.get(n) ?? []), s.id]);
  }

  const toInsert: Record<string, unknown>[] = [];
  let matched = 0;
  let unmatched = 0;
  let passedCnt = 0;

  for (const r of rows) {
    const name = normStr(findVal(r, '이름'));
    if (!name) continue;
    const email = normEmail(findVal(r, '이메일')) || null;

    let studentId: string | null = null;
    if (email && byEmail.has(email)) studentId = byEmail.get(email)!;
    else if (byName.get(name)?.length === 1) studentId = byName.get(name)![0];
    if (studentId) matched++;
    else unmatched++;

    const section_scores: Record<string, number | null> = {};
    for (const { pattern, label } of SECTION_LABELS) {
      const k = findKey(r, pattern);
      if (k !== undefined) section_scores[label] = toNum(r[k]);
    }

    const finalScore = toNum(findVal(r, '최종점수'));
    // 합불: '합격여부' 컬럼 우선(자기주도·기관맞춤형), 없으면 최종점수 75점 기준(교육형)
    const passRaw = normStr(findVal(r, /^합격여부/));
    const passed = passRaw
      ? passRaw.includes('합격') && !passRaw.includes('불합격')
      : finalScore === null
        ? null
        : finalScore >= PASS_THRESHOLD;
    if (passed) passedCnt++;

    toInsert.push({
      cohort_id: cohort.id,
      student_id: studentId,
      name,
      phone: null,
      email,
      passed,
      total_score: finalScore,
      grade: null,
      section_scores,
      exam_no: null,
      cert_no: null,
      exam_date: examDate,
      raw: r
    });
  }

  console.log(
    `  파싱 ${toInsert.length}건 | 매칭 ${matched} / 미매칭 ${unmatched} | 합격 ${passedCnt} | 시험일 ${examDate ?? '-'}`
  );

  if (DRY_RUN) return { inserted: 0, unmatched, passed: passedCnt };

  const { error: delErr } = await supabase
    .from('certification_results' as never)
    .delete()
    .eq('cohort_id', cohort.id);
  if (delErr) throw new Error(delErr.message);
  const { data, error } = await supabase
    .from('certification_results' as never)
    .insert(toInsert as never)
    .select('id') as unknown as { data: { id: string }[] | null; error: { message: string } | null };
  if (error) throw new Error(error.message);
  console.log(`  완료: ${data?.length ?? 0}건 기록`);
  return { inserted: data?.length ?? 0, unmatched, passed: passedCnt };
}

async function main() {
  console.log(`파일: ${FILE}${DRY_RUN ? '  [--dry-run]' : ''}`);
  const wb = XLSX.read(fs.readFileSync(FILE), { type: 'buffer' });
  let ins = 0, un = 0, pass = 0;
  for (const sn of wb.SheetNames) {
    console.log(`\n===== ${sn} =====`);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sn], { defval: '' });
    const r = await processSheet(sn, rows);
    ins += r.inserted;
    un += r.unmatched;
    pass += r.passed;
  }
  console.log(`\n${'='.repeat(60)}\n전체: 기록 ${ins} / 미매칭 ${un} / 합격 ${pass}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
