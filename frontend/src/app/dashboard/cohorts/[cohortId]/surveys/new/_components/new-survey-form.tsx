'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { autoShareCode } from '@/lib/share-code';
import { createSatisfactionSurvey } from '../_actions';

type Instructor = {
  id: string;
  name: string;
  affiliation: string | null;
  specialty: string | null;
};

type CloneSource = {
  id: string;
  title: string;
  share_code: string | null;
};

type Props = {
  cohortId: string;
  cohortName: string;
  instructors: Instructor[];
  cloneSources: CloneSource[];
};

const DEFAULT_TITLE = '2026 AI 챔피언 고급 과정 만족도 조사';

function todayPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function NewSurveyForm({ cohortId, cohortName, instructors, cloneSources }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 복제
  const [useClone, setUseClone] = useState(false);
  const [cloneFromId, setCloneFromId] = useState('');

  // 폼 필드
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [sessionDate, setSessionDate] = useState(todayPlusDays(7));
  const [shareCode, setShareCode] = useState(autoShareCode(todayPlusDays(7), cohortName));
  const [shareCodeEdited, setShareCodeEdited] = useState(false);

  const [specialInstructorId, setSpecialInstructorId] = useState('');
  const [specialSessionTitle, setSpecialSessionTitle] = useState('');
  const [techInstructorId, setTechInstructorId] = useState('');
  const [techSessionTitle, setTechSessionTitle] = useState('');

  // 차수일 변경 시 share_code 자동 갱신 (사용자가 수정 안 했을 때만)
  useEffect(() => {
    if (!shareCodeEdited) {
      setShareCode(autoShareCode(sessionDate, cohortName));
    }
  }, [sessionDate, shareCodeEdited, cohortName]);

  // 복제 토글
  const handleCloneToggle = (checked: boolean) => {
    setUseClone(checked);
    if (!checked) {
      // 복제 끄면 기본값으로
      setTitle(DEFAULT_TITLE);
      setSpecialInstructorId('');
      setSpecialSessionTitle('');
      setTechInstructorId('');
      setTechSessionTitle('');
      setCloneFromId('');
    }
  };

  // 원본 설문 변경 시 prefill (제목만 — 강사·세션 정보는 별도 fetch 필요하지만 단순화)
  const handleCloneSourceChange = (id: string) => {
    setCloneFromId(id);
    const src = cloneSources.find((s) => s.id === id);
    if (src) {
      setTitle(src.title);
    }
  };

  const instructorOptions = useMemo(
    () =>
      instructors.map((i) => ({
        value: i.id,
        label: i.affiliation ? `${i.name} (${i.affiliation})` : i.name
      })),
    [instructors]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createSatisfactionSurvey({
        cohortId,
        title,
        shareCode,
        sessionDate,
        specialInstructorId,
        specialSessionTitle,
        techInstructorId,
        techSessionTitle
      });
      // createSatisfactionSurvey가 성공 시 redirect, 실패 시 { error } 반환
      if (result && 'error' in result) {
        setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className='max-w-2xl space-y-6'>
      {/* 복제 옵션 */}
      <div className='rounded-xl border bg-card px-6 py-5'>
        <label className='flex cursor-pointer items-start gap-3'>
          <input
            type='checkbox'
            checked={useClone}
            onChange={(e) => handleCloneToggle(e.target.checked)}
            className='mt-1'
          />
          <div className='flex-1'>
            <div className='text-sm font-semibold'>기존 설문 복제</div>
            <p className='mt-0.5 text-xs text-muted-foreground'>
              기존 만족도 설문을 기준으로 메타를 prefill 합니다. 강사·날짜는 따로 입력.
            </p>
          </div>
        </label>
        {useClone && (
          <select
            value={cloneFromId}
            onChange={(e) => handleCloneSourceChange(e.target.value)}
            className='mt-3 w-full rounded-md border bg-background px-3 py-2 text-sm'
          >
            <option value=''>원본 설문 선택…</option>
            {cloneSources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} {s.share_code ? `(${s.share_code})` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 메타 */}
      <div className='rounded-xl border bg-card px-6 py-5'>
        <h3 className='mb-4 text-sm font-bold'>설문 정보</h3>
        <div className='space-y-4'>
          <Field label='제목' required>
            <input
              type='text'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className='w-full rounded-md border bg-background px-3 py-2 text-sm'
            />
          </Field>

          <div className='grid grid-cols-2 gap-4'>
            <Field label='차수일' required>
              <input
                type='date'
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className='w-full rounded-md border bg-background px-3 py-2 text-sm'
              />
            </Field>
            <Field
              label='공유 코드'
              required
              hint={shareCodeEdited ? undefined : '차수일 기반 자동 생성. 수정 가능.'}
            >
              <input
                type='text'
                value={shareCode}
                onChange={(e) => {
                  setShareCode(e.target.value);
                  setShareCodeEdited(true);
                }}
                className='w-full rounded-md border bg-background px-3 py-2 font-mono text-sm'
              />
            </Field>
          </div>
        </div>
      </div>

      {/* 강사 + 세션 */}
      <div className='rounded-xl border bg-card px-6 py-5'>
        <h3 className='mb-4 text-sm font-bold'>강의 구성</h3>
        <div className='space-y-5'>
          <div>
            <div className='mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
              섹션 4 — 특강 강사
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <Field label='강사' required>
                <select
                  value={specialInstructorId}
                  onChange={(e) => setSpecialInstructorId(e.target.value)}
                  className='w-full rounded-md border bg-background px-3 py-2 text-sm'
                >
                  <option value=''>강사 선택…</option>
                  {instructorOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label='세션 제목' required>
                <input
                  type='text'
                  value={specialSessionTitle}
                  onChange={(e) => setSpecialSessionTitle(e.target.value)}
                  placeholder='특강: AI는 도구, 핵심은 사람'
                  className='w-full rounded-md border bg-background px-3 py-2 text-sm'
                />
              </Field>
            </div>
          </div>

          <div>
            <div className='mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
              섹션 5 — 기술교육 강사
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <Field label='강사' required>
                <select
                  value={techInstructorId}
                  onChange={(e) => setTechInstructorId(e.target.value)}
                  className='w-full rounded-md border bg-background px-3 py-2 text-sm'
                >
                  <option value=''>강사 선택…</option>
                  {instructorOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label='세션 제목' required>
                <input
                  type='text'
                  value={techSessionTitle}
                  onChange={(e) => setTechSessionTitle(e.target.value)}
                  placeholder='기술교육 N회차: ...'
                  className='w-full rounded-md border bg-background px-3 py-2 text-sm'
                />
              </Field>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className='rounded-md bg-red-50 px-4 py-3 text-sm font-medium text-red-700'>{error}</div>
      )}

      <div className='flex justify-end gap-2'>
        <button
          type='button'
          onClick={() => router.back()}
          className='rounded-md border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted'
        >
          취소
        </button>
        <button
          type='submit'
          disabled={pending}
          className='rounded-md bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-2 text-sm font-semibold text-white hover:from-blue-700 hover:to-blue-800 disabled:opacity-50'
        >
          {pending ? '생성 중...' : '설문 생성'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  hint,
  children
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className='block text-xs font-semibold text-muted-foreground'>
        {label}
        {required && <span className='ml-1 text-red-500'>*</span>}
      </label>
      <div className='mt-1'>{children}</div>
      {hint && <div className='mt-1 text-[11px] text-muted-foreground'>{hint}</div>}
    </div>
  );
}
