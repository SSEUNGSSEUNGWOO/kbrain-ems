'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

type CategoryData = {
  name: string;
  value: number;
  color: string;
};

const COLORS: Record<string, string> = {
  '중앙부처': '#3b82f6',
  '기초지자체': '#10b981',
  '광역지자체': '#06b6d4',
  '공공기관': '#f59e0b',
  '교육행정기관': '#8b5cf6',
  '미분류': '#94a3b8'
};

export function CategoryPieChart({ data }: { data: CategoryData[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <div className='flex h-48 items-center justify-center text-sm text-muted-foreground'>
        데이터 없음
      </div>
    );
  }

  return (
    <div className='flex items-center gap-6'>
      <div className='h-48 w-48 shrink-0'>
        <ResponsiveContainer width='100%' height='100%'>
          <PieChart>
            <Pie
              data={data.filter((d) => d.value > 0)}
              cx='50%'
              cy='50%'
              innerRadius={45}
              outerRadius={80}
              paddingAngle={2}
              dataKey='value'
              strokeWidth={0}
            >
              {data.filter((d) => d.value > 0).map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => [`${value}명`, name]}
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--popover)',
                color: 'var(--popover-foreground)',
                fontSize: '13px'
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className='grid gap-2'>
        {data.filter((d) => d.value > 0).map((d) => (
          <div key={d.name} className='flex items-center gap-2 text-sm'>
            <span className='h-3 w-3 shrink-0 rounded-full' style={{ backgroundColor: d.color }} />
            <span className='text-muted-foreground'>{d.name}</span>
            <span className='font-medium'>{d.value}명</span>
            <span className='text-muted-foreground text-xs'>({Math.round((d.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
