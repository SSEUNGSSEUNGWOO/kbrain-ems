import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyButton } from '@/components/copy-button';
import type { ReportBlock, ReportSection } from '@/lib/reports/generate-session';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tableToHtml(headers: string[], rows: string[][], caption?: string | null): string {
  const cap = caption ? `<caption>${escapeHtml(caption)}</caption>` : '';
  const thead = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody>`;
  return `<table border="1" cellspacing="0" cellpadding="4">${cap}${thead}${tbody}</table>`;
}

function tableToTsv(headers: string[], rows: string[][]): string {
  return [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
}

function blockToPlainText(block: ReportBlock): string {
  if (block.kind === 'text') return block.body;
  // table → TSV (caption은 한 줄로 위에)
  const cap = block.caption ? `${block.caption}\n` : '';
  return cap + tableToTsv(block.headers, block.rows);
}

function blockToHtml(block: ReportBlock): string {
  if (block.kind === 'text') {
    // 단순 줄바꿈만 처리. 행정문서 본문은 ○/- 식 prefix 그대로 보존.
    return `<p>${escapeHtml(block.body).replace(/\n/g, '<br/>')}</p>`;
  }
  return tableToHtml(block.headers, block.rows, block.caption);
}

function sectionAggregate(section: ReportSection): { text: string; html: string } {
  const parts = section.blocks.map(blockToPlainText);
  const htmlParts = section.blocks.map(blockToHtml);
  return {
    text: parts.join('\n\n'),
    html: htmlParts.join('')
  };
}

export function SectionCard({ section }: { section: ReportSection }) {
  const agg = sectionAggregate(section);

  return (
    <Card className='print:rounded-none print:border-0 print:shadow-none print:break-inside-avoid-page'>
      <CardHeader className='flex flex-row items-center justify-between gap-2 space-y-0 py-4 print:py-2'>
        <CardTitle className='text-base font-semibold'>{section.title}</CardTitle>
        <div className='print:hidden'>
          <CopyButton text={agg.text} html={agg.html} label='섹션 전체 복사' />
        </div>
      </CardHeader>
      <CardContent className='flex flex-col gap-4 print:gap-2 print:px-0'>
        {section.blocks.map((block, idx) => (
          <Block key={idx} block={block} />
        ))}
      </CardContent>
    </Card>
  );
}

function Block({ block }: { block: ReportBlock }) {
  if (block.kind === 'text') {
    return (
      <pre className='text-foreground bg-muted/30 whitespace-pre-wrap rounded-md p-3 font-sans text-sm leading-relaxed print:bg-transparent print:p-0'>
        {block.body}
      </pre>
    );
  }

  const html = tableToHtml(block.headers, block.rows, block.caption);
  const tsv = tableToTsv(block.headers, block.rows);

  return (
    <div className='flex flex-col gap-2 print:gap-1'>
      {block.caption && (
        <p className='text-muted-foreground text-xs font-medium'>{block.caption}</p>
      )}
      <div className='overflow-x-auto rounded-md border print:rounded-none print:border-slate-400'>
        <table className='w-full text-sm'>
          <thead className='bg-muted/50 print:bg-slate-100'>
            <tr>
              {block.headers.map((h, i) => (
                <th
                  key={i}
                  className='border-b px-3 py-2 text-left font-medium print:border-slate-400 print:py-1'
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri} className='even:bg-muted/20 print:even:bg-transparent'>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className='border-b px-3 py-2 tabular-nums print:border-slate-300 print:py-1'
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='flex justify-end print:hidden'>
        <CopyButton text={tsv} html={html} label='이 표만 복사' variant='ghost' size='sm' />
      </div>
    </div>
  );
}
