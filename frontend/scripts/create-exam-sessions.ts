/**
 * 시험 응시자 세션 발급.
 * - 특정 exam_id를 인자로 받아 그 시험의 응시자 세션 + 개별 토큰 발급
 * - 명단은 CSV 또는 --name / --email 로 직접 지정 (테스트용)
 * - 학생 테이블(students)과 매칭할 경우 --cohort=<uuid> 로 자동 발급
 *
 * usage:
 *   # 테스트 세션 1개 발급
 *   bun run scripts/create-exam-sessions.ts --exam=<exam_id> --name=승우 --email=test@example.com --apply
 *
 *   # cohort의 students 전체 발급
 *   bun run scripts/create-exam-sessions.ts --exam=<exam_id> --cohort=<cohort_id> --apply
 *
 *   # CSV: name,email 헤더
 *   bun run scripts/create-exam-sessions.ts --exam=<exam_id> --csv=path/to/list.csv --apply
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const APPLY = process.argv.includes('--apply');
const arg = (name: string): string | undefined => {
  const v = process.argv.find((a) => a.startsWith(`--${name}=`));
  return v?.slice(name.length + 3);
};

function randomToken(len = 16): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

async function uniqueToken(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const t = randomToken(16);
    const { data } = await s.from('exam_sessions').select('id').eq('token', t).maybeSingle();
    if (!data) return t;
  }
  throw new Error('token 충돌');
}

type Candidate = { name: string; email: string | null; student_id: string | null };

async function collectCandidates(): Promise<Candidate[]> {
  const cohortId = arg('cohort');
  const csv = arg('csv');
  const name = arg('name');
  const email = arg('email');

  if (name) {
    return [{ name, email: email ?? null, student_id: null }];
  }
  if (csv) {
    const rows: Candidate[] = [];
    const text = fs.readFileSync(csv, 'utf8');
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const [header, ...body] = lines;
    const cols = header.split(',').map((c) => c.trim().toLowerCase());
    const iName = cols.indexOf('name');
    const iEmail = cols.indexOf('email');
    for (const line of body) {
      const parts = line.split(',');
      const n = parts[iName]?.trim();
      if (!n) continue;
      rows.push({ name: n, email: parts[iEmail]?.trim() ?? null, student_id: null });
    }
    return rows;
  }
  if (cohortId) {
    const { data } = await s
      .from('students')
      .select('id, name, email, personal_email')
      .eq('cohort_id', cohortId);
    return (data ?? []).map((st) => ({
      name: st.name,
      email: st.email ?? st.personal_email ?? null,
      student_id: st.id
    }));
  }
  throw new Error('명단 소스 없음. --name / --cohort / --csv 중 하나 지정.');
}

async function main() {
  const examId = arg('exam');
  if (!examId) throw new Error('--exam=<exam_id> 필요');

  const { data: exam } = await s.from('exams').select('id, name').eq('id', examId).maybeSingle();
  if (!exam) throw new Error(`exam 없음: ${examId}`);

  const cands = await collectCandidates();
  console.log(`\n[${exam.name}] 발급 예정: ${cands.length}명 (mode: ${APPLY ? 'APPLY' : 'dry-run'})`);

  const results: { name: string; token: string }[] = [];
  for (const c of cands) {
    // 이미 있는 세션 확인 (student_id 우선, 없으면 email)
    let existing;
    if (c.student_id) {
      const { data } = await s
        .from('exam_sessions')
        .select('id, token')
        .eq('exam_id', examId)
        .eq('student_id', c.student_id)
        .maybeSingle();
      existing = data;
    } else if (c.email) {
      const { data } = await s
        .from('exam_sessions')
        .select('id, token')
        .eq('exam_id', examId)
        .eq('email', c.email)
        .maybeSingle();
      existing = data;
    }

    if (existing) {
      results.push({ name: c.name, token: existing.token ?? '(no token)' });
      console.log(`  · ${c.name}: 이미 발급됨 (${existing.token})`);
      continue;
    }

    if (!APPLY) {
      results.push({ name: c.name, token: '(dry-run)' });
      console.log(`  · ${c.name}: [dry-run] 발급 예정`);
      continue;
    }

    const token = await uniqueToken();
    const { error } = await s.from('exam_sessions').insert({
      exam_id: examId,
      student_id: c.student_id,
      name: c.name,
      email: c.email,
      token,
      status: 'in_progress' // 초기값. started_at은 실제 시작 시 세팅
    });
    if (error) {
      console.log(`  · ${c.name}: ERR ${error.message}`);
      continue;
    }
    results.push({ name: c.name, token });
    console.log(`  ✓ ${c.name}: /exam/${token}`);
  }

  console.log(`\n총 ${results.length}건 처리 완료.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
