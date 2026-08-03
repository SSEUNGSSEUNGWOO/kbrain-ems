// 인증평가 채점관리 CSV(시험별) → certification_results 참여 기록 생성.
//
// 배경: AI챔피언 수료 조건은 "OT 참석 + 집중교육 3일 + 인증평가 참여" 세 가지이고,
//       인증평가 참여 여부는 certification_results 에 학생 매칭된 row 가 있는지로 판정한다
//       (src/lib/completion.ts computeChampionCompletion).
//       점수는 아직 미채점이므로 passed/total_score 는 NULL 로 두고 참여 사실만 기록한다.
//       채점 완료 후 결과표가 오면 import-certification-results.ts 로 덮어쓰면 된다.
//
// 매칭 규칙 (시험 응시자 row 기준, 순서대로 적용):
//   A) 이메일이 해당 기수 학생과 유일하게 일치
//   B) 응시자명이 학생 이메일 아이디와 일치 (외부 사이트가 이름 대신 메일 아이디를 넣은 케이스.
//      예: 응시자 "oss4375" = 학생 [비공개] [비공개])
//   C) 같은 이름으로 남은 학생 1명 · 남은 응시행 1건 → 매칭
//      (단순 유일매칭 + 동명이인 소거법을 함께 처리. 예: [비공개] 2명 중 1명이 A 로 확정되면 나머지가 확정)
//   그 외 → student_id NULL (인증 페이지 '미매칭 결과'로 표시)
//
// 사용법:
//   bun run scripts/import-exam-participation.ts <CSV폴더> [--dry-run]

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DIR = positional[0] || 'C:\\Users\\USER\\Downloads';
const DRY_RUN = process.argv.includes('--dry-run');

// 시험명(정규화) → cohort. 2026-07-28~30 실시분.
const EXAM_TO_COHORT: Record<string, { id: string; label: string }> = {
  '그린(초급) 종합과정 1회차': { id: '0e3b0791-5c03-40f8-a632-094ffd7fe5d2', label: 'AI 챔피언 그린 1회차' },
  '그린(초급) 종합과정 2회차': { id: '175c280a-d24b-418a-867e-0ca322ef97f9', label: 'AI 챔피언 그린 2회차' },
  '그린(초급) 자기주도형 1회차': { id: '77af39f8-2012-4c88-b213-6631ca942e33', label: 'AI 챔피언 그린 자기주도형 1회차' },
  '그린(초급) 기관특화형 1회차': { id: '3c54f40d-83c4-43ad-9250-576402cf1303', label: 'AI 챔피언 그린 기관맞춤형 1회차' },
  '블루(중급) 종합과정 3회차': { id: '7b1c6e7d-853f-4866-a278-b30e2065dd22', label: 'AI 챔피언 블루 3회차' },
  '블루(중급) 종합과정 4회차': { id: '385f6497-0b85-41d9-8668-bc0c8cf8f9b6', label: 'AI 챔피언 블루 4회차' },
  '블루(중급) 자기주도형 1회차': { id: 'ecd878c9-759d-4f67-b1dd-f5024a755b2d', label: 'AI 챔피언 블루 자기주도형 1회차' },
  '블루(중급) 기관맞춤형 1회차': { id: 'bbd42105-9ace-48e2-9a85-03dc61265af8', label: 'AI 챔피언 블루 기관맞춤형 1회차' }
};

// 1회차2·3·4 는 본시험 직후 소수 인원 보충 세션 — 본시험으로 합침.
const normalizeExam = (s: string): string =>
  s.replace('AI 챔피언 역량평가_', '').replace(/종합과정 1회차[234]$/, '종합과정 1회차').trim();
const normName = (s: string): string => s.replace(/\s+/g, '').toLowerCase();
const normEmail = (s: string): string => s.trim().toLowerCase();

function parseCsv(text: string): Record<string, string>[] {
  const t = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      cur.push(field);
      field = '';
    } else if (c === '\n') {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  const header = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((v) => v.trim() !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// 제출시간 "2026. 7. 30. 오후 2:57:12" → YYYY-MM-DD
function parseExamDate(s: string): string | null {
  const m = s.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

type Student = { id: string; name: string; email: string | null };

async function processExam(exam: string, rows: Record<string, string>[]) {
  const target = EXAM_TO_COHORT[exam];
  if (!target) {
    console.log(`\n[SKIP] ${exam} — 매핑된 기수 없음 (${rows.length}행)`);
    return { inserted: 0, matched: 0, unmatched: 0 };
  }

  const { data: students, error } = await supabase
    .from('students')
    .select('id, name, email')
    .eq('cohort_id', target.id)
    .returns<Student[]>();
  if (error) throw new Error(error.message);

  const byEmail = new Map<string, Student[]>();
  const byLocalPart = new Map<string, Student[]>();
  for (const s of students ?? []) {
    const e = normEmail(s.email ?? '');
    if (!e) continue;
    const a = byEmail.get(e) ?? [];
    a.push(s);
    byEmail.set(e, a);
    const lp = e.split('@')[0];
    const b = byLocalPart.get(lp) ?? [];
    b.push(s);
    byLocalPart.set(lp, b);
  }

  const validRows = rows.filter((r) => r['응시자']);
  const assigned = new Array<string | null>(validRows.length).fill(null);
  const usedStudentIds = new Set<string>();
  const counts = { email: 0, localPart: 0, name: 0 };

  const claim = (i: number, id: string, kind: keyof typeof counts): boolean => {
    if (usedStudentIds.has(id)) return false;
    assigned[i] = id;
    usedStudentIds.add(id);
    counts[kind]++;
    return true;
  };

  // A) 이메일 정확 일치
  validRows.forEach((r, i) => {
    const email = r['이메일'] ? normEmail(r['이메일']) : '';
    if (!email) return;
    const c = byEmail.get(email) ?? [];
    if (c.length === 1) claim(i, c[0].id, 'email');
  });

  // B) 응시자명이 학생 이메일 아이디와 일치
  validRows.forEach((r, i) => {
    if (assigned[i]) return;
    const c = byLocalPart.get(normName(r['응시자'])) ?? [];
    if (c.length === 1) claim(i, c[0].id, 'localPart');
  });

  // C) 이름 기준 — 남은 학생 1명 · 남은 응시행 1건일 때만 (동명이인 소거법 포함)
  const remainingRowsByName = new Map<string, number[]>();
  validRows.forEach((r, i) => {
    if (assigned[i]) return;
    const n = normName(r['응시자']);
    const a = remainingRowsByName.get(n) ?? [];
    a.push(i);
    remainingRowsByName.set(n, a);
  });
  for (const [n, idxs] of remainingRowsByName) {
    const cands = (students ?? []).filter(
      (s) => normName(s.name) === n && !usedStudentIds.has(s.id)
    );
    if (idxs.length === 1 && cands.length === 1) claim(idxs[0], cands[0].id, 'name');
  }

  const payload: Record<string, unknown>[] = [];
  const unmatchedNames: string[] = [];
  validRows.forEach((r, i) => {
    if (!assigned[i]) unmatchedNames.push(r['응시자']);
    payload.push({
      cohort_id: target.id,
      student_id: assigned[i],
      name: r['응시자'],
      phone: null,
      email: r['이메일'] ? normEmail(r['이메일']) : null,
      passed: null, // 미채점 — 참여 사실만 기록
      total_score: null,
      grade: null,
      section_scores: {},
      exam_no: null,
      cert_no: null,
      exam_date: parseExamDate(r['제출시간(KST)'] ?? ''),
      raw: r
    });
  });
  const byE = counts.email + counts.localPart;
  const byN = counts.name;

  const total = (students ?? []).length;
  console.log(`\n■ ${exam} → ${target.label}`);
  console.log(
    `   응시 ${rows.length}행 | 학생 ${total}명 | 매칭 ${byE + byN} (이메일 ${byE}, 이름 ${byN}) | 미매칭 ${unmatchedNames.length}`
  );
  if (unmatchedNames.length > 0) {
    console.log(`   미매칭: ${unmatchedNames.slice(0, 20).join(', ')}${unmatchedNames.length > 20 ? ' …' : ''}`);
  }

  if (DRY_RUN) return { inserted: 0, matched: byE + byN, unmatched: unmatchedNames.length };

  // 이 기수의 기존 결과를 지우고 새로 씀 (CSV 가 truth)
  const { error: delErr } = await supabase
    .from('certification_results')
    .delete()
    .eq('cohort_id', target.id);
  if (delErr) throw new Error(delErr.message);

  const { data: ins, error: insErr } = await supabase
    .from('certification_results')
    .insert(payload)
    .select('id');
  if (insErr) throw new Error(insErr.message);

  console.log(`   → 저장 ${ins?.length ?? 0}건`);
  return { inserted: ins?.length ?? 0, matched: byE + byN, unmatched: unmatchedNames.length };
}

async function main() {
  const files = fs
    .readdirSync(DIR)
    .filter((f) => f.startsWith('채점관리_') && f.endsWith('.csv'));
  console.log(`CSV ${files.length}개${DRY_RUN ? '  [--dry-run]' : ''}`);

  const byExam = new Map<string, Record<string, string>[]>();
  for (const f of files) {
    for (const r of parseCsv(fs.readFileSync(path.join(DIR, f), 'utf8'))) {
      const e = normalizeExam(r['시험명'] ?? '');
      const arr = byExam.get(e) ?? [];
      arr.push(r);
      byExam.set(e, arr);
    }
  }

  let ins = 0;
  let mat = 0;
  let unm = 0;
  for (const [exam, rows] of [...byExam].sort()) {
    const r = await processExam(exam, rows);
    ins += r.inserted;
    mat += r.matched;
    unm += r.unmatched;
  }
  console.log(`\n${'='.repeat(60)}`);
  console.log(`저장 ${ins}건 | 학생매칭 ${mat} | 미매칭 ${unm}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
