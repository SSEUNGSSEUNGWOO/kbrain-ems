// 일회성 — ⑦/⑧ 자격연계형 2회차 신청자 import.
// 1회차(scripts/archive/_import-7-8-applicants.ts)와 동일 패턴 + 2회차 파일 변형 대응:
//  - 파일이 17컬럼 (기관메일이 메타 이메일과 중복으로 한 컬럼 더 있음) → [5] 드롭해 16문항 정렬
//  - 인접 셀 중복으로 18컬럼인 행 존재 → 인접 중복 제거로 17컬럼 정규화
//  - 2회차 cohort에 C-CERT 문항이 없어 import 전에 추가 (1회차와 동일, 멱등)
// 실행: bun run scripts/import-7-8-round2.ts            (실 import)
//      DRY_RUN=1 bun run scripts/import-7-8-round2.ts   (dry-run)
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  parseAnyXls,
  buildPreview,
  mapAnswerValue,
  type AppQuestion,
  type ParsedRow
} from '../src/lib/applications-xls-parser';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

const KAKAO_DIR = 'C:\\Users\\USER\\Documents\\카카오톡 받은 파일';
const TARGETS = [
  {
    file: path.join(KAKAO_DIR, '2026년 ⑦ 생성형 AI 활용 데이터분석 심화 2회차 (자격연계형).xls'),
    cohortId: '2911af2c-cc7c-4f45-9e04-9a058fffd7da',
    cohortName: '생성형 AI 활용 데이터분석 심화 2회차'
  },
  {
    file: path.join(KAKAO_DIR, '2026년 ⑧ 바이브 코딩 LLM 서비스 개발 2회차 (자격연계형).xls'),
    cohortId: '23270f14-79c8-47b5-a536-7aef00053f26',
    cohortName: '바이브 코딩 LLM 서비스 개발 2회차'
  }
];

const CERT_QUESTION_TEXT =
  '【 자격 연계 】본 과정은 AI 챔피언 자격연계형 과목입니다. 지정한 AI 자격증 3종 중 취득한 자격증명, 자격번호를 작성해주세요.';

// C-CERT 문항 추가 (1회차 _add-cert-question.ts와 동일, 멱등)
async function ensureCertQuestion(cohortId: string, cohortName: string) {
  const { data: existing } = await supabase
    .from('application_questions')
    .select('id')
    .eq('cohort_id', cohortId)
    .eq('question_no', 'C-CERT')
    .is('track_id', null)
    .maybeSingle();
  if (existing) {
    console.log(`  [${cohortName}] C-CERT 이미 존재 — 스킵`);
    return;
  }
  if (DRY_RUN) {
    console.log(`  [${cohortName}] [DRY] C-CERT 추가 예정 (display_order=1, 이후 +1 시프트)`);
    return;
  }
  const { data: toShift } = await supabase
    .from('application_questions')
    .select('id, display_order')
    .eq('cohort_id', cohortId)
    .is('track_id', null)
    .gte('display_order', 1)
    .order('display_order', { ascending: false });
  for (const q of toShift ?? []) {
    const { error } = await supabase
      .from('application_questions')
      .update({ display_order: (q as { display_order: number }).display_order + 1 })
      .eq('id', (q as { id: string }).id);
    if (error) throw new Error(`display_order 시프트 실패: ${error.message}`);
  }
  const { error: insErr } = await supabase.from('application_questions').insert({
    cohort_id: cohortId,
    track_id: null,
    section: 'common',
    question_no: 'C-CERT',
    question_text: CERT_QUESTION_TEXT,
    question_type: 'text',
    choices: null,
    correct_choice: null,
    weight: 1,
    display_order: 1
  });
  if (insErr) throw new Error(`C-CERT insert 실패: ${insErr.message}`);
  console.log(`  [${cohortName}] ✓ C-CERT 추가`);
}

// 인접 중복 제거 → 17컬럼, 기관메일([5]) 드롭 → 16컬럼 (문항 순서와 1:1)
const SINGLE_LIKE = /^\d+\.\s/;
const U1_LIKE = /^\d+(\|\|\d+)*$/;

function normalizeRow(row: ParsedRow, warn: string[]): string[] | null {
  let vals = [...row.rawValues];
  // 1) 18컬럼 이상 → 인접 중복 제거로 17로 축소
  while (vals.length > 17) {
    const dupIdx = vals.findIndex((v, i) => i > 0 && v && v === vals[i - 1]);
    if (dupIdx === -1) break;
    vals.splice(dupIdx, 1);
  }
  // 2) 표준형 검사: C5·직급 자리가 단일선택 형태 + [15]가 U1 패턴(또는 빈값)
  const standard =
    vals.length === 17 &&
    SINGLE_LIKE.test(vals[7] ?? '') &&
    SINGLE_LIKE.test(vals[8] ?? '') &&
    (!vals[15] || U1_LIKE.test(vals[15]));
  if (standard) {
    const out = [...vals];
    out.splice(5, 1);
    return out;
  }
  // 3) 꼬리 고정 재구성: Plan(마지막, U1 패턴이면 무응답) ← U1 ← 지식6+직급+C5(8칸 고정),
  //    머리 5칸(C1~C4) 고정, 사이 이메일존에서 마지막 @포함 셀이 C-EMAIL.
  vals = [...row.rawValues];
  let plan = '';
  if (vals.length && !U1_LIKE.test(vals[vals.length - 1])) plan = vals.pop()!;
  let u1 = '';
  if (vals.length && U1_LIKE.test(vals[vals.length - 1])) u1 = vals.pop()!;
  if (vals.length < 13) {
    warn.push(`${row.name}: 재구성 실패 (컬럼 부족 ${row.rawValues.length})`);
    return null;
  }
  const tail8 = vals.splice(vals.length - 8, 8); // [C5, 직급, 지식×6]
  const head5 = vals.splice(0, 5); // [C1, C-CERT, C2, C3, C4]
  const zone = vals; // 이메일존
  const cEmail = [...zone].reverse().find((v) => v.includes('@')) ?? zone[zone.length - 1] ?? '';
  const out = [...head5, cEmail, ...tail8, u1, plan];
  if (!SINGLE_LIKE.test(out[6]) || !SINGLE_LIKE.test(out[7])) {
    warn.push(`${row.name}: 재구성 후에도 C5/직급 형태 불일치 — 수동 확인 필요`);
    return null;
  }
  warn.push(`${row.name}: 꼬리 고정 재구성 적용 (${row.rawValues.length}컬럼, C-EMAIL=${cEmail})`);
  return out;
}

const normC2 = (s: string) => s.replace(/\s+/g, '').replace(/[·、,「」『』""'']/g, '');
const C2_LABEL: Record<string, string> = {
  '①': '중앙부처',
  '②': '광역지자체',
  '③': '기초지자체',
  '④': '공공기관',
  '⑤': '교육행정기관',
  '⑥': '기타'
};

type Stats = {
  cohort: string;
  parsedRows: number;
  newApplicants: number;
  updatedApplicants: number;
  newOrganizations: number;
  newApplications: number;
  updatedApplications: number;
  answersWritten: number;
  skippedNoName: number;
  errors: string[];
};

async function importOne(file: string, cohortId: string, cohortName: string): Promise<Stats> {
  const stats: Stats = {
    cohort: cohortName,
    parsedRows: 0,
    newApplicants: 0,
    updatedApplicants: 0,
    newOrganizations: 0,
    newApplications: 0,
    updatedApplications: 0,
    answersWritten: 0,
    skippedNoName: 0,
    errors: []
  };
  console.log(`\n${'='.repeat(80)}\n→ ${cohortName} ${DRY_RUN ? '[DRY RUN]' : ''}\n${'='.repeat(80)}`);

  await ensureCertQuestion(cohortId, cohortName);

  const buf = fs.readFileSync(file);
  const rows = parseAnyXls(new Uint8Array(buf));
  const preRaw = rows.filter((r) => r.surveyType === '사전설문');

  // 행 정규화 (17→16컬럼)
  const normWarnings: string[] = [];
  const preRows: ParsedRow[] = [];
  for (const r of preRaw) {
    const vals = normalizeRow(r, normWarnings);
    if (vals) preRows.push({ ...r, rawValues: vals });
  }
  stats.parsedRows = preRows.length;
  console.log(`  parsed: ${rows.length} rows (사전설문=${preRaw.length}, 정규화 성공=${preRows.length})`);
  for (const w of normWarnings) console.log(`  ⚠ ${w}`);

  const { data: qData } = await supabase
    .from('application_questions')
    .select('id, question_no, question_type, section, choices, correct_choice, display_order')
    .eq('cohort_id', cohortId)
    .is('track_id', null)
    .order('display_order', { ascending: true });
  let questions = (qData ?? []) as unknown as Array<AppQuestion & { id: string; display_order: number }>;
  // dry-run에서 C-CERT 미추가 상태면 가상 문항을 끼워 매핑 미리보기
  if (DRY_RUN && !questions.some((q) => q.question_no === 'C-CERT')) {
    questions = [
      questions[0],
      {
        id: '(dry-cert)',
        question_no: 'C-CERT',
        question_type: 'text',
        section: 'common',
        choices: null,
        correct_choice: null,
        display_order: 1
      } as (typeof questions)[number],
      ...questions.slice(1)
    ];
  }
  console.log(`  DB questions: ${questions.length} — ${questions.map((q) => q.question_no).join(', ')}`);
  if (questions.length !== 16) {
    stats.errors.push(`문항 수 ${questions.length} ≠ 16 — 중단`);
    return stats;
  }

  const preview = buildPreview(preRows, questions);
  const multiMapping: Record<string, Record<string, string>> = {};
  for (const mq of preview.multiQuestions) {
    multiMapping[mq.question_no] = { ...mq.autoSuggest };
    console.log(`  multi[${mq.question_no}] autoSuggest:`, mq.autoSuggest);
    const unmapped = Object.entries(mq.autoSuggest).filter(([, v]) => !v);
    if (unmapped.length > 0) {
      stats.errors.push(`multi[${mq.question_no}] 매핑 안 된 외부 ID: ${unmapped.map(([k]) => k).join(', ')} — 중단`);
      return stats;
    }
  }
  if (preview.unknownSingleValues.length > 0) {
    console.log(`  ⚠ 단일선택 매핑 실패 ${preview.unknownSingleValues.length}건:`);
    for (const u of preview.unknownSingleValues.slice(0, 10)) {
      console.log(`    ${u.question_no} row${u.row}: ${u.raw.slice(0, 60)}`);
    }
  }

  const qByNo = (no: string) => questions.find((q) => q.question_no === no);
  const idxOf = (no: string) => {
    const q = qByNo(no);
    return q ? questions.indexOf(q) : -1;
  };
  const qC2 = qByNo('C2');
  const c2Idx = idxOf('C2');
  const c3Idx = idxOf('C3');
  const c5Idx = idxOf('C5');

  const orgCache = new Map<string, string>();
  const getOrCreateOrg = async (name: string): Promise<string | null> => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const cached = orgCache.get(trimmed);
    if (cached) return cached;
    const { data: existing } = await supabase
      .from('organizations')
      .select('id')
      .eq('name', trimmed)
      .limit(1);
    if (existing && existing[0]) {
      orgCache.set(trimmed, existing[0].id);
      return existing[0].id;
    }
    if (DRY_RUN) {
      stats.newOrganizations++;
      orgCache.set(trimmed, '(dry-run-new-org)');
      return '(dry-run-new-org)';
    }
    const { data: created, error } = await supabase
      .from('organizations')
      .insert({ name: trimmed })
      .select('id')
      .single();
    if (error) throw new Error(`org insert: ${error.message}`);
    stats.newOrganizations++;
    orgCache.set(trimmed, created.id);
    return created.id;
  };

  const today = new Date().toISOString().slice(0, 10);
  const samples: string[] = [];

  let i = 0;
  for (const row of preRows) {
    i++;
    try {
      if (!row.name) {
        stats.skippedNoName++;
        continue;
      }
      const orgId = await getOrCreateOrg(row.organizationName);

      let applicantId: string | null = null;
      if (!DRY_RUN) {
        if (row.phone) {
          const { data } = await supabase
            .from('applicants')
            .select('id')
            .eq('name', row.name)
            .eq('phone', row.phone)
            .limit(1);
          applicantId = data?.[0]?.id ?? null;
        }
        if (!applicantId && row.email) {
          const { data } = await supabase
            .from('applicants')
            .select('id')
            .eq('name', row.name)
            .eq('email', row.email)
            .limit(1);
          applicantId = data?.[0]?.id ?? null;
        }
      }

      const department = c3Idx >= 0 ? row.rawValues[c3Idx] || null : null;
      const jobRoleRaw = c5Idx >= 0 ? row.rawValues[c5Idx] || null : null;
      const jobRole = jobRoleRaw ? jobRoleRaw.replace(/^\d+\.\s*/, '').trim() : null;

      let category: string | null = null;
      if (c2Idx >= 0 && qC2) {
        const c2Raw = row.rawValues[c2Idx];
        if (c2Raw) {
          const m = c2Raw.match(/^\d+\.\s*([①②③④⑤⑥])/);
          if (m && C2_LABEL[m[1]]) {
            category = C2_LABEL[m[1]];
          } else {
            const stripped = c2Raw.replace(/^\d+\.\s*/, '').trim();
            const target = normC2(stripped);
            for (const c of qC2.choices ?? []) {
              if (normC2(c.text) === target && C2_LABEL[c.key]) {
                category = C2_LABEL[c.key];
                break;
              }
            }
          }
        }
      }

      const applicantFields = {
        name: row.name,
        phone: row.phone || null,
        email: row.email || null,
        organization_id: orgId,
        department,
        job_role: jobRole,
        category
      } as unknown as Record<string, unknown>;

      if (DRY_RUN) {
        if (samples.length < 3) {
          samples.push(
            `${row.name} | ${row.organizationName} | dept=${department ?? '-'} | role=${jobRole ?? '-'} | cat=${category ?? '-'}`
          );
        }
        stats.newApplicants++;
      } else if (applicantId) {
        const { error } = await supabase
          .from('applicants')
          .update(applicantFields)
          .eq('id', applicantId);
        if (error) throw new Error(`applicant update: ${error.message}`);
        stats.updatedApplicants++;
      } else {
        const { data, error } = await supabase
          .from('applicants')
          .insert(applicantFields)
          .select('id')
          .single();
        if (error) throw new Error(`applicant insert: ${error.message}`);
        applicantId = data.id;
        stats.newApplicants++;
      }

      let applicationId = '(dry-run)';
      if (!DRY_RUN) {
        const { data: existingApp } = await supabase
          .from('applications')
          .select('id')
          .eq('applicant_id', applicantId!)
          .eq('cohort_id', cohortId)
          .is('track_id', null)
          .limit(1);
        if (existingApp && existingApp[0]) {
          applicationId = existingApp[0].id;
          const { error } = await supabase
            .from('applications')
            .update({ applied_at: today })
            .eq('id', applicationId);
          if (error) throw new Error(`application update: ${error.message}`);
          stats.updatedApplications++;
        } else {
          const { data: created, error } = await supabase
            .from('applications')
            .insert({
              applicant_id: applicantId,
              cohort_id: cohortId,
              status: 'applied',
              applied_at: today
            })
            .select('id')
            .single();
          if (error) throw new Error(`application insert: ${error.message}`);
          applicationId = created.id;
          stats.newApplications++;
        }
      } else {
        stats.newApplications++;
      }

      const answerRows: { application_id: string; question_id: string; answer_value: unknown }[] = [];
      for (let qi = 0; qi < questions.length; qi++) {
        const q = questions[qi];
        const raw = row.rawValues[qi];
        if (!raw) continue;
        const multiMap = multiMapping[q.question_no];
        const val = mapAnswerValue(raw, q, multiMap);
        if (val === null || val === undefined) continue;
        answerRows.push({
          application_id: applicationId,
          question_id: q.id,
          answer_value: val
        });
      }
      if (answerRows.length > 0) {
        if (DRY_RUN) {
          if (i === 1) {
            console.log(`\n  [DRY] 첫 응답자(${row.name}) 답안 매핑:`);
            for (const a of answerRows) {
              const q = questions.find((x) => x.id === a.question_id)!;
              const v = typeof a.answer_value === 'string' ? a.answer_value.slice(0, 60) : JSON.stringify(a.answer_value);
              console.log(`    ${q.question_no.padEnd(12)} (${q.question_type}) ← ${v}`);
            }
          }
          stats.answersWritten += answerRows.length;
        } else {
          const { error } = await supabase
            .from('application_answers')
            .upsert(answerRows as never, { onConflict: 'application_id,question_id' });
          if (error) throw new Error(`answers upsert: ${error.message}`);
          stats.answersWritten += answerRows.length;
        }
      }

      if (i % 50 === 0) {
        console.log(`  ... ${i}/${preRows.length}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      stats.errors.push(`row ${i} (${row.name}): ${msg}`);
    }
  }

  if (DRY_RUN && samples.length > 0) {
    console.log(`\n  [DRY] 신청자 샘플 3건:`);
    for (const s of samples) console.log(`    ${s}`);
  }

  console.log(
    `\n  ${DRY_RUN ? '[DRY]' : '✓'} ${stats.parsedRows}명 처리 — newApplicants=${stats.newApplicants} updatedApplicants=${stats.updatedApplicants} newOrgs=${stats.newOrganizations} newApps=${stats.newApplications} answers=${stats.answersWritten} errors=${stats.errors.length}`
  );
  return stats;
}

async function main() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`IMPORT ⑦⑧ 2회차 — ${DRY_RUN ? 'DRY RUN (DB 변경 없음)' : '실 import (DB에 적재)'}`);
  console.log(`${'='.repeat(80)}`);

  const all: Stats[] = [];
  for (const t of TARGETS) {
    const s = await importOne(t.file, t.cohortId, t.cohortName);
    all.push(s);
  }

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  for (const s of all) {
    console.log(
      `  ${s.cohort.padEnd(45)} parsed=${s.parsedRows} new=${s.newApplicants} upd=${s.updatedApplicants} apps=${s.newApplications} answers=${s.answersWritten} errors=${s.errors.length}`
    );
    if (s.errors.length > 0) {
      console.log(`    errors:`);
      for (const e of s.errors.slice(0, 10)) console.log(`      - ${e}`);
      if (s.errors.length > 10) console.log(`      ... (${s.errors.length - 10}건 더)`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
