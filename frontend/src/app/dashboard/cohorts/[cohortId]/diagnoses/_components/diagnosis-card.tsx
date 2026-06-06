'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { ensureShareCode } from '../_actions';

type Diagnosis = {
  id: string;
  title: string;
  type: string;
  opens_at: string | null;
  closes_at: string | null;
  share_code: string | null;
};

type Response = {
  id: string;
  student_id: string | null;
  token: string;
  submitted_at: string | null;
  total_score: number | null;
  students: { name: string } | null;
};

type Props = {
  cohortId: string;
  diagnosis: Diagnosis;
  responses: Response[];
  studentCount: number;
};

export function DiagnosisCard({ cohortId, diagnosis, responses, studentCount }: Props) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [showStatus, setShowStatus] = useState(false);
  const [origin, setOrigin] = useState('');

  if (typeof window !== 'undefined' && !origin) {
    setOrigin(window.location.origin);
  }

  const submitted = responses.filter((r) => r.submitted_at);
  const submittedCount = submitted.length;
  const avgScore =
    submitted.length > 0
      ? submitted.reduce((s, r) => s + Number(r.total_score ?? 0), 0) / submitted.length
      : null;

  const typeLabel = diagnosis.type === 'pre' ? '사전' : diagnosis.type === 'post' ? '사후' : diagnosis.type;
  const typeColor =
    diagnosis.type === 'pre' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700';

  const shareUrl = diagnosis.share_code
    ? `${origin}/diagnosis/share/${diagnosis.share_code}`
    : null;

  const handleShareCode = () => {
    setMessage(null);
    startTransition(async () => {
      // 이미 있으면 그대로 복사. 없으면 생성 후 복사.
      const r = diagnosis.share_code
        ? { code: diagnosis.share_code }
        : await ensureShareCode(diagnosis.id, cohortId);
      if ('error' in r) {
        setMessage(`오류: ${r.error}`);
        return;
      }
      const url = `${origin}/diagnosis/share/${r.code}`;
      try {
        await navigator.clipboard.writeText(url);
        setMessage(`공유 링크 복사됨: ${url}`);
      } catch {
        setMessage(`공유 링크: ${url}`);
      }
    });
  };

  return (
    <div className='rounded-2xl border bg-white p-6 shadow-sm'>
      <div className='flex items-start justify-between gap-4'>
        <div className='flex-1'>
          <div className='mb-1 flex items-center gap-2'>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeColor}`}>
              {typeLabel}
            </span>
            <h2 className='text-lg font-bold text-slate-900'>{diagnosis.title}</h2>
          </div>
          <p className='mt-1 text-xs text-slate-500'>
            응답 {submittedCount} / {studentCount}명
            {avgScore != null && ` · 평균 ${avgScore.toFixed(1)}점`}
          </p>
          {shareUrl && (
            <div className='mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs'>
              <span className='font-semibold text-blue-900'>공유 링크: </span>
              <span className='font-mono text-blue-700 break-all'>{shareUrl}</span>
            </div>
          )}
        </div>
        <div className='flex flex-col gap-2'>
          <Button onClick={handleShareCode} disabled={pending}>
            {pending ? '...' : diagnosis.share_code ? '공유 링크 복사' : '공유 링크 생성'}
          </Button>
          {submittedCount > 0 && (
            <Button variant='outline' onClick={() => setShowStatus((v) => !v)}>
              {showStatus ? '현황 숨기기' : '응답 현황'}
            </Button>
          )}
        </div>
      </div>

      {message && (
        <div className='mt-4 rounded-lg bg-slate-50 px-4 py-2 text-sm text-slate-700 break-all'>
          {message}
        </div>
      )}

      {showStatus && responses.length > 0 && (
        <div className='mt-4 overflow-hidden rounded-xl border'>
          <table className='w-full text-sm'>
            <thead className='bg-slate-50'>
              <tr>
                <th className='px-3 py-2 text-left font-semibold text-slate-600'>이름</th>
                <th className='px-3 py-2 text-left font-semibold text-slate-600'>상태</th>
                <th className='px-3 py-2 text-left font-semibold text-slate-600'>점수</th>
                <th className='px-3 py-2 text-left font-semibold text-slate-600'>제출 시각</th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {responses
                .slice()
                .sort((a, b) =>
                  (a.students?.name ?? '').localeCompare(b.students?.name ?? '', 'ko')
                )
                .map((r) => (
                  <tr key={r.id}>
                    <td className='px-3 py-2 font-medium text-slate-900'>
                      {r.students?.name ?? '(미지정)'}
                    </td>
                    <td className='px-3 py-2'>
                      {r.submitted_at ? (
                        <span className='rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700'>
                          완료
                        </span>
                      ) : (
                        <span className='rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600'>
                          대기
                        </span>
                      )}
                    </td>
                    <td className='px-3 py-2 text-slate-700'>
                      {r.total_score != null ? Number(r.total_score) : '-'}
                    </td>
                    <td className='px-3 py-2 text-xs text-slate-500'>
                      {r.submitted_at ? new Date(r.submitted_at).toLocaleString('ko-KR') : '-'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
