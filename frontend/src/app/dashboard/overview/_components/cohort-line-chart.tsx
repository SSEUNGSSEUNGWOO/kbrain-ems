'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

export type Series = { id: string; name: string; color: string };
export type Point = { date: string } & Record<string, number | null | string>;

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const;

function formatTick(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatTooltipDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  return `${d.getMonth() + 1}.${d.getDate()}.(${DOW[d.getDay()]})`;
}

type Props = {
  data: Point[];
  series: Series[];
  yUnit?: string;
  yDomain?: [number, number] | [number, 'auto'] | ['auto', 'auto'];
  emptyText?: string;
  height?: number;
};

export function CohortLineChart({
  data,
  series,
  yUnit = '',
  yDomain = ['auto', 'auto'],
  emptyText = '데이터 없음',
  height = 288
}: Props) {
  if (data.length === 0 || series.length === 0) {
    return (
      <div
        className='text-muted-foreground flex items-center justify-center text-sm'
        style={{ height }}
      >
        {emptyText}
      </div>
    );
  }
  return (
    <div className='w-full' style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray='3 3' stroke='var(--border)' />
          <XAxis
            dataKey='date'
            tickFormatter={formatTick}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            stroke='var(--border)'
          />
          <YAxis
            domain={yDomain}
            tickFormatter={(v) => `${v}${yUnit}`}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            stroke='var(--border)'
            width={48}
            allowDecimals={false}
          />
          <Tooltip
            labelFormatter={(label: string) => formatTooltipDate(label)}
            formatter={(value: number, name: string) => [`${value}${yUnit}`, name]}
            contentStyle={{
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--popover)',
              color: 'var(--popover-foreground)',
              fontSize: '12px'
            }}
          />
          <Legend wrapperStyle={{ fontSize: '12px' }} iconType='circle' />
          {series.map((s) => (
            <Line
              key={s.id}
              type='monotone'
              dataKey={s.id}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
