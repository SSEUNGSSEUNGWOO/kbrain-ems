'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type TallyResult = {
  totalBallots: number;
  voters: { name: string; at: string }[];
  results: {
    id: string;
    order_no: number;
    presenter: string;
    topic: string | null;
    cover_image_url: string | null;
    votes: number;
  }[];
};

const RANK_BADGE = ['🥇', '🥈', '🥉'];

export function LiveResults({ voteId, isOpen }: { voteId: string; isOpen: boolean }) {
  const { data, isLoading } = useQuery<TallyResult>({
    queryKey: ['presentation-tally', voteId],
    queryFn: async () => {
      const res = await fetch(`/api/presentations/${voteId}/tally`, { cache: 'no-store' });
      if (!res.ok) throw new Error('tally fetch failed');
      return res.json();
    },
    refetchInterval: isOpen ? 3000 : 15000
  });

  if (isLoading || !data) {
    return (
      <Card>
        <CardContent className='text-muted-foreground py-8 text-center text-sm'>
          집계 로딩 중...
        </CardContent>
      </Card>
    );
  }

  const total = data.totalBallots;
  const max = Math.max(1, ...data.results.map((r) => r.votes));

  return (
    <div className='flex flex-col gap-4'>
      <Card>
        <CardContent className='flex items-center justify-between px-6 py-4'>
          <div>
            <div className='text-2xl font-bold'>{total}</div>
            <div className='text-muted-foreground text-xs'>총 응답</div>
          </div>
          <Badge
            variant='outline'
            className={
              isOpen
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-slate-300 bg-slate-50 text-slate-600'
            }
          >
            {isOpen ? '실시간 (3초 갱신)' : '15초 갱신'}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardContent className='flex flex-col gap-2 px-6 py-5'>
          <h3 className='text-base font-semibold'>득표 순위</h3>
          <div className='flex flex-col gap-2'>
            {data.results.map((r, i) => {
              const pct = total > 0 ? Math.round((r.votes / total) * 100) : 0;
              const barPct = (r.votes / max) * 100;
              return (
                <div key={r.id} className='flex items-center gap-3'>
                  <div className='w-8 text-center text-lg'>{RANK_BADGE[i] ?? `${i + 1}`}</div>
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center justify-between'>
                      <div className='truncate text-sm font-medium'>
                        {r.order_no}. {r.presenter}
                        {r.topic && (
                          <span className='text-muted-foreground ml-2 font-normal'>{r.topic}</span>
                        )}
                      </div>
                      <div className='text-sm font-semibold whitespace-nowrap'>
                        {r.votes}표 · {pct}%
                      </div>
                    </div>
                    <div className='bg-muted mt-1 h-2 rounded'>
                      <div className='h-2 rounded bg-emerald-500' style={{ width: `${barPct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className='flex flex-col gap-2 px-6 py-5'>
          <h3 className='text-base font-semibold'>투표자 (최신순)</h3>
          {data.voters.length === 0 ? (
            <div className='text-muted-foreground py-4 text-center text-sm'>아직 응답 없음</div>
          ) : (
            <div className='flex flex-wrap gap-1.5'>
              {data.voters.map((v, i) => (
                <Badge key={i} variant='secondary' className='text-xs'>
                  {v.name}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
