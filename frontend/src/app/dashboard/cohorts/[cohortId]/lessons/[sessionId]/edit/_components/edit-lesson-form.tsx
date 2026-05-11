'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateLesson } from '../../../_actions';

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
  sessionId: string;
  initialDate: string;
  initialTitle: string;
  initialLocationId: string | null;
  initialInstructorIds: string[];
  instructors: Instructor[];
  locations: Location[];
  hasSurvey: boolean;
};

export function EditLessonForm({
  cohortId,
  sessionId,
  initialDate,
  initialTitle,
  initialLocationId,
  initialInstructorIds,
  instructors,
  locations,
  hasSurvey
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [sessionDate, setSessionDate] = useState(initialDate);
  const [title, setTitle] = useState(initialTitle);
  const [locationId, setLocationId] = useState<string>(initialLocationId ?? '');
  const [instructorIds, setInstructorIds] = useState<string[]>(
    initialInstructorIds.length > 0 ? initialInstructorIds : ['']
  );

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
      const result = await updateLesson({
        cohortId,
        sessionId,
        sessionDate,
        title,
        locationId: locationId || null,
        instructorIds: cleanIds
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/dashboard/cohorts/${cohortId}/lessons`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className='max-w-2xl space-y-6'>
      <div className='rounded-xl border bg-card px-6 py-5'>
        <h3 className='mb-4 text-sm font-bold'>수업 정보</h3>
        <div className='space-y-4'>
          <div className='grid grid-cols-2 gap-4'>
            <div>
              <label className='block text-xs font-semibold text-muted-foreground'>
                날짜 <span className='text-red-500'>*</span>
              </label>
              <input
                type='date'
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className='mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm'
              />
            </div>
            <div>
              <label className='block text-xs font-semibold text-muted-foreground'>
                수업 제목 <span className='text-red-500'>*</span>
              </label>
              <input
                type='text'
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className='mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm'
              />
            </div>
          </div>

          <div>
            <label className='block text-xs font-semibold text-muted-foreground'>장소</label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className='mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm'
            >
              <option value=''>장소 미지정</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

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

      {hasSurvey && (
        <div className='rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100'>
          ⓘ 이 수업에는 이미 만족도 설문이 생성돼 있습니다. <strong>강사를 변경해도 기존 만족도 문항의 강사 매핑은 그대로</strong>입니다. 강사 바뀐 새 만족도가 필요하면 만족도 페이지에서 삭제 후 재생성하세요.
        </div>
      )}

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
          {pending ? '저장 중...' : '저장'}
        </button>
      </div>
    </form>
  );
}
