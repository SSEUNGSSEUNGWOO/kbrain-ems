'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { autoShareCode } from '@/lib/share-code';
import { createLesson } from '../../_actions';

type Instructor = {
  id: string;
  name: string;
  affiliation: string | null;
};

type Location = {
  id: string;
  name: string;
};

type Props = {
  cohortId: string;
  cohortName: string;
  instructors: Instructor[];
  locations: Location[];
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NewLessonForm({ cohortId, cohortName, instructors, locations }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [sessionDate, setSessionDate] = useState(todayIso());
  const [title, setTitle] = useState('');
  const [locationId, setLocationId] = useState<string>('');
  const [instructorIds, setInstructorIds] = useState<string[]>(['']);

  // 옵션 토글
  const [withAssignment, setWithAssignment] = useState(false);
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [withSurvey, setWithSurvey] = useState(false);
  const [surveyShareCode, setSurveyShareCode] = useState(autoShareCode(todayIso(), cohortName));
  const [shareCodeEdited, setShareCodeEdited] = useState(false);

  useEffect(() => {
    if (!shareCodeEdited) setSurveyShareCode(autoShareCode(sessionDate, cohortName));
  }, [sessionDate, shareCodeEdited, cohortName]);

  const handleInstructorChange = (idx: number, value: string) => {
    setInstructorIds((prev) => prev.map((v, i) => (i === idx ? value : v)));
  };
  const addInstructor = () => setInstructorIds((prev) => [...prev, '']);
  const removeInstructor = (idx: number) => {
    setInstructorIds((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanIds = instructorIds.filter(Boolean);
    if (cleanIds.length === 0) {
      setError('강사를 최소 1명 선택해주세요.');
      return;
    }
    startTransition(async () => {
      const result = await createLesson({
        cohortId,
        sessionDate,
        title,
        locationId: locationId || null,
        instructorIds: cleanIds,
        withAssignment,
        assignmentTitle: withAssignment ? assignmentTitle : undefined,
        withSurvey,
        surveyShareCode: withSurvey ? surveyShareCode : undefined,
        surveyTitle: undefined
      });
      if (result && 'error' in result && result.error) {
        setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className='max-w-2xl space-y-6'>
      {/* 메타 */}
      <div className='rounded-xl border bg-card px-6 py-5'>
        <h3 className='mb-4 text-sm font-bold'>수업 정보</h3>
        <div className='space-y-4'>
          <div className='grid grid-cols-2 gap-4'>
            <Field label='날짜' required>
              <input
                type='date'
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className='w-full rounded-md border bg-background px-3 py-2 text-sm'
              />
            </Field>
            <Field label='수업 제목' required>
              <input
                type='text'
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='예: 기술교육 2회차: 프롬프트 엔지니어링'
                className='w-full rounded-md border bg-background px-3 py-2 text-sm'
              />
            </Field>
          </div>

          <Field label='장소'>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className='w-full rounded-md border bg-background px-3 py-2 text-sm'
            >
              <option value=''>장소 미지정</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>

          {/* 강사 목록 */}
          <div>
            <label className='mb-2 block text-xs font-semibold text-muted-foreground'>
              강사 <span className='text-red-500'>*</span>
            </label>
            <div className='space-y-2'>
              {instructorIds.map((id, idx) => (
                <div key={idx} className='flex items-center gap-2'>
                  <span className='w-6 shrink-0 text-center text-xs font-semibold text-muted-foreground'>
                    {idx + 1}
                  </span>
                  <select
                    value={id}
                    onChange={(e) => handleInstructorChange(idx, e.target.value)}
                    className='flex-1 rounded-md border bg-background px-3 py-2 text-sm'
                  >
                    <option value=''>강사 선택…</option>
                    {instructors.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.affiliation ? `${i.name} (${i.affiliation})` : i.name}
                      </option>
                    ))}
                  </select>
                  {instructorIds.length > 1 && (
                    <button
                      type='button'
                      onClick={() => removeInstructor(idx)}
                      className='shrink-0 rounded-md border px-2 py-2 text-xs text-muted-foreground hover:bg-muted'
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type='button'
              onClick={addInstructor}
              className='mt-2 rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-muted'
            >
              + 강사 추가
            </button>
          </div>
        </div>
      </div>

      {/* 자동 생성 옵션 */}
      <div className='rounded-xl border bg-card px-6 py-5'>
        <h3 className='mb-4 text-sm font-bold'>함께 자동 생성</h3>

        <div className='mb-4 rounded-md border-l-4 border-emerald-400 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-100'>
          ☑ <strong>출결</strong> — 학생 전원에 결석 row 자동 생성 (출결 페이지에서 변경)
        </div>

        <div className='space-y-3'>
          {/* 과제 */}
          <label className='flex items-start gap-3'>
            <input
              type='checkbox'
              checked={withAssignment}
              onChange={(e) => setWithAssignment(e.target.checked)}
              className='mt-1'
            />
            <div className='flex-1'>
              <div className='text-sm font-semibold'>과제 자동 추가</div>
              <p className='text-xs text-muted-foreground'>이 수업과 연결된 과제 1개 생성</p>
              {withAssignment && (
                <input
                  type='text'
                  value={assignmentTitle}
                  onChange={(e) => setAssignmentTitle(e.target.value)}
                  placeholder={`${title || '수업'} 과제`}
                  className='mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm'
                />
              )}
            </div>
          </label>

          {/* 만족도 */}
          <label className='flex items-start gap-3'>
            <input
              type='checkbox'
              checked={withSurvey}
              onChange={(e) => setWithSurvey(e.target.checked)}
              className='mt-1'
            />
            <div className='flex-1'>
              <div className='text-sm font-semibold'>만족도 설문 자동 생성</div>
              <p className='text-xs text-muted-foreground'>
                강사 {instructorIds.filter(Boolean).length || 'N'}명 기준 동적 문항 ·
                학생 전원 토큰 자동 발급
              </p>
              {withSurvey && (
                <div className='mt-2'>
                  <label className='block text-[11px] font-semibold text-muted-foreground'>
                    공유 코드 (카톡방용)
                  </label>
                  <input
                    type='text'
                    value={surveyShareCode}
                    onChange={(e) => {
                      setSurveyShareCode(e.target.value);
                      setShareCodeEdited(true);
                    }}
                    className='mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm'
                  />
                </div>
              )}
            </div>
          </label>
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
          {pending ? '생성 중...' : '수업 생성'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className='block text-xs font-semibold text-muted-foreground'>
        {label}
        {required && <span className='ml-1 text-red-500'>*</span>}
      </label>
      <div className='mt-1'>{children}</div>
    </div>
  );
}
