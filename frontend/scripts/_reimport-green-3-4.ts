// 그린 3·4회차 누락분 재import (멱등 — 기존자 update / 누락자 insert).
// DRY_RUN=1 bun run scripts/_reimport-green-3-4.ts  → dry-run
//            bun run scripts/_reimport-green-3-4.ts  → 실 import
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
      'C:\\Dev\\새 폴더\\6월 26일 18시 마감된 신청자 내역 파일\\(260626_1800) 2026년 AI 챔피언 그린(초급) 종합과정 3회차.xls',
    cohortId: 'a58022fc-324a-44cb-b418-91f008e7f1a0',
    cohortName: 'AI 챔피언 그린 3회차'
  },
  {
    file:
      'C:\\Dev\\새 폴더\\6월 26일 18시 마감된 신청자 내역 파일\\(260626_1800) 2026년 AI 챔피언 그린(초급) 종합과정 4회차.xls',
    cohortId: '6ef1b2f3-3054-4933-87d9-7964842e2250',
    cohortName: 'AI 챔피언 그린 4회차'
  }
];

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
  parsed: number;
  newApplicants: number;
  updatedApplicants: number;
  newOrgs: number;
  newApps: number;
  updatedApps: number;
  answersWritten: number;
  skippedNoName: number;
  errors: string[];
};

async function importOne(file: string, cohortId: string, cohortName: string): Promise<Stats> {
  const stats: Stats = {
    cohort: cohortName,
    parsed: 0,
    newApplicants: 0,
    updatedApplicants: 0,
    newOrgs: 0,
    newApps: 0,
    updatedApps: 0,
    answersWritten: 0,
    skippedNoName: 0,
    errors: []
  };
  console.log(`\n${'='.repeat(80)}\n→ ${cohortName} ${DRY_RUN ? '[DRY]' : ''}\n${'='.repeat(80)}`);

  const buf = fs.readFileSync(file);
  const rows = parseAnyXls(new Uint8Array(buf));
  const preRows = rows.filter((r) => r.surveyType === '사전설문');
  stats.parsed = preRows.length;
  console.log(`  파일 사전설문: ${preRows.length}명`);

  const { data: qData } = await supabase
    .from('application_questions')
    .select('id, question_no, question_type, section, choices, correct_choice, display_order')
    .eq('cohort_id', cohortId)
    .is('track_id', null)
    .order('display_order');
  const questions = (qData ?? []) as unknown as Array<AppQuestion & { id: string }>;
  console.log(`  DB 질문: ${questions.length}`);

  const preview = buildPreview(preRows, questions);
  const multiMapping: Record<string, Record<string, string>> = {};
  for (const mq of preview.multiQuestions) {
    multiMapping[mq.question_no] = { ...mq.autoSuggest };
  }

  const qC2 = questions.find((q) => q.question_no === 'C2');
  const idxOf = (no: string) => {
    const q = questions.find((x) => x.question_no === no);
    return q ? questions.indexOf(q) : -1;
  };
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
      stats.newOrgs++;
      orgCache.set(trimmed, '(dry)');
      return '(dry)';
    }
    const { data: created, error } = await supabase
      .from('organizations')
      .insert({ name: trimmed })
      .select('id')
      .single();
    if (error) throw new Error(`org insert: ${error.message}`);
    stats.newOrgs++;
    orgCache.set(trimmed, created.id);
    return created.id;
  };

  const today = new Date().toISOString().slice(0, 10);

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

      let applicationId = '(dry)';
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
          stats.updatedApps++;
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
          stats.newApps++;
        }
      } else {
        stats.newApps++;
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
      if (answerRows.length > 0 && !DRY_RUN) {
        const { error } = await supabase
          .from('application_answers')
          .upsert(answerRows as never, { onConflict: 'application_id,question_id' });
        if (error) throw new Error(`answers upsert: ${error.message}`);
        stats.answersWritten += answerRows.length;
      } else if (DRY_RUN) {
        stats.answersWritten += answerRows.length;
      }

      if (i % 50 === 0) {
        console.log(`  ... ${i}/${preRows.length}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      stats.errors.push(`row ${i} (${row.name}): ${msg}`);
    }
  }

  console.log(
    `  ${DRY_RUN ? '[DRY]' : '✓'} ${stats.parsed}명 처리 — newApplicants=${stats.newApplicants} updApplicants=${stats.updatedApplicants} newApps=${stats.newApps} updApps=${stats.updatedApps} answers=${stats.answersWritten} errors=${stats.errors.length}`
  );
  return stats;
}

async function main() {
  console.log(`\n${DRY_RUN ? 'DRY RUN' : 'REAL IMPORT'}`);
  const all: Stats[] = [];
  for (const t of TARGETS) {
    all.push(await importOne(t.file, t.cohortId, t.cohortName));
  }
  console.log('\n' + '='.repeat(80) + '\nSUMMARY\n' + '='.repeat(80));
  for (const s of all) {
    console.log(
      `  ${s.cohort.padEnd(30)} parsed=${s.parsed} newApp=${s.newApps} updApp=${s.updatedApps} answers=${s.answersWritten} errors=${s.errors.length}`
    );
    if (s.errors.length > 0) {
      for (const e of s.errors.slice(0, 10)) console.log(`    err: ${e}`);
      if (s.errors.length > 10) console.log(`    ... ${s.errors.length - 10}건 더`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
