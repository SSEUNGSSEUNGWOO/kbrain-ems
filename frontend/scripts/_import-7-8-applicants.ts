// 일회성 — ⑦/⑧ 자격연계형 1회차 신청자 import.
// 실행: bun run scripts/_import-7-8-applicants.ts            (실 import)
//      DRY_RUN=1 bun run scripts/_import-7-8-applicants.ts   (dry-run)
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  parseAnyXls,
  buildPreview,
  mapAnswerValue,
  type AppQuestion
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

const TARGETS = [
  {
    file:
      'C:\\Dev\\새 폴더\\6월 26일 18시 마감된 신청자 내역 파일\\(260626_1800) 2026년 ⑦ 생성형 AI 활용 데이터분석 심화 1회차 (자격연계형).xls',
    cohortId: '70a3fc72-0af0-473b-9745-0f39ecaeae9f',
    cohortName: '생성형 AI 활용 데이터분석 심화 1회차'
  },
  {
    file:
      'C:\\Dev\\새 폴더\\6월 26일 18시 마감된 신청자 내역 파일\\(260626_1800) 2026년 ⑧ 바이브 코딩 LLM 서비스 개발 1회차 (자격연계형).xls',
    cohortId: '64fe381e-3bf7-48b5-ac79-d052854c87cc',
    cohortName: '바이브 코딩 LLM 서비스 개발 1회차'
  }
];

// _batch-import-3files.ts 와 동일
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

  const buf = fs.readFileSync(file);
  const rows = parseAnyXls(new Uint8Array(buf));
  const preRows = rows.filter((r) => r.surveyType === '사전설문');
  stats.parsedRows = preRows.length;
  console.log(`  parsed: ${rows.length} rows (사전설문=${preRows.length})`);

  const { data: qData } = await supabase
    .from('application_questions')
    .select('id, question_no, question_type, section, choices, correct_choice, display_order')
    .eq('cohort_id', cohortId)
    .is('track_id', null)
    .order('display_order', { ascending: true });
  const questions = (qData ?? []) as unknown as Array<AppQuestion & { id: string; display_order: number }>;
  console.log(`  DB questions: ${questions.length} (display_order 0~${questions.length - 1})`);

  // multi 자동 매핑 (예: 678~682 → ①~⑤)
  const preview = buildPreview(preRows, questions);
  const multiMapping: Record<string, Record<string, string>> = {};
  for (const mq of preview.multiQuestions) {
    multiMapping[mq.question_no] = { ...mq.autoSuggest };
    console.log(`  multi[${mq.question_no}] autoSuggest:`, mq.autoSuggest);
  }

  // 매핑 인덱스
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
  console.log(`IMPORT — ${DRY_RUN ? 'DRY RUN (DB 변경 없음)' : '실 import (DB에 적재)'}`);
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
