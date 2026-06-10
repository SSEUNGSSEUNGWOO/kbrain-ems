'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { updateLinkedCohorts } from '../_actions';

type CohortOption = {
  id: string;
  name: string;
  category: string | null;
};

type Props = {
  cohortId: string;
  surveyId: string;
  primaryCohortName: string;
  initialLinked: string[];
  availableCohorts: CohortOption[];
};

export function LinkedCohorts({
  cohortId,
  surveyId,
  primaryCohortName,
  initialLinked,
  availableCohorts
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialLinked));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const dirty =
    selected.size !== initialLinked.length ||
    initialLinked.some((id) => !selected.has(id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaved(false);
  };

  const onSave = () => {
    setError(null);
    startTransition(async () => {
      const res = await updateLinkedCohorts(cohortId, surveyId, [...selected]);
      if (res.error) {
        setError(res.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <section className='rounded-xl border bg-card px-6 py-5 shadow-sm'>
      <div className='mb-3 flex items-baseline justify-between'>
        <div>
          <h2 className='text-sm font-bold'>설문 적용 cohort</h2>
          <p className='mt-0.5 text-xs text-muted-foreground'>
            1기·2기 통합 설문처럼 한 설문을 여러 기수에 적용할 때 추가 cohort 를 선택하세요.
            응답률 분모도 자동으로 합산됩니다.
          </p>
        </div>
        {dirty && (
          <Button size='sm' onClick={onSave} disabled={pending}>
            {pending ? '저장 중...' : '저장'}
          </Button>
        )}
      </div>

      <div className='mb-3 rounded-md border-l-2 border-blue-400 bg-blue-50/40 px-3 py-2 dark:border-blue-500 dark:bg-blue-900/10'>
        <div className='text-[11px] font-medium text-blue-700 dark:text-blue-300'>1차 (현재) cohort</div>
        <div className='mt-0.5 text-sm font-semibold'>{primaryCohortName}</div>
      </div>

      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
        {availableCohorts.length === 0 ? (
          <div className='col-span-full text-xs text-muted-foreground'>
            연결 가능한 다른 cohort 가 없습니다.
          </div>
        ) : (
          availableCohorts.map((c) => {
            const checked = selected.has(c.id);
            return (
              <label
                key={c.id}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer ${
                  checked ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                }`}
              >
                <Checkbox checked={checked} onCheckedChange={() => toggle(c.id)} />
                <span className='flex-1'>{c.name}</span>
                {c.category && (
                  <span className='text-[10px] text-muted-foreground'>{c.category}</span>
                )}
              </label>
            );
          })
        )}
      </div>

      {saved && !dirty && (
        <div className='mt-3 text-xs text-emerald-700 dark:text-emerald-400'>저장됨</div>
      )}
      {error && <div className='mt-3 text-destructive text-sm'>{error}</div>}
    </section>
  );
}
