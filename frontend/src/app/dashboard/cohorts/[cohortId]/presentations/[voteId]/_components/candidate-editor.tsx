'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { replaceCandidates } from '../../_actions';

type Candidate = {
  order_no: number;
  presenter: string;
  topic: string | null;
  cover_image_url: string | null;
};

type Props = {
  cohortId: string;
  voteId: string;
  initial: Candidate[];
};

const LINE_RE = /^\s*([^_-]+)[_-](.+?)\s*$/;

function parsePaste(text: string, coverPathPrefix: string): Candidate[] {
  const out: Candidate[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = LINE_RE.exec(line);
    if (!m) continue;
    const presenter = m[1].trim();
    const topic = m[2].trim();
    if (!presenter) continue;
    const order = out.length + 1;
    out.push({
      order_no: order,
      presenter,
      topic: topic || null,
      cover_image_url: `${coverPathPrefix}${order}.png`
    });
  }
  return out;
}

export function CandidateEditor({ cohortId, voteId, initial }: Props) {
  const [rows, setRows] = useState<Candidate[]>(initial);
  const [pasteText, setPasteText] = useState('');
  const [coverPrefix, setCoverPrefix] = useState('/presentation-covers/');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const applyPaste = () => {
    const parsed = parsePaste(pasteText, coverPrefix);
    if (parsed.length === 0) {
      setError('파싱 실패: "1_주제_이름" 형식으로 한 줄에 한 명씩 입력하세요.');
      return;
    }
    setRows(parsed);
    setPasteText('');
    setError(null);
  };

  const updateRow = (idx: number, patch: Partial<Candidate>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const addBlank = () => {
    const nextNo = rows.length ? Math.max(...rows.map((r) => r.order_no)) + 1 : 1;
    setRows((prev) => [
      ...prev,
      { order_no: nextNo, presenter: '', topic: null, cover_image_url: null }
    ]);
  };

  const save = () => {
    setError(null);
    const cleaned = rows
      .map((r) => ({ ...r, presenter: r.presenter.trim() }))
      .filter((r) => r.presenter);
    if (cleaned.length !== rows.length) {
      setError('발표자명이 비어있는 행이 있습니다.');
      return;
    }
    const orderSet = new Set<number>();
    for (const r of cleaned) {
      if (orderSet.has(r.order_no)) {
        setError(`순번 ${r.order_no}이 중복됩니다.`);
        return;
      }
      orderSet.add(r.order_no);
    }
    startTransition(async () => {
      const res = await replaceCandidates(cohortId, voteId, cleaned);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <Card>
      <CardContent className='flex flex-col gap-4 px-6 py-5'>
        <div className='flex items-center justify-between'>
          <h3 className='text-base font-semibold'>후보 관리</h3>
          <div className='flex gap-2'>
            <Button variant='outline' size='sm' onClick={addBlank}>
              + 빈 행 추가
            </Button>
            <Button size='sm' onClick={save} disabled={pending}>
              {pending ? '저장 중...' : '전체 저장'}
            </Button>
          </div>
        </div>

        <div className='bg-muted/40 grid gap-2 rounded-md border p-3'>
          <Label className='text-xs'>
            명단 붙여넣기 (형식: 이름_주제, 순번은 줄 순서대로 자동)
          </Label>
          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            placeholder={
              '홍길동_AI 콘텐츠 제작 및 자동화 경험 공유\n김철수_지속가능한 AX의 이해와 실천\n...'
            }
            className='font-mono text-xs'
          />
          <div className='flex items-center gap-2'>
            <Label className='text-muted-foreground text-xs whitespace-nowrap'>
              표지 경로 prefix
            </Label>
            <Input
              value={coverPrefix}
              onChange={(e) => setCoverPrefix(e.target.value)}
              className='h-8 text-xs'
            />
            <Button variant='outline' size='sm' onClick={applyPaste} disabled={!pasteText.trim()}>
              파싱 → 아래로 채우기
            </Button>
          </div>
          <p className='text-muted-foreground text-xs'>
            파싱하면 표지 URL이 <code>{`${coverPrefix}{순번}.png`}</code>로 자동 매핑됩니다. 기존
            후보는 대체됩니다.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className='text-muted-foreground py-8 text-center text-sm'>
            등록된 후보가 없습니다. 위에서 명단을 붙여넣거나 빈 행을 추가하세요.
          </div>
        ) : (
          <div className='flex flex-col gap-2'>
            {rows.map((r, idx) => (
              <div key={idx} className='grid grid-cols-[60px_1fr_1fr_1fr_auto] items-center gap-2'>
                <Input
                  type='number'
                  value={r.order_no}
                  onChange={(e) => updateRow(idx, { order_no: Number(e.target.value) })}
                  className='h-9'
                />
                <Input
                  value={r.presenter}
                  onChange={(e) => updateRow(idx, { presenter: e.target.value })}
                  placeholder='발표자'
                  className='h-9'
                />
                <Input
                  value={r.topic ?? ''}
                  onChange={(e) => updateRow(idx, { topic: e.target.value || null })}
                  placeholder='주제'
                  className='h-9'
                />
                <Input
                  value={r.cover_image_url ?? ''}
                  onChange={(e) => updateRow(idx, { cover_image_url: e.target.value || null })}
                  placeholder='/presentation-covers/1.png'
                  className='h-9 text-xs'
                />
                <Button
                  variant='ghost'
                  size='sm'
                  className='text-destructive'
                  onClick={() => removeRow(idx)}
                >
                  삭제
                </Button>
              </div>
            ))}
          </div>
        )}

        {error && <div className='text-destructive text-sm'>{error}</div>}
      </CardContent>
    </Card>
  );
}
