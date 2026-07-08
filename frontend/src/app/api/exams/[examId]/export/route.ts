import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createAdminClient } from '@/lib/supabase/server';
import { isDeveloper } from '@/lib/auth';

type Params = { params: Promise<{ examId: string }> };

export async function GET(_req: Request, { params }: Params) {
  if (!(await isDeveloper())) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }
  const { examId } = await params;
  const supabase = createAdminClient();

  const { data: exam } = await supabase
    .from('exams')
    .select('id, name')
    .eq('id', examId)
    .maybeSingle();
  if (!exam) return NextResponse.json({ error: '시험 없음' }, { status: 404 });

  const [{ data: qie }, { data: sessions }] = await Promise.all([
    supabase
      .from('exam_questions_in_exam')
      .select(
        'order_no, question_id, exam_questions(id, type, text, score, choices, correct, category, difficulty)'
      )
      .eq('exam_id', examId)
      .order('order_no'),
    supabase
      .from('exam_sessions')
      .select(
        'id, name, email, status, started_at, submitted_at, auto_score, manual_score, total_score, browser_events'
      )
      .eq('exam_id', examId)
      .order('created_at', { ascending: true })
  ]);

  type Q = {
    id: string;
    type: 'multiple_choice' | 'short_text' | 'task_based';
    text: string;
    score: number;
    choices: { key: string; text: string }[] | null;
    correct: unknown;
    category: string | null;
    difficulty: string | null;
  };
  const questions = (qie ?? []).map((r) => ({
    order_no: r.order_no,
    q: (r as unknown as { exam_questions: Q }).exam_questions
  }));
  const qById = new Map(questions.map((x) => [x.q.id, x]));

  // PostgREST max-rows(1000) 우회: 응시자 30명 × 문항 36개 = 1080건이라 이미 잘림.
  // range로 chunk fetch해서 전체 응답 로드.
  const sessionIds = (sessions ?? []).map((s) => s.id);
  const allResponses: {
    session_id: string;
    question_id: string;
    answer_value: Record<string, unknown> | null;
    manual_score: number | null;
    feedback: string | null;
  }[] = [];
  if (sessionIds.length > 0) {
    const chunk = 1000;
    for (let from = 0; from < 1_000_000; from += chunk) {
      const { data: batch, error } = await supabase
        .from('exam_responses')
        .select('session_id, question_id, answer_value, manual_score, feedback')
        .in('session_id', sessionIds)
        .range(from, from + chunk - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const arr = batch ?? [];
      allResponses.push(...(arr as typeof allResponses));
      if (arr.length < chunk) break;
    }
  }

  type Resp = {
    session_id: string;
    question_id: string;
    answer_value: Record<string, unknown> | null;
    manual_score: number | null;
    feedback: string | null;
  };
  const responsesBySession = new Map<string, Resp[]>();
  for (const r of (allResponses ?? []) as unknown as Resp[]) {
    const arr = responsesBySession.get(r.session_id) ?? [];
    arr.push(r);
    responsesBySession.set(r.session_id, arr);
  }

  function grade(q: Q, ans: Record<string, unknown> | null, manual: number | null): {
    earned: number;
    isCorrect: 'correct' | 'wrong' | 'pending';
  } {
    if (q.type === 'multiple_choice') {
      const key = (ans as { key?: string } | null)?.key;
      const correctKey = (q.correct as { key?: string } | null)?.key;
      if (key && correctKey && key === correctKey) return { earned: q.score, isCorrect: 'correct' };
      return { earned: 0, isCorrect: key ? 'wrong' : 'pending' };
    }
    if (q.type === 'short_text') {
      const text = String((ans as { text?: string } | null)?.text ?? '').trim().toLowerCase();
      const keywords = ((q.correct as { keywords?: string[] } | null)?.keywords ?? []).map((k) =>
        k.trim().toLowerCase()
      );
      if (text && keywords.some((k) => text === k)) return { earned: q.score, isCorrect: 'correct' };
      return { earned: 0, isCorrect: text ? 'wrong' : 'pending' };
    }
    return { earned: manual ?? 0, isCorrect: manual != null ? 'correct' : 'pending' };
  }

  const wb = new ExcelJS.Workbook();

  // 시트1: 요약
  const summary = wb.addWorksheet('요약');
  summary.columns = [
    { header: '응시자', key: 'name', width: 14 },
    { header: '이메일', key: 'email', width: 26 },
    { header: '상태', key: 'status', width: 10 },
    { header: '자동채점', key: 'auto', width: 10 },
    { header: '수동채점', key: 'manual', width: 10 },
    { header: '총점', key: 'total', width: 10 },
    { header: '이탈 횟수', key: 'exitCount', width: 10 },
    { header: '이탈 총 시간(초)', key: 'exitTotal', width: 16 },
    { header: '이탈 최장(초)', key: 'exitMax', width: 14 },
    { header: '시작', key: 'started', width: 20 },
    { header: '제출', key: 'submitted', width: 20 }
  ];
  summary.getRow(1).font = { bold: true };

  const STATUS_KO: Record<string, string> = {
    in_progress: '진행중',
    submitted: '제출',
    graded: '채점완료'
  };
  for (const sess of sessions ?? []) {
    const events = (Array.isArray(sess.browser_events) ? sess.browser_events : []) as {
      event: string;
      at: string;
      duration_ms?: number;
    }[];
    let exitCount = 0;
    let exitTotalMs = 0;
    let exitMaxMs = 0;
    for (const e of events) {
      exitCount++;
      if (e.duration_ms != null) {
        exitTotalMs += e.duration_ms;
        if (e.duration_ms > exitMaxMs) exitMaxMs = e.duration_ms;
      }
    }
    summary.addRow({
      name: sess.name ?? '',
      email: sess.email ?? '',
      status: STATUS_KO[sess.status] ?? sess.status,
      auto: sess.auto_score,
      manual: sess.manual_score,
      total: sess.total_score,
      exitCount,
      exitTotal: Math.round(exitTotalMs / 1000),
      exitMax: Math.round(exitMaxMs / 1000),
      started: sess.started_at ? new Date(sess.started_at).toLocaleString('ko-KR') : '',
      submitted: sess.submitted_at ? new Date(sess.submitted_at).toLocaleString('ko-KR') : ''
    });
  }

  // 시트2: 응답별
  const detail = wb.addWorksheet('응답');
  detail.columns = [
    { header: '응시자', key: 'name', width: 12 },
    { header: 'Q', key: 'order', width: 5 },
    { header: '유형', key: 'type', width: 10 },
    { header: '카테고리', key: 'category', width: 14 },
    { header: '난이도', key: 'difficulty', width: 8 },
    { header: '배점', key: 'max', width: 6 },
    { header: '응답', key: 'answer', width: 40 },
    { header: '정답', key: 'correct', width: 30 },
    { header: '정오답', key: 'result', width: 8 },
    { header: '획득점수', key: 'earned', width: 10 },
    { header: '피드백', key: 'feedback', width: 20 }
  ];
  detail.getRow(1).font = { bold: true };

  const TYPE_KO: Record<string, string> = {
    multiple_choice: '객관식',
    short_text: '단답형',
    task_based: '작업형'
  };
  for (const sess of sessions ?? []) {
    const resps = responsesBySession.get(sess.id) ?? [];
    const rByQ = new Map(resps.map((r) => [r.question_id, r]));
    for (const { order_no, q } of questions) {
      const r = rByQ.get(q.id);
      const ans = r?.answer_value ?? null;
      const { earned, isCorrect } = grade(q, ans, r?.manual_score ?? null);

      let displayAnswer = '';
      if (q.type === 'multiple_choice') displayAnswer = (ans as { key?: string } | null)?.key ?? '';
      else if (q.type === 'short_text') displayAnswer = (ans as { text?: string } | null)?.text ?? '';
      else {
        const parts: string[] = [];
        if ((ans as { notes?: string } | null)?.notes) parts.push(`메모: ${(ans as { notes: string }).notes}`);
        if ((ans as { url?: string } | null)?.url) parts.push(`URL: ${(ans as { url: string }).url}`);
        displayAnswer = parts.join(' / ');
      }

      let correctText = '';
      if (q.type === 'multiple_choice') correctText = (q.correct as { key?: string } | null)?.key ?? '';
      else if (q.type === 'short_text')
        correctText = ((q.correct as { keywords?: string[] } | null)?.keywords ?? []).join(' / ');
      else correctText = '(수동 채점)';

      detail.addRow({
        name: sess.name ?? '',
        order: order_no,
        type: TYPE_KO[q.type] ?? q.type,
        category: q.category ?? '',
        difficulty: q.difficulty ?? '',
        max: q.score,
        answer: displayAnswer,
        correct: correctText,
        result: isCorrect === 'correct' ? '정답' : isCorrect === 'wrong' ? '오답' : '-',
        earned,
        feedback: r?.feedback ?? ''
      });
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const fname = `${exam.name}_결과_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fname)}"`
    }
  });
}
