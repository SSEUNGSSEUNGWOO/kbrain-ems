/**
 * 전문인재 실전평가 문제 import.
 * 파일: C:/Users/USER/Downloads/전문인재 실전평가문제.xlsx
 * 시트: 최종선정(1기), 최종선정(2기) 각 35문항
 *
 * 생성물:
 *   exam_banks × 2 (회차별 문제은행)
 *   exam_questions × 70 (35 × 2)
 *   exams × 2 (시험 세트)
 *   exam_questions_in_exam × 70 (매핑 + 순서)
 *
 * usage:
 *   bun run scripts/import-experts-exams.ts          # dry-run
 *   bun run scripts/import-experts-exams.ts --apply  # 실제 실행
 */
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const APPLY = process.argv.includes('--apply');
const FILE = 'C:/Users/USER/Downloads/전문인재 실전평가문제.xlsx';

const SHEETS = [
  {
    sheetName: '최종선정(1기)',
    bankName: '블랙 1기 실전평가 문제은행',
    examName: '블랙 1기 실전평가',
    examDesc: '2026 AI 챔피언 블랙 전문인재 과정 1기 실전평가'
  },
  {
    sheetName: '최종선정(2기)',
    bankName: '블랙 2기 실전평가 문제은행',
    examName: '블랙 2기 실전평가',
    examDesc: '2026 AI 챔피언 블랙 전문인재 과정 2기 실전평가'
  }
] as const;

const text = (v: ExcelJS.CellValue): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object' && 'text' in (v as object))
    return String((v as { text: unknown }).text).trim();
  if (typeof v === 'object' && 'result' in (v as object))
    return String((v as { result: unknown }).result).trim();
  if (typeof v === 'object' && 'richText' in (v as object))
    return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join('');
  return String(v).trim();
};
const num = (v: ExcelJS.CellValue): number => {
  if (typeof v === 'number') return v;
  const n = parseFloat(text(v));
  return Number.isFinite(n) ? n : 0;
};

function shortToken(len = 8): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

async function buildShareCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const c = shortToken(8);
    const { data } = await supabase.from('exams').select('id').eq('share_code', c).maybeSingle();
    if (!data) return c;
  }
  throw new Error('share_code 충돌');
}

// 단답형 정답 문자열에서 후보 keywords 추출.
// 예: "윈도우 함수(Window Function) / 분석 함수 · 'OVER 절을 사용하는 함수'도 정답 인정"
//   → ["윈도우 함수", "Window Function", "분석 함수", "OVER 절을 사용하는 함수"]
function parseShortTextKeywords(raw: string): string[] {
  const out = new Set<string>();
  // /, · 로 분리 후 각 조각 처리
  const chunks = raw.split(/[\/·]/).map((s) => s.trim()).filter(Boolean);
  for (const chunk of chunks) {
    // "도 정답 인정" 같은 부연 제거
    const cleaned = chunk.replace(/도 정답 인정.*$/, '').replace(/['"'"]/g, '').trim();
    if (!cleaned) continue;
    // "본문(별칭)" → 본문 + 별칭 각각
    const parenMatch = cleaned.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (parenMatch) {
      out.add(parenMatch[1].trim());
      out.add(parenMatch[2].trim());
    } else {
      out.add(cleaned);
    }
  }
  return [...out];
}

type Row = {
  code: string;
  category: string;
  grade: string;
  difficulty: string;
  type: 'multiple_choice' | 'short_text';
  text: string;
  score: number;
  tags: string[];
  choices: { key: string; text: string }[] | null;
  correct: { key?: string; raw?: string; keywords?: string[] } | null;
};

function parseSheet(sh: ExcelJS.Worksheet): Row[] {
  const rows: Row[] = [];
  for (let r = 2; r <= sh.rowCount; r++) {
    const row = sh.getRow(r);
    const cat = text(row.getCell(3).value);
    if (!cat) continue;

    const rawType = text(row.getCell(6).value);
    const isMc = rawType.includes('객관식');
    const isSt = rawType.includes('단답');
    if (!isMc && !isSt) throw new Error(`R${r}: 알 수 없는 유형 "${rawType}"`);

    const type: 'multiple_choice' | 'short_text' = isMc ? 'multiple_choice' : 'short_text';

    const questionText = text(row.getCell(7).value);
    const score = num(row.getCell(8).value);
    const tagsRaw = text(row.getCell(9).value);
    const tags = tagsRaw ? [tagsRaw] : [];

    const KEYS = ['A', 'B', 'C', 'D', 'E'] as const;
    const choices: { key: string; text: string }[] = [];
    if (isMc) {
      for (let i = 0; i < 5; i++) {
        const cText = text(row.getCell(10 + i).value);
        if (cText) choices.push({ key: KEYS[i], text: cText });
      }
      if (choices.length < 2) throw new Error(`R${r}: 객관식 보기 <2`);
    }

    const answerRaw = text(row.getCell(15).value);
    let correct: Row['correct'];
    if (isMc) {
      const upper = answerRaw.toUpperCase().replace(/[^A-E]/g, '');
      if (!upper) throw new Error(`R${r}: 객관식 정답 파싱 실패 "${answerRaw}"`);
      correct = { key: upper[0] };
    } else {
      correct = {
        raw: answerRaw,
        keywords: parseShortTextKeywords(answerRaw)
      };
    }

    rows.push({
      code: text(row.getCell(2).value),
      category: cat,
      grade: text(row.getCell(4).value),
      difficulty: text(row.getCell(5).value),
      type,
      text: questionText,
      score: score || 1,
      tags,
      choices: isMc ? choices : null,
      correct
    });
  }
  return rows;
}

async function importOne(cfg: (typeof SHEETS)[number], allRows: Row[]) {
  console.log(`\n[${cfg.sheetName}] 문항 ${allRows.length}개`);

  const { data: existBank } = await supabase
    .from('exam_banks')
    .select('id')
    .eq('name', cfg.bankName)
    .maybeSingle();
  if (existBank) {
    console.log(`  ⚠ 이미 존재: bank ${cfg.bankName}. 스킵.`);
    return;
  }

  if (!APPLY) {
    console.log(`  [dry] bank 생성: ${cfg.bankName}`);
    console.log(`  [dry] questions 생성: ${allRows.length}건`);
    const dist: Record<string, number> = {};
    for (const q of allRows) dist[q.type] = (dist[q.type] ?? 0) + 1;
    console.log(`  [dry] 유형 분포: ${JSON.stringify(dist)}`);
    console.log(`  [dry] 첫 문항: ${allRows[0].code} ${allRows[0].text.slice(0, 40)}...`);
    if (allRows[0].correct) console.log(`  [dry] 첫 정답: ${JSON.stringify(allRows[0].correct)}`);
    console.log(`  [dry] exam 생성: ${cfg.examName}`);
    return;
  }

  const { data: bank, error: bErr } = await supabase
    .from('exam_banks')
    .insert({ name: cfg.bankName, description: cfg.examDesc })
    .select('id')
    .single();
  if (bErr || !bank) throw new Error(`bank insert: ${bErr?.message}`);
  console.log(`  ✓ bank id=${bank.id.slice(0, 8)}`);

  const questionRows = allRows.map((q) => ({
    bank_id: bank.id,
    code: q.code,
    category: q.category,
    grade: q.grade,
    difficulty: q.difficulty,
    type: q.type,
    text: q.text,
    score: q.score,
    tags: q.tags,
    choices: q.choices,
    correct: q.correct,
    allow_file_upload: false,
    attachment_url: null
  }));
  const { data: insQ, error: qErr } = await supabase
    .from('exam_questions')
    .insert(questionRows)
    .select('id, code');
  if (qErr || !insQ) throw new Error(`questions insert: ${qErr?.message}`);
  console.log(`  ✓ questions ${insQ.length}건`);

  const share_code = await buildShareCode();
  const { data: exam, error: eErr } = await supabase
    .from('exams')
    .insert({
      name: cfg.examName,
      description: cfg.examDesc,
      time_limit_minutes: null,
      fullscreen_required: true,
      share_code
    })
    .select('id')
    .single();
  if (eErr || !exam) throw new Error(`exam insert: ${eErr?.message}`);
  console.log(`  ✓ exam id=${exam.id.slice(0, 8)}  share_code=${share_code}`);

  const codeToId = new Map(insQ.map((q) => [q.code, q.id]));
  const qieRows = allRows.map((q, idx) => ({
    exam_id: exam.id,
    question_id: codeToId.get(q.code)!,
    order_no: idx + 1
  }));
  const { error: qieErr } = await supabase.from('exam_questions_in_exam').insert(qieRows);
  if (qieErr) throw new Error(`qie insert: ${qieErr.message}`);
  console.log(`  ✓ exam_questions_in_exam ${qieRows.length}건`);
}

async function main() {
  console.log(`mode: ${APPLY ? 'APPLY' : 'dry-run'}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  for (const cfg of SHEETS) {
    const sh = wb.getWorksheet(cfg.sheetName);
    if (!sh) {
      console.log(`  ⚠ 시트 없음: ${cfg.sheetName}`);
      continue;
    }
    const rows = parseSheet(sh);
    await importOne(cfg, rows);
  }
  console.log('\n완료.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
