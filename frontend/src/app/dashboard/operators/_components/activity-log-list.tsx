import { createAdminClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';

const ACTION_LABEL: Record<string, string> = {
  login: '로그인',
  create: '생성',
  update: '수정',
  delete: '삭제',
  publish: '발행',
  share_issue: '공유 발급',
  share_revoke: '공유 회수',
  auto_select: '자동선발',
  upload: '업로드'
};

const ACTION_TONE: Record<string, string> = {
  login: 'bg-slate-100 text-slate-700 border-slate-300',
  create: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  update: 'bg-blue-50 text-blue-700 border-blue-200',
  delete: 'bg-rose-50 text-rose-700 border-rose-200',
  publish: 'bg-violet-50 text-violet-700 border-violet-200',
  share_issue: 'bg-amber-50 text-amber-700 border-amber-200',
  share_revoke: 'bg-slate-50 text-slate-600 border-slate-200',
  auto_select: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  upload: 'bg-cyan-50 text-cyan-700 border-cyan-200'
};

type LogRow = {
  id: string;
  operator_name: string | null;
  action_type: string;
  resource_type: string | null;
  summary: string | null;
  created_at: string;
  cohort_id: string | null;
  cohorts: { name: string } | null;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

export async function ActivityLogList() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('activity_logs')
    .select('id, operator_name, action_type, resource_type, summary, created_at, cohort_id, cohorts(name)')
    .order('created_at', { ascending: false })
    .limit(100)
    .returns<LogRow[]>();

  const rows = data ?? [];

  return (
    <section>
      <div className='mb-3 flex items-baseline justify-between'>
        <h2 className='text-sm font-medium'>최근 활동 로그</h2>
        <span className='text-muted-foreground text-xs'>최근 100건</span>
      </div>
      {rows.length === 0 ? (
        <div className='text-muted-foreground rounded-lg border border-dashed py-8 text-center text-sm'>
          기록된 활동이 아직 없습니다.
        </div>
      ) : (
        <div className='overflow-x-auto rounded-lg border'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50'>
              <tr>
                <th className='border-b px-4 py-3 text-left font-medium'>시각</th>
                <th className='border-b px-4 py-3 text-left font-medium'>운영자</th>
                <th className='border-b px-4 py-3 text-left font-medium'>작업</th>
                <th className='border-b px-4 py-3 text-left font-medium'>요약</th>
                <th className='border-b px-4 py-3 text-left font-medium'>기수</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className='even:bg-muted/10'>
                  <td className='border-b px-4 py-2 text-muted-foreground tabular-nums text-xs'>
                    {formatTime(r.created_at)}
                  </td>
                  <td className='border-b px-4 py-2'>
                    {r.operator_name ?? <span className='text-muted-foreground'>(미상)</span>}
                  </td>
                  <td className='border-b px-4 py-2'>
                    <Badge
                      variant='outline'
                      className={`font-normal ${ACTION_TONE[r.action_type] ?? ''}`}
                    >
                      {ACTION_LABEL[r.action_type] ?? r.action_type}
                    </Badge>
                  </td>
                  <td className='border-b px-4 py-2'>
                    {r.summary ?? (
                      <span className='text-muted-foreground text-xs'>
                        {r.resource_type ?? '—'}
                      </span>
                    )}
                  </td>
                  <td className='border-b px-4 py-2 text-muted-foreground text-xs'>
                    {r.cohorts?.name ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
