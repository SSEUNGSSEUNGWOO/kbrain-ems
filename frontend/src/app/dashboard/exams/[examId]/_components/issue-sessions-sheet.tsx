'use client';

import { useState, useTransition } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter
} from '@/components/ui/sheet';
import { issueExamSessions, type IssueResult } from '../../_issue-actions';

type Props = { examId: string };

function parseInput(raw: string): { name: string; email: string | null }[] {
  const rows: { name: string; email: string | null }[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    // 지원: "이름,이메일" | "이름\t이메일" | "이름 이메일" | "이름" 만
    const parts = t.split(/[,\t]/).map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2) {
      rows.push({ name: parts[0], email: parts[1] });
    } else if (parts.length === 1) {
      // 공백 구분 시도
      const sp = parts[0].split(/\s+/);
      if (sp.length >= 2 && /@/.test(sp[sp.length - 1])) {
        rows.push({ name: sp.slice(0, -1).join(' '), email: sp[sp.length - 1] });
      } else {
        rows.push({ name: parts[0], email: null });
      }
    }
  }
  return rows;
}

export function IssueSessionsSheet({ examId }: Props) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const [pending, startTransition] = useTransition();
  const [results, setResults] = useState<IssueResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const parsed = parseInput(raw);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const onIssue = () => {
    setError(null);
    setMsg(null);
    if (parsed.length === 0) {
      setError('명단이 비어있습니다.');
      return;
    }
    startTransition(async () => {
      const res = await issueExamSessions(examId, parsed);
      if (res.error) {
        setError(res.error);
        return;
      }
      setResults(res.results ?? []);
      setMsg(`발급 완료 — 신규 ${res.created}건, 기존 재사용 ${res.existing}건`);
    });
  };

  const copyAll = (fmt: 'name-url' | 'url-only') => {
    if (!results) return;
    const text = results
      .map((r) => (fmt === 'name-url' ? `${r.name}\t${origin}${r.url}` : `${origin}${r.url}`))
      .join('\n');
    void navigator.clipboard.writeText(text);
    setMsg('클립보드에 복사했습니다');
  };

  const downloadXlsx = () => {
    if (!results) return;
    // CSV로 간단 다운로드 (엑셀에서 열림)
    const rows = [['이름', '이메일', '상태', 'URL'], ...results.map((r) => [
      r.name,
      r.email ?? '',
      r.status === 'created' ? '신규' : '기존',
      `${origin}${r.url}`
    ])];
    const csv = '﻿' + rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `응시자_URL_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type='button'
          className='inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 text-sm font-medium shadow-sm'
        >
          + 응시자 발급
        </button>
      </SheetTrigger>
      <SheetContent className='sm:max-w-2xl w-full'>
        <SheetHeader>
          <SheetTitle>응시자 세션 발급</SheetTitle>
        </SheetHeader>

        <div className='px-4 py-4 space-y-4'>
          <div>
            <label className='text-sm font-medium block mb-2'>명단 붙여넣기</label>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={10}
              placeholder={`한 줄에 한 명씩. 형식: 이름,이메일 (탭 또는 쉼표 구분)\n예시:\n홍길동, hong@example.com\n김철수, kim@example.com`}
              className='w-full font-mono text-sm rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500'
            />
            <div className='mt-1.5 flex items-center justify-between text-xs text-muted-foreground'>
              <span>파싱된 인원: {parsed.length}명</span>
              {parsed.length > 0 && (
                <span>이메일 없는 경우: {parsed.filter((p) => !p.email).length}명</span>
              )}
            </div>
          </div>

          {error && <div className='text-sm text-rose-600'>{error}</div>}
          {msg && <div className='text-sm text-emerald-700'>{msg}</div>}

          {!results && (
            <button
              type='button'
              onClick={onIssue}
              disabled={pending || parsed.length === 0}
              className='w-full rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium py-2.5'
            >
              {pending ? '발급 중...' : `${parsed.length}명 발급`}
            </button>
          )}

          {results && (
            <div className='space-y-3'>
              <div className='flex flex-wrap gap-2'>
                <button
                  type='button'
                  onClick={() => copyAll('name-url')}
                  className='rounded-md border px-3 py-1.5 text-xs hover:bg-slate-50'
                >
                  이름·URL 복사 (탭 구분)
                </button>
                <button
                  type='button'
                  onClick={() => copyAll('url-only')}
                  className='rounded-md border px-3 py-1.5 text-xs hover:bg-slate-50'
                >
                  URL만 복사
                </button>
                <button
                  type='button'
                  onClick={downloadXlsx}
                  className='rounded-md border px-3 py-1.5 text-xs hover:bg-slate-50'
                >
                  CSV 다운로드
                </button>
              </div>

              <div className='rounded-md border max-h-[400px] overflow-y-auto'>
                <table className='w-full text-xs'>
                  <thead className='bg-slate-50 sticky top-0'>
                    <tr>
                      <th className='px-2 py-1.5 text-left'>이름</th>
                      <th className='px-2 py-1.5 text-left'>이메일</th>
                      <th className='px-2 py-1.5 text-left'>URL</th>
                      <th className='px-2 py-1.5 w-16'></th>
                    </tr>
                  </thead>
                  <tbody className='divide-y'>
                    {results.map((r) => (
                      <tr key={r.token}>
                        <td className='px-2 py-1.5 font-medium'>{r.name}</td>
                        <td className='px-2 py-1.5 text-muted-foreground'>{r.email ?? '-'}</td>
                        <td className='px-2 py-1.5 font-mono text-[10px] text-blue-600 truncate max-w-[240px]'>
                          {origin}{r.url}
                        </td>
                        <td className='px-2 py-1.5'>
                          <button
                            type='button'
                            onClick={() => {
                              void navigator.clipboard.writeText(`${origin}${r.url}`);
                              setMsg(`${r.name} URL 복사됨`);
                            }}
                            className='text-[10px] rounded border px-1.5 py-0.5 hover:bg-slate-50'
                          >
                            복사
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <SheetFooter>
          <button
            type='button'
            onClick={() => {
              setResults(null);
              setRaw('');
              setError(null);
              setMsg(null);
            }}
            className='text-sm text-muted-foreground hover:underline'
          >
            초기화
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
