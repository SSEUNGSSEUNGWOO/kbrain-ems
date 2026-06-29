// 일회성 — 그린2/블루3/⑥ 3개 .xls 파일을 직접 import (server action 로직 복제).
// 실행: bun run scripts/_batch-import-3files.ts
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

const TARGETS: { file: string; cohortName: string }[] = [
  {
    file: 'C:\\Users\\USER\\Downloads\\(260623_1800) 2026년 ⑥ 노코드 AI 서비스 구현.xls',
    cohortName: '노코드 AI 서비스 구현'
  },
  {
    file: 'C:\\Users\\USER\\Downloads\\(260623_1800) 2026년 AI 챔피언 그린(초급) 종합과정 2회차.xls',
    cohortName: 'AI 챔피언 그린 2회차'
  },
  {
    file: 'C:\\Users\\USER\\Downloads\\(260623_1800) 2026년 AI 챔피언 블루(중급) 종합과정 3회차.xls',
    cohortName: 'AI 챔피언 블루 3회차'
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
  newApplicants: number;
  updatedApplicants: number;
  newOrganizations: number;
  newApplications: number;
  updatedApplications: number;
  answersWritten: number;
  skippedNoName: number;
  errors: string[];
};

async function importOne(file: string, cohortName: string): Promise<Stats> {
  const stats: Stats = {
    cohort: cohortName,
    newApplicants: 0,
    updatedApplicants: 0,
    newOrganizations: 0,
    newApplications: 0,
    updatedApplications: 0,
    answersWritten: 0,
    skippedNoName: 0,
    errors: []
  };
  console.log(`\n${'='.repeat(80)}\n→ ${cohortName}\n${'='.repeat(80)}`);

  const buf = fs.readFileSync(file);
  const rows = parseAnyXls(new Uint8Array(buf));
  const preRows = rows.filter((r) => r.surveyType === '사전설문');
  console.log(`  parsed: ${rows.length} rows (pre=${preRows.length})`);

  const { data: cohort } = await supabase
    .from('cohorts')
    .select('id, name')
    .eq('name', cohortName)
    .maybeSingle();
  if (!cohort) {
    stats.errors.push(`cohort not found: ${cohortName}`);
    return stats;
  }
  const cohortId = cohort.id;

  const { data: qData } = await supabase
    .from('application_questions')
    .select('id, question_no, question_type, section, choices, correct_choice, display_order')
    .eq('cohort_id', cohortId)
    .order('display_order', { ascending: true });
  const questions = (qData ?? []) as unknown as Array<AppQuestion & { id: string }>;
  console.log(`  DB questions: ${questions.length}`);

  // multi 자동 매핑 (autoSuggest)
  const preview = buildPreview(preRows, questions);
  const multiMapping: Record<string, Record<string, string>> = {};
  for (const mq of preview.multiQuestions) {
    multiMapping[mq.question_no] = { ...mq.autoSuggest };
  }

  const qC2 = questions.find((q) => q.question_no === 'C2');
  const qC3 = questions.find((q) => q.question_no === 'C3');
  const qC5 = questions.find((q) => q.question_no === 'C5');
  const c2Idx = qC2 ? questions.indexOf(qC2) : -1;
  const c3Idx = qC3 ? questions.indexOf(qC3) : -1;
  const c5Idx = qC5 ? questions.indexOf(qC5) : -1;

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

      if (applicantId) {
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

      const { data: existingApp } = await supabase
        .from('applications')
        .select('id')
        .eq('applicant_id', applicantId)
        .eq('cohort_id', cohortId)
        .is('track_id', null)
        .limit(1);
      let applicationId: string;
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
        const { error } = await supabase
          .from('application_answers')
          .upsert(answerRows as never, { onConflict: 'application_id,question_id' });
        if (error) throw new Error(`answers upsert: ${error.message}`);
        stats.answersWritten += answerRows.length;
      }

      if (i % 50 === 0) {
        console.log(`  ... ${i}/${preRows.length} (new=${stats.newApplicants}, upd=${stats.updatedApplicants})`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      stats.errors.push(`row ${i} (${row.name}): ${msg}`);
    }
  }

  console.log(`  ✓ done: new=${stats.newApplicants} upd=${stats.updatedApplicants} newApp=${stats.newApplications} updApp=${stats.updatedApplications} answers=${stats.answersWritten} errors=${stats.errors.length}`);
  return stats;
}

async function main() {
  const all: Stats[] = [];
  for (const t of TARGETS) {
    const s = await importOne(t.file, t.cohortName);
    all.push(s);
  }
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  for (const s of all) {
    console.log(
      `${s.cohort}\n  applicants: new ${s.newApplicants} / updated ${s.updatedApplicants} | orgs new ${s.newOrganizations}\n  applications: new ${s.newApplications} / updated ${s.updatedApplications}\n  answers: ${s.answersWritten} | skipped(no-name): ${s.skippedNoName} | errors: ${s.errors.length}`
    );
    if (s.errors.length > 0) {
      for (const e of s.errors.slice(0, 5)) console.log(`    ⚠ ${e}`);
      if (s.errors.length > 5) console.log(`    ... 외 ${s.errors.length - 5}건`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
