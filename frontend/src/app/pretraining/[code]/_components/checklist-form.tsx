'use client';

import { useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitChecklistResponse, verifyStudent } from '../_actions';

type Item = {
  id: string;
  question_no: string;
  text: string;
  guide_url: string | null;
  parent_id: string | null;
  parent_answer: string | null;
  no_hint: string | null;
};

type Props = {
  checklistId: string;
  items: Item[];
  inquiryPhones: string[] | null;
};

type Student = {
  id: string;
  name: string;
  organizationName: string | null;
  phone: string | null;
};

export function ChecklistForm({ checklistId, items, inquiryPhones }: Props) {
  const [student, setStudent] = useState<Student | null>(null);

  if (!student) {
    return (
      <VerifyStep
        checklistId={checklistId}
        onMatch={setStudent}
        inquiryPhones={inquiryPhones}
      />
    );
  }
  return (
    <AnswerStep
      checklistId={checklistId}
      items={items}
      student={student}
      onBack={() => setStudent(null)}
    />
  );
}

function VerifyStep({
  checklistId,
  onMatch,
  inquiryPhones
}: {
  checklistId: string;
  onMatch: (s: Student) => void;
  inquiryPhones: string[] | null;
}) {
  const [name, setName] = useState('');
  const [last4, setLast4] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await verifyStudent(checklistId, name, last4);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.student) onMatch(res.student);
    });
  };

  return (
    <form onSubmit={onSubmit} className='border-border bg-card rounded-xl border px-6 py-6 shadow-sm'>
      <h2 className='text-foreground mb-1 text-base font-bold'>본인 확인</h2>
      <p className='text-muted-foreground mb-4 text-xs'>
        등록된 교육생 명단과 매칭됩니다. 이름과 연락처 뒷 4자리를 입력해주세요.
      </p>
      <div className='grid gap-3'>
        <div className='grid gap-1.5'>
          <Label htmlFor='vname'>이름 *</Label>
          <Input
            id='vname'
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='홍길동'
            required
          />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor='vlast4'>휴대전화 뒷 4자리 *</Label>
          <Input
            id='vlast4'
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder='5678'
            inputMode='numeric'
            maxLength={4}
            required
          />
        </div>
      </div>

      {error && (
        <div className='bg-destructive/10 text-destructive mt-3 rounded-md px-3 py-2 text-sm'>
          {error}
          {inquiryPhones && inquiryPhones.length > 0 && (
            <div className='text-destructive mt-1.5 text-xs'>
              📞 운영팀 문의:{' '}
              {inquiryPhones.map((p, i) => (
                <span key={p}>
                  {i > 0 && <span className='mx-1 opacity-50'>·</span>}
                  <a
                    href={`tel:${p.replace(/-/g, '')}`}
                    className='font-semibold underline'
                  >
                    {p}
                  </a>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <Button type='submit' disabled={pending || !name.trim() || last4.length !== 4} className='mt-5 h-11 w-full text-base'>
        {pending ? '확인 중...' : '확인'}
      </Button>
    </form>
  );
}

function AnswerStep({
  checklistId,
  items,
  student,
  onBack
}: {
  checklistId: string;
  items: Item[];
  student: Student;
  onBack: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, 'yes' | 'no'>>({});
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const visibleItems = useMemo(() => {
    return items.filter((it) => {
      if (!it.parent_id) return true;
      const parentAns = answers[it.parent_id];
      return parentAns === (it.parent_answer ?? 'yes');
    });
  }, [items, answers]);

  const setAnswer = (id: string, value: 'yes' | 'no') => {
    setAnswers((prev) => {
      const next = { ...prev, [id]: value };
      for (const it of items) {
        if (it.parent_id === id && it.parent_answer !== value) {
          delete next[it.id];
        }
      }
      return next;
    });
  };

  const allAnswered = visibleItems.every((it) => answers[it.id] === 'yes' || answers[it.id] === 'no');
  const allYes = visibleItems.every((it) => answers[it.id] === 'yes');
  const hasNo = visibleItems.some((it) => answers[it.id] === 'no');
  const canSubmit = allYes && !pending;

  const onSubmit = () => {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const res = await submitChecklistResponse(checklistId, student.id, {
        name: student.name,
        organization: student.organizationName,
        phone: student.phone,
        answers
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  if (submitted) {
    return (
      <div className='rounded-xl border bg-emerald-50/50 px-6 py-12 text-center shadow-sm'>
        <div className='text-lg font-bold text-emerald-700'>응답이 제출되었습니다</div>
        <p className='mt-2 text-sm text-emerald-700/80'>{student.name}님, 참여해주셔서 감사합니다.</p>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-5'>
      {/* 응답자 확인 카드 — 비편집 */}
      <section className='border-border bg-card rounded-xl border px-6 py-4 shadow-sm'>
        <div className='flex items-start justify-between gap-3'>
          <div className='flex flex-col gap-0.5'>
            <div className='text-muted-foreground text-xs font-semibold'>응답자</div>
            <div className='text-foreground text-base font-bold'>{student.name}</div>
            {student.organizationName && (
              <div className='text-muted-foreground text-xs'>{student.organizationName}</div>
            )}
          </div>
          <button
            type='button'
            onClick={onBack}
            className='text-muted-foreground hover:text-foreground text-xs underline'
          >
            본인 아님
          </button>
        </div>
      </section>

      {/* 항목 */}
      <section className='flex flex-col gap-3'>
        {visibleItems.map((it) => {
          const ans = answers[it.id];
          return (
            <div key={it.id} className='border-border bg-card rounded-xl border px-5 py-4 shadow-sm'>
              <div className='flex items-start gap-2'>
                <span className='text-muted-foreground mt-0.5 font-mono text-xs'>{it.question_no}.</span>
                <div className='flex-1'>
                  <div className='text-foreground text-sm'>{it.text}</div>
                  {it.guide_url && (
                    <a
                      href={it.guide_url}
                      target='_blank'
                      rel='noreferrer'
                      className='text-primary mt-1 inline-block text-xs hover:underline'
                    >
                      {it.guide_url}
                    </a>
                  )}
                </div>
              </div>
              <div className='mt-3 flex gap-2'>
                <button
                  type='button'
                  onClick={() => setAnswer(it.id, 'yes')}
                  className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                    ans === 'yes'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-border bg-card text-foreground hover:bg-muted'
                  }`}
                >
                  예
                </button>
                <button
                  type='button'
                  onClick={() => setAnswer(it.id, 'no')}
                  className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                    ans === 'no'
                      ? 'border-rose-500 bg-rose-50 text-rose-700'
                      : 'border-border bg-card text-foreground hover:bg-muted'
                  }`}
                >
                  아니오
                </button>
              </div>
              {ans === 'no' && it.no_hint && (
                <div className='mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800'>💡 {it.no_hint}</div>
              )}
            </div>
          );
        })}
      </section>

      {error && <div className='bg-destructive/10 text-destructive rounded-md px-4 py-3 text-sm'>{error}</div>}

      {hasNo && (
        <div className='rounded-md border-l-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-800'>
          <div className='font-semibold'>아직 준비가 안 된 항목이 있습니다</div>
          <div className='mt-1 text-xs leading-relaxed'>
            가이드를 보고 설치·가입을 완료하신 후 모든 항목을 <strong>"예"</strong>로 변경해주세요.
            모든 항목이 "예"가 되어야 제출할 수 있습니다.
          </div>
        </div>
      )}

      <Button type='button' onClick={onSubmit} disabled={!canSubmit} className='h-12 text-base'>
        {pending
          ? '제출 중...'
          : !allAnswered
            ? '모든 항목에 답해주세요'
            : hasNo
              ? '"아니오" 항목을 "예"로 변경 후 제출'
              : '제출하기'}
      </Button>
    </div>
  );
}
