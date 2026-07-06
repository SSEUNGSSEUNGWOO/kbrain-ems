'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { isDeveloper } from '@/lib/auth';

function randomToken(len = 16): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

export type IssueRow = { name: string; email: string | null };
export type IssueResult = {
  name: string;
  email: string | null;
  token: string;
  status: 'created' | 'existing';
  url: string;
};

export async function issueExamSessions(
  examId: string,
  rows: IssueRow[]
): Promise<{ error?: string; results?: IssueResult[]; created?: number; existing?: number }> {
  if (!(await isDeveloper())) return { error: '권한이 없습니다.' };
  if (rows.length === 0) return { error: '명단이 비어있습니다.' };
  if (rows.length > 500) return { error: '한 번에 500명 초과 발급 불가.' };

  const s = createAdminClient();
  const { data: exam } = await s.from('exams').select('id').eq('id', examId).maybeSingle();
  if (!exam) return { error: '시험이 없습니다.' };

  // 기존 세션 조회 (이메일 기준 중복 방지)
  const emails = rows.map((r) => r.email).filter((e): e is string => !!e);
  const { data: existing } = await s
    .from('exam_sessions')
    .select('id, name, email, token')
    .eq('exam_id', examId)
    .in('email', emails.length > 0 ? emails : ['__none__']);
  const existingByEmail = new Map<string, { token: string; name: string | null }>();
  for (const e of existing ?? []) {
    if (e.email) existingByEmail.set(e.email.toLowerCase(), { token: e.token ?? '', name: e.name });
  }

  const results: IssueResult[] = [];
  const inserts: {
    exam_id: string;
    name: string;
    email: string | null;
    token: string;
    status: 'in_progress';
  }[] = [];

  for (const r of rows) {
    const emailKey = r.email?.toLowerCase();
    if (emailKey && existingByEmail.has(emailKey)) {
      const ex = existingByEmail.get(emailKey)!;
      results.push({
        name: r.name,
        email: r.email,
        token: ex.token,
        status: 'existing',
        url: `/exam/${ex.token}`
      });
      continue;
    }
    const token = randomToken();
    inserts.push({
      exam_id: examId,
      name: r.name,
      email: r.email,
      token,
      status: 'in_progress'
    });
    results.push({
      name: r.name,
      email: r.email,
      token,
      status: 'created',
      url: `/exam/${token}`
    });
  }

  if (inserts.length > 0) {
    const { error } = await s.from('exam_sessions').insert(inserts);
    if (error) return { error: `발급 실패: ${error.message}` };
  }

  revalidatePath(`/dashboard/exams/${examId}`);
  return {
    results,
    created: inserts.length,
    existing: results.length - inserts.length
  };
}
