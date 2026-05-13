'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { setCohortRecruitmentRound } from '../../_actions';

export type RoundOption = {
  id: string;
  round_no: number;
  label: string | null;
  application_start_at: string | null;
  application_end_at: string | null;
};

const UNSET = '__unset__';

export function RoundSelector({
  cohortId,
  currentRoundId,
  rounds
}: {
  cohortId: string;
  currentRoundId: string | null;
  rounds: RoundOption[];
}) {
  const [isPending, startTransition] = useTransition();

  function onChange(value: string) {
    const newRoundId = value === UNSET ? null : value;
    startTransition(async () => {
      const res = await setCohortRecruitmentRound(cohortId, newRoundId);
      if (res.error) {
        toast.error(`라운드 매핑 실패: ${res.error}`);
      } else {
        toast.success(
          newRoundId
            ? `${rounds.find((r) => r.id === newRoundId)?.label ?? ''} 매핑됨`
            : '라운드 매핑 해제됨'
        );
      }
    });
  }

  return (
    <Select value={currentRoundId ?? UNSET} onValueChange={onChange} disabled={isPending}>
      <SelectTrigger className='h-8 w-[200px] text-sm' aria-label='모집 라운드 선택'>
        <SelectValue placeholder='모집 라운드 선택' />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNSET}>매핑 안 함</SelectItem>
        {rounds.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            {r.label ?? `${r.round_no}차 모집`}
            {r.application_start_at && r.application_end_at && (
              <span className='text-muted-foreground ml-2 text-xs'>
                {r.application_start_at.slice(5)}~{r.application_end_at.slice(5)}
              </span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
