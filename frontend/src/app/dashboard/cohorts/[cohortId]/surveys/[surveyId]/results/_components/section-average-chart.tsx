'use client';

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type DataPoint = {
  name: string;
  평균: number;
  응답수: number;
};

export function SectionAverageChart({ data }: { data: DataPoint[] }) {
  return (
    <div className='h-80 w-full'>
      <ResponsiveContainer width='100%' height='100%'>
        <BarChart data={data} margin={{ top: 24, right: 16, bottom: 40, left: 0 }}>
          <CartesianGrid strokeDasharray='3 3' stroke='#e5e7eb' />
          <XAxis
            dataKey='name'
            tick={{ fontSize: 11 }}
            angle={-20}
            textAnchor='end'
            height={80}
            interval={0}
          />
          <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} ticks={[0, 2, 4, 6, 8, 10]} />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid #e5e7eb'
            }}
            formatter={(value: number, name) =>
              name === '평균' ? [value.toFixed(2), '평균 (10점)'] : [value, '응답 수']
            }
          />
          <Bar dataKey='평균' fill='#3b82f6' radius={[6, 6, 0, 0]}>
            <LabelList
              dataKey='평균'
              position='top'
              formatter={(v: number) => v.toFixed(2)}
              style={{ fontSize: 11, fontWeight: 700, fill: '#1e40af' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
