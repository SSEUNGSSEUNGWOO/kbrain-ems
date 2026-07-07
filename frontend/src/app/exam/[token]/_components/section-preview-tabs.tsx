'use client';

import { useState } from 'react';

type Section = 'mc' | 'st' | 'task';

const TABS: { key: Section; label: string; badge: string }[] = [
  { key: 'mc', label: '객관식', badge: '1' },
  { key: 'st', label: '단답형', badge: '2' },
  { key: 'task', label: '작업형', badge: '3' }
];

export function SectionPreviewTabs({
  mcMinutes,
  stMinutes,
  taskMinutes
}: {
  mcMinutes: number | null;
  stMinutes: number | null;
  taskMinutes: number | null;
}) {
  const [active, setActive] = useState<Section>('mc');
  const minutes: Record<Section, number | null> = { mc: mcMinutes, st: stMinutes, task: taskMinutes };

  return (
    <div className='rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden'>
      {/* 탭 헤더 */}
      <div className='flex border-b border-slate-200 bg-slate-50/50'>
        {TABS.map((t) => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              type='button'
              onClick={() => setActive(t.key)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white text-blue-700 border-b-2 border-blue-600 -mb-px'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
              }`}
            >
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  isActive ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {t.badge}
              </span>
              {t.label}
              {minutes[t.key] !== null && (
                <span className='text-[11px] font-normal text-slate-400'>· {minutes[t.key]}분</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 콘텐츠 */}
      <div className='p-6 bg-gradient-to-br from-slate-50 via-white to-blue-50/20'>
        {active === 'mc' && <PreviewMC />}
        {active === 'st' && <PreviewST />}
        {active === 'task' && <PreviewTask />}
      </div>
    </div>
  );
}

function MockHeader({ title, current, total }: { title: string; current: number; total: number }) {
  return (
    <div className='flex items-center justify-between mb-3 pb-2 border-b border-slate-200'>
      <div className='text-[11px] font-medium text-slate-500'>{title}</div>
      <div className='text-[11px] font-mono text-slate-400'>
        Q{current} / {total}
      </div>
    </div>
  );
}

function PreviewMC() {
  const [pick, setPick] = useState<string>('②');
  const choices: { key: string; text: string }[] = [
    { key: '①', text: '프로그래밍 문법을 완벽히 암기하는 것' },
    { key: '②', text: '무엇을 만들지 자연어로 설명하고 결과를 검수·반복 보정하는 것' },
    { key: '③', text: 'AI가 사람 대신 문제까지 알아서 정의하는 것' },
    { key: '④', text: '코드 없이 마우스로만 실행하는 것' }
  ];
  return (
    <div className='max-w-xl mx-auto rounded-xl border border-slate-200 bg-white p-5 shadow-sm'>
      <MockHeader title='객관식' current={1} total={30} />
      <div className='text-sm text-slate-800 leading-relaxed mb-4'>
        <b>Vibe Coding</b>의 개념으로 가장 알맞은 것은?
      </div>
      <div className='space-y-2'>
        {choices.map((c) => {
          const selected = pick === c.key;
          return (
            <button
              key={c.key}
              type='button'
              onClick={() => setPick(c.key)}
              className={`w-full text-left flex items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${
                selected
                  ? 'border-blue-500 bg-blue-50 text-blue-900'
                  : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
              }`}
            >
              <span
                className={`inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                  selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 text-slate-500'
                }`}
              >
                {c.key}
              </span>
              <span className='leading-relaxed'>{c.text}</span>
            </button>
          );
        })}
      </div>
      <div className='mt-4 flex items-center justify-between'>
        <button className='px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700'>← 이전</button>
        <button className='inline-flex items-center gap-1 rounded-md bg-amber-100 border border-amber-300 px-2.5 py-1 text-[11px] font-medium text-amber-700'>
          🚩 검토 표시
        </button>
        <button className='px-3 py-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium'>다음 →</button>
      </div>
    </div>
  );
}

function PreviewST() {
  const [text, setText] = useState('RAG');
  return (
    <div className='max-w-xl mx-auto rounded-xl border border-slate-200 bg-white p-5 shadow-sm'>
      <MockHeader title='단답형' current={31} total={5} />
      <div className='text-sm text-slate-800 leading-relaxed mb-4'>
        문서 검색형 AI를 설계할 때, 검색된 근거 문서를 LLM 입력에 결합해 답변의 정확성과 근거성을 높이는 대표 기법을 <b>3글자 영문</b>으로 답하시오.
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='답변을 입력하세요'
        className='w-full min-h-[100px] rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none'
      />
      <div className='mt-3 flex items-center justify-between text-xs'>
        <span className='text-slate-400'>답안은 자동 저장됩니다</span>
        <button className='text-blue-600 hover:text-blue-700 font-medium'>다음 →</button>
      </div>
    </div>
  );
}

function PreviewTask() {
  return (
    <div className='max-w-xl mx-auto rounded-xl border border-slate-200 bg-white p-5 shadow-sm'>
      <MockHeader title='작업형' current={36} total={1} />
      <div className='text-sm text-slate-800 leading-relaxed mb-4'>
        <b>[과제]</b> 지정된 요구사항에 맞춰 결과물을 개발하고 npm/GitHub에 배포한 후 아래 항목을 제출하시오.
      </div>
      <div className='space-y-3'>
        <div>
          <label className='block text-[11px] font-semibold text-slate-500 mb-1'>🔗 배포 URL</label>
          <input
            type='url'
            placeholder='https://github.com/... 또는 https://npmjs.com/package/...'
            className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none'
          />
        </div>
        <div>
          <label className='block text-[11px] font-semibold text-slate-500 mb-1'>📎 파일 첨부</label>
          <div className='rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-center text-xs text-slate-500'>
            결과물 파일을 여기에 끌어놓거나 클릭해서 업로드
          </div>
        </div>
        <div>
          <label className='block text-[11px] font-semibold text-slate-500 mb-1'>📝 메모 (실행 방법·사용 도구)</label>
          <textarea
            placeholder='실행 명령어 · 구현 도구 · 특이사항 (3~5줄)'
            className='w-full min-h-[80px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none'
          />
        </div>
      </div>
      <div className='mt-4 text-right'>
        <button className='rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2'>
          최종 제출
        </button>
      </div>
    </div>
  );
}
