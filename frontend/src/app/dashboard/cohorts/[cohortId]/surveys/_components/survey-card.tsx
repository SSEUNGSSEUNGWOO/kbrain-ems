'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteSurvey } from '../_actions';
import { SurveyEditSheet } from './survey-edit-sheet';

type Props = {
  id: string;
  cohortId: string;
  title: string;
  shareCode: string | null;
  issuedCount: number;
  submittedCount: number;
  totalStudents: number;
  avgScore: number | null;
  scaleQuestionCount: number;
};

export function SurveyCard({
  id,
  cohortId,
  title,
  shareCode,
  issuedCount,
  submittedCount,
  totalStudents,
  avgScore,
  scaleQuestionCount
}: Props) {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const handleDelete = () => {
    const msg =
      submittedCount > 0
        ? `이 설문에는 응답 ${submittedCount}건이 있습니다. 삭제하면 응답도 모두 함께 사라집니다. 정말 삭제하시겠습니까?`
        : `이 설문과 발급된 토큰 ${issuedCount}개를 모두 삭제하시겠습니까?`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      const result = await deleteSurvey(cohortId, id);
      if (result.error) {
        alert(result.error);
        return;
      }
      router.refresh();
    });
  };

  const shareUrl = shareCode ? `${origin}/survey/share/${shareCode}` : '';
  const responseRate = totalStudents > 0 ? Math.round((submittedCount / totalStudents) * 100) : 0;

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className='rounded-xl border bg-card shadow-sm'>
      <div className='flex items-center justify-between gap-3 border-b px-6 py-4'>
        <h3 className='text-base font-bold'>{title}</h3>
        <div className='flex shrink-0 items-center gap-1'>
          <Link
            href={`/dashboard/cohorts/${cohortId}/surveys/${id}/preview`}
            className='rounded-md border bg-background px-3 py-1.5 text-xs font-semibold transition hover:bg-muted'
          >
            미리보기
          </Link>
          <SurveyEditSheet
            cohortId={cohortId}
            surveyId={id}
            initialTitle={title}
            initialShareCode={shareCode}
            trigger={
              <button
                type='button'
                className='rounded-md border bg-background px-3 py-1.5 text-xs font-semibold transition hover:bg-muted'
              >
                수정
              </button>
            }
          />
          <button
            type='button'
            onClick={handleDelete}
            disabled={pending}
            className='rounded-md border border-red-200 bg-background px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/40 dark:hover:bg-red-900/20'
          >
            {pending ? '삭제 중...' : '삭제'}
          </button>
        </div>
      </div>

      <div className='space-y-5 px-6 py-5'>
        {/* 공유 링크 */}
        {shareCode ? (
          <div>
            <label className='text-xs font-semibold text-muted-foreground'>
              공유 링크 (카톡방·메일에 그대로 붙여넣기)
            </label>
            <div className='mt-1 flex items-stretch gap-2'>
              <input
                type='text'
                value={shareUrl || `…/survey/share/${shareCode}`}
                readOnly
                className='min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm'
              />
              <button
                onClick={handleCopy}
                disabled={!shareUrl}
                className='shrink-0 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50'
              >
                {copied ? '✓ 복사됨' : '복사'}
              </button>
            </div>
          </div>
        ) : (
          <div className='rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'>
            공유 코드(share_code)가 발급되지 않은 설문입니다.
          </div>
        )}

        {/* 통계 카드 3개 */}
        <div className='grid grid-cols-3 gap-3'>
          <div className='rounded-lg border bg-muted/30 px-4 py-3'>
            <div className='text-xs text-muted-foreground'>응답률</div>
            <div className='mt-1 text-2xl font-bold tabular-nums'>{responseRate}%</div>
            <div className='text-xs text-muted-foreground'>
              {submittedCount} / {totalStudents}명 제출
            </div>
          </div>
          <div className='rounded-lg border bg-muted/30 px-4 py-3'>
            <div className='text-xs text-muted-foreground'>토큰 발급</div>
            <div className='mt-1 text-2xl font-bold tabular-nums'>{issuedCount}</div>
            <div className='text-xs text-muted-foreground'>{totalStudents - issuedCount > 0 ? `${totalStudents - issuedCount}명 미발급` : '전원 발급'}</div>
          </div>
          <div className='rounded-lg border bg-muted/30 px-4 py-3'>
            <div className='text-xs text-muted-foreground'>평균 만족도</div>
            <div className='mt-1 text-2xl font-bold tabular-nums'>
              {avgScore !== null ? avgScore.toFixed(1) : '-'}
              {avgScore !== null && (
                <span className='text-sm font-normal text-muted-foreground'> /5</span>
              )}
            </div>
            <div className='text-xs text-muted-foreground'>척도 {scaleQuestionCount}문항 평균</div>
          </div>
        </div>
      </div>
    </div>
  );
}
