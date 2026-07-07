// 그린 자기주도형 1회차 신청 응답 재import (지식평가·활용계획 포함, application_answers에 정확히 저장).
// DRY_RUN=1 bun run scripts/reimport-green-sd1.ts  → dry-run
//            bun run scripts/reimport-green-sd1.ts  → 실 import
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

const FILE = 'C:/Users/USER/Desktop/(260703_1800) 2026년 AI 챔피언 그린(초급) 수행평가 1회차 (7월 28일, 자기주도형).xls';
const COHORT_ID = '77af39f8-2012-4c88-b213-6631ca942e33';
const COHORT_NAME = 'AI 챔피언 그린 자기주도형 1회차';

const normC2 = (s: string) => s.replace(/\s+/g, '').replace(/[·、,「」『』""'']/g, '');
const C2_LABEL: Record<string, string> = {
  '①': '중앙부처',
  '②': '광역지자체',
  '③': '기초지자체',
  '④': '공공기관',
  '⑤': '교육행정기관',
  '⑥': '기타'
};

(async () => {
  console.log(`\n${DRY_RUN ? '[DRY]' : '[REAL]'} ${COHORT_NAME}`);
  const buf = fs.readFileSync(FILE);
  const rows = parseAnyXls(new Uint8Array(buf));
  const preRows = rows.filter((r) => r.surveyType === '사전설문');
  console.log(`파일 사전설문: ${preRows.length}명`);

  const { data: qData } = await supabase
    .from('application_questions')
    .select('id, question_no, question_type, section, choices, correct_choice, weight, display_order')
    .eq('cohort_id', COHORT_ID)
    .is('track_id', null)
    .order('display_order');
  const questions = (qData ?? []) as unknown as Array<AppQuestion & { id: string; weight: number | null }>;
  console.log(`DB 문항: ${questions.length}`);

  const preview = buildPreview(preRows, questions);
  const multiMapping: Record<string, Record<string, string>> = {};
  for (const mq of preview.multiQuestions) {
    multiMapping[mq.question_no] = { ...mq.autoSuggest };
  }

  const idxOf = (no: string) => questions.findIndex((q) => q.question_no === no);
  const c2Idx = idxOf('C2');
  const c3Idx = idxOf('C3');
  const c5Idx = idxOf('C5');
  const planIdx = idxOf('Plan');
  const qC2 = questions[c2Idx];

  const knowledgeQs = questions.filter((q) => q.section === 'knowledge');
  const knowledgeTotal = knowledgeQs.reduce((s, q) => s + Number(q.weight ?? 1), 0);
  console.log(`지식평가: ${knowledgeQs.length}문항 · 총점 ${knowledgeTotal}`);

  const orgCache = new Map<string, string>();
  const getOrCreateOrg = async (name: string): Promise<string | null> => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (orgCache.has(trimmed)) return orgCache.get(trimmed)!;
    const { data: existing } = await supabase.from('organizations').select('id').eq('name', trimmed).limit(1);
    if (existing && existing[0]) { orgCache.set(trimmed, existing[0].id); return existing[0].id; }
    if (DRY_RUN) { orgCache.set(trimmed, '(dry)'); return '(dry)'; }
    const { data: created, error } = await supabase.from('organizations').insert({ name: trimmed }).select('id').single();
    if (error) throw new Error(`org: ${error.message}`);
    orgCache.set(trimmed, created.id); return created.id;
  };

  const today = new Date().toISOString().slice(0, 10);

  let processed = 0, answersWritten = 0, errors = 0, updApps = 0, newApps = 0;

  for (const row of preRows) {
    processed++;
    try {
      if (!row.name) continue;
      const orgId = await getOrCreateOrg(row.organizationName);

      // applicant lookup by phone or email
      let applicantId: string | null = null;
      if (!DRY_RUN) {
        if (row.phone) {
          const { data } = await supabase.from('applicants').select('id').eq('name', row.name).eq('phone', row.phone).limit(1);
          applicantId = data?.[0]?.id ?? null;
        }
        if (!applicantId && row.email) {
          const { data } = await supabase.from('applicants').select('id').eq('name', row.name).eq('email', row.email).limit(1);
          applicantId = data?.[0]?.id ?? null;
        }
      }

      const department = c3Idx >= 0 ? row.rawValues[c3Idx] || null : null;
      const jobRoleRaw = c5Idx >= 0 ? row.rawValues[c5Idx] || null : null;
      const jobRole = jobRoleRaw ? jobRoleRaw.replace(/^\d+\.\s*/, '').trim() : null;

      let category: string | null = null;
      if (c2Idx >= 0 && qC2) {
        const raw = row.rawValues[c2Idx];
        if (raw) {
          const m = raw.match(/^\d+\.\s*([①②③④⑤⑥])/);
          if (m && C2_LABEL[m[1]]) category = C2_LABEL[m[1]];
          else {
            const stripped = raw.replace(/^\d+\.\s*/, '').trim();
            const target = normC2(stripped);
            for (const c of qC2.choices ?? []) {
              if (normC2(c.text) === target && C2_LABEL[c.key]) { category = C2_LABEL[c.key]; break; }
            }
          }
        }
      }

      const applicantFields: Record<string, unknown> = {
        name: row.name,
        phone: row.phone || null,
        email: row.email || null,
        organization_id: orgId,
        department,
        job_role: jobRole,
        category
      };

      if (!DRY_RUN) {
        if (applicantId) {
          const { error } = await supabase.from('applicants').update(applicantFields).eq('id', applicantId);
          if (error) throw new Error(`applicant update: ${error.message}`);
        } else {
          const { data, error } = await supabase.from('applicants').insert(applicantFields).select('id').single();
          if (error) throw new Error(`applicant insert: ${error.message}`);
          applicantId = data.id;
        }
      }

      // application 조회/insert
      let applicationId = '(dry)';
      let planText: string | null = null;
      if (!DRY_RUN) {
        const { data: existingApp } = await supabase
          .from('applications')
          .select('id')
          .eq('applicant_id', applicantId!)
          .eq('cohort_id', COHORT_ID)
          .is('track_id', null)
          .limit(1);
        if (existingApp && existingApp[0]) {
          applicationId = existingApp[0].id;
          updApps++;
        } else {
          const { data: created, error } = await supabase.from('applications').insert({
            applicant_id: applicantId,
            cohort_id: COHORT_ID,
            status: 'applied',
            applied_at: today
          }).select('id').single();
          if (error) throw new Error(`app insert: ${error.message}`);
          applicationId = created.id;
          newApps++;
        }
      }

      // answers
      const answerRows: { application_id: string; question_id: string; answer_value: unknown }[] = [];
      let correctCount = 0;
      let score = 0;
      for (let qi = 0; qi < questions.length; qi++) {
        const q = questions[qi];
        const raw = row.rawValues[qi];
        if (!raw) continue;
        const multiMap = multiMapping[q.question_no];
        const val = mapAnswerValue(raw, q, multiMap);
        if (val === null || val === undefined) continue;
        answerRows.push({ application_id: applicationId, question_id: q.id, answer_value: val });

        if (q.section === 'knowledge' && q.correct_choice && typeof val === 'string' && val === q.correct_choice) {
          correctCount++;
          score += Number(q.weight ?? 1);
        }
        if (q.question_no === 'Plan' && typeof val === 'string') planText = val;
      }

      if (!DRY_RUN) {
        // 기존 answers 삭제 후 재삽입 (upsert 대신 완전 재구축)
        await supabase.from('application_answers').delete().eq('application_id', applicationId);
        if (answerRows.length > 0) {
          const { error } = await supabase
            .from('application_answers')
            .insert(answerRows as never);
          if (error) throw new Error(`answers: ${error.message}`);
        }
        // 채점 결과 + motivation + status
        const { error: updErr } = await supabase
          .from('applications')
          .update({
            status: 'applied',
            motivation: planText,
            knowledge_score: score,
            knowledge_correct_count: correctCount,
            knowledge_total_count: knowledgeQs.length,
            self_diagnosis: null
          })
          .eq('id', applicationId);
        if (updErr) throw new Error(`app upd: ${updErr.message}`);
      }
      answersWritten += answerRows.length;
      if (processed % 30 === 0) console.log(`  ${processed}/${preRows.length}`);
    } catch (e) {
      errors++;
      console.log(`  ✗ row ${processed} (${row.name}): ${(e as Error).message}`);
    }
  }
  console.log(`\n[결과] 처리 ${processed} · newApps ${newApps} · updApps ${updApps} · answers ${answersWritten} · errors ${errors}`);
})();
