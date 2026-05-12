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

type InstructorRow = {
  instructorId: string;
  sessionTitle: string;
};

type Props = {
  cohortId: string;
  cohortName: string;
  instructors: Instructor[];
  cloneSources: CloneSource[];
};

const DEFAULT_TITLE = '2026 AI 챔피언 고급 과정 만족도 조사';
const EMPTY_ROW: InstructorRow = { instructorId: '', sessionTitle: '' };

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

  // 강사·세션 — 동적 N명, 기본 1행
  const [instructorRows, setInstructorRows] = useState<InstructorRow[]>([{ ...EMPTY_ROW }]);

  // 차수일 변경 시 share_code 자동 갱신 (사용자가 수정 안 했을 때만)
  useEffect(() => {
    if (!shareCodeEdited) {
      setShareCode(autoShareCode(sessionDate, cohortName));
    }
  }, [sessionDate, shareCodeEdited, cohortName]);

  const addRow = () => setInstructorRows((rows) => [...rows, { ...EMPTY_ROW }]);
  const removeRow = (i: number) =>
    setInstructorRows((rows) => rows.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<InstructorRow>) =>
    setInstructorRows((rows) => rows.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  // 복제 토글
  const handleCloneToggle = (checked: boolean) => {
    setUseClone(checked);
    if (!checked) {
      setTitle(DEFAULT_TITLE);
      setInstructorRows([{ ...EMPTY_ROW }]);
      setCloneFromId('');
    }
  };

  // 원본 설문 변경 시 prefill (제목만 — 강사·세션은 별도 입력)
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
        instructors: instructorRows
      });
      // 성공 시 redirect, 실패 시 { error } 반환
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

      {/* 강사 + 세션 — 동적 N명 */}
      <div className='rounded-xl border bg-card px-6 py-5'>
        <div className='mb-4 flex items-center justify-between'>
          <h3 className='text-sm font-bold'>강의 구성</h3>
          <button
            type='button'
            onClick={addRow}
            className='rounded-md border bg-background px-3 py-1 text-xs font-semibold hover:bg-muted'
          >
            + 강사 추가
          </button>
        </div>
        <p className='mb-4 text-xs text-muted-foreground'>
          강사 1명당 만족도 6문항이 자동 생성됩니다. 최소 1명.
        </p>

        <div className='space-y-3'>
          {instructorRows.map((row, idx) => (
            <div key={idx} className='rounded-lg border bg-background/50 px-4 py-3'>
              <div className='mb-2 flex items-center justify-between'>
                <div className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
                  섹션 {idx + 4} — 강사 {idx + 1}
                </div>
                {instructorRows.length > 1 && (
                  <button
                    type='button'
                    onClick={() => removeRow(idx)}
                    className='text-xs font-semibold text-red-600 hover:underline'
                  >
                    삭제
                  </button>
                )}
              </div>
              <div className='grid grid-cols-2 gap-3'>
                <Field label='강사' required>
                  <select
                    value={row.instructorId}
                    onChange={(e) => updateRow(idx, { instructorId: e.target.value })}
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
                    value={row.sessionTitle}
                    onChange={(e) => updateRow(idx, { sessionTitle: e.target.value })}
                    placeholder='예: 특강 — AI는 도구, 핵심은 사람'
                    className='w-full rounded-md border bg-background px-3 py-2 text-sm'
                  />
                </Field>
              </div>
            </div>
          ))}
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
