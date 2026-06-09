'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis
} from 'recharts';

type HistogramRow = { range: string; pre: number; post: number };
type PairedPoint = { name: string; pre: number; post: number; delta: number };

type Props = {
  histogram: HistogramRow[];
  paired: PairedPoint[];
};

export function PrePostCharts({ histogram, paired }: Props) {
  // 산점도 색: 향상=emerald, 동일=slate, 하락=rose
  const improved = paired.filter((p) => p.delta > 0);
  const same = paired.filter((p) => p.delta === 0);
  const declined = paired.filter((p) => p.delta < 0);

  return (
    <div className='mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2'>
      {/* 1) 점수 분포 히스토그램 (pre vs post 겹침) */}
      <div className='rounded-xl border bg-white p-4'>
        <div className='mb-2'>
          <div className='text-sm font-semibold text-slate-900'>점수 분포</div>
          <div className='text-[11px] text-slate-500'>
            10점 구간별 응답자 수. 사후가 오른쪽으로 이동하면 학습 효과.
          </div>
        </div>
        <ResponsiveContainer width='100%' height={240}>
          <BarChart data={histogram} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray='3 3' stroke='#e5e7eb' vertical={false} />
            <XAxis dataKey='range' tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              cursor={{ fill: '#f1f5f9' }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey='pre' name='사전' fill='#3b82f6' radius={[4, 4, 0, 0]} />
            <Bar dataKey='post' name='사후' fill='#10b981' radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 2) paired 산점도 */}
      <div className='rounded-xl border bg-white p-4'>
        <div className='mb-2'>
          <div className='text-sm font-semibold text-slate-900'>개인별 변화 (paired)</div>
          <div className='text-[11px] text-slate-500'>
            대각선 위 = 향상 · 아래 = 하락 · 위쪽으로 멀수록 큰 향상폭.
          </div>
        </div>
        <ResponsiveContainer width='100%' height={240}>
          <ScatterChart margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
            <CartesianGrid strokeDasharray='3 3' stroke='#e5e7eb' />
            <XAxis
              type='number'
              dataKey='pre'
              name='사전'
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={{ fontSize: 11, fill: '#64748b' }}
              label={{ value: '사전', position: 'insideBottom', offset: -2, fontSize: 11, fill: '#64748b' }}
            />
            <YAxis
              type='number'
              dataKey='post'
              name='사후'
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={{ fontSize: 11, fill: '#64748b' }}
              label={{ value: '사후', angle: -90, position: 'insideLeft', offset: 16, fontSize: 11, fill: '#64748b' }}
            />
            <ZAxis range={[60, 60]} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const p = payload[0].payload as PairedPoint;
                return (
                  <div className='rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow'>
                    <div className='font-semibold text-slate-900'>{p.name}</div>
                    <div className='text-slate-600'>
                      사전 {p.pre} → 사후 {p.post}{' '}
                      <span
                        className={
                          p.delta > 0
                            ? 'font-semibold text-emerald-700'
                            : p.delta < 0
                              ? 'font-semibold text-rose-700'
                              : 'text-slate-500'
                        }
                      >
                        ({p.delta > 0 ? '+' : ''}
                        {p.delta})
                      </span>
                    </div>
                  </div>
                );
              }}
            />
            <ReferenceLine
              segment={[
                { x: 0, y: 0 },
                { x: 100, y: 100 }
              ]}
              stroke='#94a3b8'
              strokeDasharray='4 4'
            />
            <Scatter name='향상' data={improved} fill='#10b981'>
              {improved.map((_, i) => (
                <Cell key={`i-${i}`} fill='#10b981' fillOpacity={0.7} />
              ))}
            </Scatter>
            <Scatter name='동일' data={same} fill='#94a3b8'>
              {same.map((_, i) => (
                <Cell key={`s-${i}`} fill='#94a3b8' fillOpacity={0.7} />
              ))}
            </Scatter>
            <Scatter name='하락' data={declined} fill='#ef4444'>
              {declined.map((_, i) => (
                <Cell key={`d-${i}`} fill='#ef4444' fillOpacity={0.7} />
              ))}
            </Scatter>
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
