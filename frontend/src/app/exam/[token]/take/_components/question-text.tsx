import React from 'react';

/**
 * 시험 지문 렌더러 — 마크다운스러운 서식 지원.
 * - `[대괄호 제목]` → 큰 볼드 제목
 * - `■ 헤딩` → 파란 사이드바 헤딩
 * - `1. 항목` · `- 항목` · `• 항목` → 리스트
 * - `` `code` `` → 인라인 코드
 * - `**볼드**` → 볼드
 * - 그 외 텍스트는 문단으로 유지
 */
export function QuestionText({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let listBuffer: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!listBuffer) return;
    const isOrdered = listBuffer.ordered;
    const items = listBuffer.items;
    blocks.push(
      isOrdered ? (
        <ol key={blocks.length} className='space-y-2 my-3 pl-1'>
          {items.map((it, i) => (
            <li key={i} className='flex gap-2.5 leading-relaxed text-[15px] text-slate-800'>
              <span className='flex-shrink-0 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold tabular-nums'>
                {i + 1}
              </span>
              <span className='flex-1'>{renderInline(it)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <ul key={blocks.length} className='space-y-1.5 my-3'>
          {items.map((it, i) => (
            <li key={i} className='flex gap-2.5 leading-relaxed text-[15px] text-slate-800'>
              <span className='flex-shrink-0 mt-2 h-1.5 w-1.5 rounded-full bg-blue-500' />
              <span className='flex-1'>{renderInline(it)}</span>
            </li>
          ))}
        </ul>
      )
    );
    listBuffer = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (line.trim() === '') {
      flushList();
      continue;
    }

    // 대괄호 제목: [텍스트]
    const bracket = line.match(/^\[(.+)\]$/);
    if (bracket) {
      flushList();
      blocks.push(
        <h2
          key={`h-${i}`}
          className='mt-2 mb-4 text-lg font-bold text-slate-900 pb-2 border-b-2 border-blue-500'
        >
          {bracket[1]}
        </h2>
      );
      continue;
    }

    // ■ 시작 헤딩
    if (line.startsWith('■')) {
      flushList();
      blocks.push(
        <h3
          key={`s-${i}`}
          className='mt-5 mb-2.5 flex items-center gap-2 text-[15px] font-bold text-blue-900'
        >
          <span className='inline-block h-4 w-1 rounded bg-blue-600' />
          {line.replace(/^■\s*/, '')}
        </h3>
      );
      continue;
    }

    // 번호 매김 (1. / 2. / 3. …)
    const orderedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      if (!listBuffer || !listBuffer.ordered) {
        flushList();
        listBuffer = { ordered: true, items: [] };
      }
      listBuffer.items.push(orderedMatch[2]);
      continue;
    }

    // 불릿 (- / • / ·)
    const bulletMatch = line.match(/^\s*[-•·]\s+(.+)$/);
    if (bulletMatch) {
      if (!listBuffer || listBuffer.ordered) {
        flushList();
        listBuffer = { ordered: false, items: [] };
      }
      listBuffer.items.push(bulletMatch[1]);
      continue;
    }

    // 일반 문단
    flushList();
    blocks.push(
      <p key={`p-${i}`} className='leading-relaxed text-[15px] text-slate-800 my-2.5'>
        {renderInline(line)}
      </p>
    );
  }
  flushList();

  return <div className='space-y-0.5'>{blocks}</div>;
}

/** 인라인: `code`, **bold** 처리 */
function renderInline(text: string): React.ReactNode {
  // 순차 파싱: `code` 우선, 그 후 **bold**
  const parts: React.ReactNode[] = [];
  let remainder = text;
  let key = 0;

  while (remainder.length > 0) {
    // `code`
    const codeMatch = remainder.match(/`([^`]+)`/);
    // **bold**
    const boldMatch = remainder.match(/\*\*([^*]+)\*\*/);

    const codeIdx = codeMatch?.index ?? Infinity;
    const boldIdx = boldMatch?.index ?? Infinity;

    if (codeIdx === Infinity && boldIdx === Infinity) {
      parts.push(remainder);
      break;
    }

    if (codeIdx < boldIdx) {
      const idx = codeMatch!.index!;
      if (idx > 0) parts.push(remainder.slice(0, idx));
      parts.push(
        <code
          key={key++}
          className='rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 font-mono text-[13px] text-rose-700'
        >
          {codeMatch![1]}
        </code>
      );
      remainder = remainder.slice(idx + codeMatch![0].length);
    } else {
      const idx = boldMatch!.index!;
      if (idx > 0) parts.push(remainder.slice(0, idx));
      parts.push(
        <strong key={key++} className='font-bold text-slate-900'>
          {boldMatch![1]}
        </strong>
      );
      remainder = remainder.slice(idx + boldMatch![0].length);
    }
  }

  return <>{parts}</>;
}
