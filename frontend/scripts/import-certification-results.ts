// 인증평가 채점결과표(엑셀) → certification_results upsert.
//
// AI 챔피언 블루 1·2회차 (비대면) 결과 파일 전용으로 매핑 하드코딩.
// 다른 cohort 결과 파일이 오면 아래 SHEET_TO_COHORT / COLUMN_MAP 을 조정.
//
// 사용법:
//   bun run scripts/import-certification-results.ts <엑셀경로> [--dry-run]
//   기본 경로: C:\kbrain\인증평가\채점결과표_AI챔피언블루_사전온라인반영.xlsx

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

const DEFAULT_FILE = 'C:\\kbrain\\인증평가\\채점결과표_AI챔피언블루_사전온라인반영.xlsx';
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const FILE = positional[0] || DEFAULT_FILE;
const DRY_RUN = process.argv.includes('--dry-run');

// ---------- 시트 → cohort 매핑 ----------
// 시트명이 부분 매칭되면 해당 cohort_id 사용.
const SHEET_TO_COHORT: { keyword: string; cohortId: string; label: string }[] = [
  { keyword: '1회차', cohortId: 'b5149035-b7d2-440e-9016-6c2997912b0e', label: 'AI 챔피언 블루 1회차' },
  { keyword: '2회차', cohortId: '06781a96-9229-42ec-b59c-89ce11378d3e', label: 'AI 챔피언 블루 2회차' }
];

// ---------- 엑셀 헤더 매핑 ----------
// 엑셀 헤더에 \r\n 이 섞여 있어서 매핑 시 정규화.
const H = {
  name: '이름',
  email: '이메일',
  finalScore: '최종점수',
  totalRaw: '총점(300)',
  percent: '백분율(%)',
  note: '비고'
};

// 섹션 점수: 정규화된 헤더(→ 라벨) 매핑
const SECTION_LABELS: { pattern: RegExp; label: string }[] = [
  { pattern: /콘텐츠/, label: '콘텐츠' },
  { pattern: /데이터분석/, label: '데이터분석' },
  { pattern: /자동화/, label: '자동화' },
  { pattern: /사전평가/, label: '사전평가' },
  { pattern: /사전온라인/, label: '사전온라인' },
  { pattern: /수업참여도/, label: '수업참여도' }
];

const PASS_THRESHOLD = 75;

// ---------- 유틸 ----------
const normHeader = (h: string) => h.replace(/[\r\n]+/g, ' ').trim();
const normEmail = (s: unknown) => String(s ?? '').trim().toLowerCase();
const normStr = (s: unknown) => String(s ?? '').trim();
const toNum = (s: unknown): number | null => {
  if (s === null || s === undefined || s === '') return null;
  const n = typeof s === 'number' ? s : Number(String(s).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

function findKey(row: Record<string, unknown>, matcher: string | RegExp): string | undefined {
  for (const k of Object.keys(row)) {
    const n = normHeader(k);
    if (typeof matcher === 'string' ? n === matcher : matcher.test(n)) return k;
  }
  return undefined;
}

function findVal(row: Record<string, unknown>, matcher: string | RegExp): unknown {
  const k = findKey(row, matcher);
  return k !== undefined ? row[k] : undefined;
}

// ---------- 시트별 처리 ----------
async function processSheet(
  sheetName: string,
  rows: Record<string, unknown>[]
): Promise<{ inserted: number; updated: number; skipped: number; unmatched: number }> {
  const target = SHEET_TO_COHORT.find((m) => sheetName.includes(m.keyword));
  if (!target) {
    console.log(`  [SKIP] 시트 "${sheetName}" — 매핑되는 cohort 없음`);
    return { inserted: 0, updated: 0, skipped: rows.length, unmatched: 0 };
  }

  console.log(`\n  → cohort: ${target.label} (${target.cohortId})`);

  // 학생 명단 로드 (매칭용)
  const { data: students, error: stuErr } = await supabase
    .from('students')
    .select('id, name, email, personal_email')
    .eq('cohort_id', target.cohortId);
  if (stuErr) throw new Error(stuErr.message);
  console.log(`  cohort 학생 수: ${students?.length ?? 0}명`);

  const byEmail = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const s of students ?? []) {
    // 응시자가 개인 이메일로 가입하는 경우가 있어 공식·개인 이메일 둘 다 등록
    // (블루 2회차 [비공개] 미매칭 사례 재발 방지)
    for (const raw of [s.email, s.personal_email]) {
      const e = normEmail(raw);
      if (e && !byEmail.has(e)) byEmail.set(e, s.id);
    }
    const n = normStr(s.name);
    if (n) {
      const arr = byName.get(n) ?? [];
      arr.push(s.id);
      byName.set(n, arr);
    }
  }

  const toUpsert: Record<string, unknown>[] = [];
  let matched = 0;
  let unmatched = 0;

  for (const r of rows) {
    const name = normStr(findVal(r, H.name));
    if (!name) continue;
    const email = normEmail(findVal(r, H.email)) || null;

    let studentId: string | null = null;
    if (email && byEmail.has(email)) studentId = byEmail.get(email)!;
    else if (byName.get(name)?.length === 1) studentId = byName.get(name)![0];

    if (studentId) matched++;
    else unmatched++;

    const section_scores: Record<string, number | null> = {};
    for (const { pattern, label } of SECTION_LABELS) {
      const v = findVal(r, pattern);
      section_scores[label] = toNum(v);
    }

    const finalScore = toNum(findVal(r, H.finalScore));
    const passed = finalScore === null ? null : finalScore >= PASS_THRESHOLD;

    toUpsert.push({
      cohort_id: target.cohortId,
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
      exam_date: null,
      raw: r
    });
  }

  console.log(`  파싱: ${toUpsert.length}건 (매칭 ${matched} / 미매칭 ${unmatched})`);

  if (DRY_RUN) {
    console.log('  --dry-run: DB 쓰기 skip. 샘플 1건:');
    if (toUpsert[0]) console.log(JSON.stringify(toUpsert[0], null, 2));
    return { inserted: 0, updated: 0, skipped: 0, unmatched };
  }

  // partial unique index 는 ON CONFLICT 지원이 애매하므로 cohort 단위로 wipe & insert.
  // 재실행마다 이 cohort 의 결과는 완전히 새로 씀 — 엑셀이 항상 truth 라는 전제.
  const { error: delErr } = await supabase
    .from('certification_results')
    .delete()
    .eq('cohort_id', target.cohortId);
  if (delErr) throw new Error(delErr.message);

  const { data, error } = await supabase
    .from('certification_results')
    .insert(toUpsert)
    .select('id');
  if (error) throw new Error(error.message);
  const inserted = data?.length ?? 0;

  console.log(`  완료: 신규 ${inserted}`);
  return { inserted, updated: 0, skipped: 0, unmatched };
}

async function main() {
  console.log(`파일: ${FILE}${DRY_RUN ? '  [--dry-run]' : ''}`);
  const buf = fs.readFileSync(FILE);
  const wb = XLSX.read(buf, { type: 'buffer' });
  console.log(`시트: ${wb.SheetNames.join(', ')}`);

  let totalIns = 0;
  let totalUpd = 0;
  let totalUnmatched = 0;

  for (const sn of wb.SheetNames) {
    console.log(`\n===== 시트: ${sn} =====`);
    const ws = wb.Sheets[sn];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    const r = await processSheet(sn, rows);
    totalIns += r.inserted;
    totalUpd += r.updated;
    totalUnmatched += r.unmatched;
  }

  console.log(
    `\n${'='.repeat(60)}\n전체 완료: 신규 ${totalIns} / 업데이트 ${totalUpd} / 미매칭 ${totalUnmatched}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
