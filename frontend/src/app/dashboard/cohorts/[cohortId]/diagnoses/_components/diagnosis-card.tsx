'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { QrDialog } from '@/components/qr-dialog';
import {
  ensureShareCode,
  linkDiagnosisToAttendanceCheck,
  updateDiagnosisDuration
} from '../_actions';

type Diagnosis = {
  id: string;
  title: string;
  type: string;
  opens_at: string | null;
  closes_at: string | null;
  share_code: string | null;
  attendance_check_id: string | null;
  duration_minutes: number;
};

type AttnCheckOpt = {
  id: string;
  label: string;
  attendance_role: string | null;
  sessions: { session_date: string; title: string | null } | null;
};

type Response = {
  id: string;
  student_id: string | null;
  token: string;
  started_at: string | null;
  submitted_at: string | null;
  total_score: number | null;
  students: { name: string } | null;
};

type Props = {
  cohortId: string;
  diagnosis: Diagnosis;
  responses: Response[];
  studentCount: number;
  attendanceCheckOptions: AttnCheckOpt[];
};

function computeProgressStatus(
  startedAt: string | null,
  submittedAt: string | null,
  durationMinutes: number
): { label: string; badgeClass: string; timeText: string } {
  if (submittedAt) {
    return {
      label: '완료',
      badgeClass: 'bg-emerald-100 text-emerald-700',
      timeText: new Date(submittedAt).toLocaleString('ko-KR')
    };
  }
  if (!startedAt) {
    return {
      label: '미시작',
      badgeClass: 'bg-slate-100 text-slate-600',
      timeText: '-'
    };
  }
  const startedMs = new Date(startedAt).getTime();
  const elapsedMin = Math.floor((Date.now() - startedMs) / 60000);
  if (elapsedMin >= durationMinutes) {
    return {
      label: '시간 초과 (미제출)',
      badgeClass: 'bg-rose-100 text-rose-700',
      timeText: `${new Date(startedAt).toLocaleTimeString('ko-KR')} 시작 · ${elapsedMin}분 경과`
    };
  }
  return {
    label: `진행 중 (${elapsedMin}분 경과)`,
    badgeClass: 'bg-amber-100 text-amber-800',
    timeText: `${new Date(startedAt).toLocaleTimeString('ko-KR')} 시작`
  };
}

function DurationEditor({
  diagnosisId,
  cohortId,
  current,
  setMessage
}: {
  diagnosisId: string;
  cohortId: string;
  current: number;
  setMessage: (s: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(String(current));

  const dirty = value !== String(current);

  const handleSave = () => {
    setMessage(null);
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 180) {
      setMessage('응답 시간은 1~180분 사이 정수로 입력해주세요.');
      return;
    }
    startTransition(async () => {
      const r = await updateDiagnosisDuration(diagnosisId, cohortId, n);
      if (r.error) setMessage(`오류: ${r.error}`);
      else setMessage(`응답 시간 ${n}분으로 저장되었습니다.`);
    });
  };

  return (
    <div className='mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs'>
      <div className='flex items-center gap-2'>
        <span className='font-semibold text-slate-700'>응답 제한 시간:</span>
        <input
          type='number'
          min={1}
          max={180}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
          className='w-16 rounded border border-slate-200 bg-white px-2 py-0.5 text-xs'
        />
        <span className='text-slate-500'>분</span>
        {dirty && (
          <button
            type='button'
            onClick={handleSave}
            disabled={pending}
            className='ml-1 rounded bg-slate-800 px-2 py-0.5 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50'
          >
            {pending ? '저장 중...' : '저장'}
          </button>
        )}
      </div>
    </div>
  );
}

function AttendanceLinkSelector({
  diagnosisId,
  cohortId,
  currentCheckId,
  options,
  setMessage
}: {
  diagnosisId: string;
  cohortId: string;
  currentCheckId: string | null;
  options: AttnCheckOpt[];
  setMessage: (s: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const current = options.find((o) => o.id === currentCheckId) ?? null;

  const handleChange = (newId: string | null) => {
    setMessage(null);
    startTransition(async () => {
      const r = await linkDiagnosisToAttendanceCheck(diagnosisId, cohortId, newId);
      if (r.error) setMessage(`오류: ${r.error}`);
    });
  };

  if (options.length === 0) {
    return (
      <div className='mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500'>
        출석 체크포인트가 없습니다. 회차 출결 페이지에서 먼저 만들어주세요.
      </div>
    );
  }

  return (
    <div className='mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs'>
      <div className='flex items-center gap-2'>
        <span className='font-semibold text-amber-900'>출석 자동 연동:</span>
        <select
          value={currentCheckId ?? ''}
          onChange={(e) => handleChange(e.target.value || null)}
          disabled={pending}
          className='rounded border border-amber-200 bg-white px-2 py-0.5 text-xs'
        >
          <option value=''>없음 (출석 영향 X)</option>
          {options.map((o) => {
            const date = o.sessions?.session_date ?? '';
            const sessionTitle = o.sessions?.title ?? '';
            return (
              <option key={o.id} value={o.id}>
                {date}
                {sessionTitle ? ` ${sessionTitle}` : ''} · {o.label}
                {o.attendance_role === 'arrival'
                  ? ' (출석·지각)'
                  : o.attendance_role === 'departure'
                    ? ' (마감)'
                    : ''}
              </option>
            );
          })}
        </select>
      </div>
      {current && (
        <p className='mt-1 text-[11px] text-amber-700'>
          학생이 이 진단을 제출하면 자동으로 위 체크포인트에 체크인됩니다.
        </p>
      )}
    </div>
  );
}

export function DiagnosisCard({
  cohortId,
  diagnosis,
  responses,
  studentCount,
  attendanceCheckOptions
}: Props) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [showStatus, setShowStatus] = useState(false);
  const [origin, setOrigin] = useState('');
  const [qrOpen, setQrOpen] = useState(false);

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
          <DurationEditor
            diagnosisId={diagnosis.id}
            cohortId={cohortId}
            current={diagnosis.duration_minutes}
            setMessage={setMessage}
          />
          <AttendanceLinkSelector
            diagnosisId={diagnosis.id}
            cohortId={cohortId}
            currentCheckId={diagnosis.attendance_check_id}
            options={attendanceCheckOptions}
            setMessage={setMessage}
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Button onClick={handleShareCode} disabled={pending}>
            {pending ? '...' : diagnosis.share_code ? '공유 링크 복사' : '공유 링크 생성'}
          </Button>
          {diagnosis.share_code && (
            <Button variant='outline' onClick={() => setQrOpen(true)}>
              QR 보기
            </Button>
          )}
          {submittedCount > 0 && (
            <Button variant='outline' onClick={() => setShowStatus((v) => !v)}>
              {showStatus ? '현황 숨기기' : '응답 현황'}
            </Button>
          )}
        </div>
      </div>

      <QrDialog
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        label={`${typeLabel} · ${diagnosis.title}`}
        url={shareUrl ?? ''}
        filenamePrefix='diagnosis'
      />

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
                <th className='px-3 py-2 text-left font-semibold text-slate-600'>시각</th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {responses
                .slice()
                .sort((a, b) =>
                  (a.students?.name ?? '').localeCompare(b.students?.name ?? '', 'ko')
                )
                .map((r) => {
                  const stat = computeProgressStatus(
                    r.started_at,
                    r.submitted_at,
                    diagnosis.duration_minutes
                  );
                  return (
                    <tr key={r.id}>
                      <td className='px-3 py-2 font-medium text-slate-900'>
                        {r.students?.name ?? '(미지정)'}
                      </td>
                      <td className='px-3 py-2'>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stat.badgeClass}`}
                        >
                          {stat.label}
                        </span>
                      </td>
                      <td className='px-3 py-2 text-slate-700'>
                        {r.total_score != null ? Number(r.total_score) : '-'}
                      </td>
                      <td className='px-3 py-2 text-xs text-slate-500'>{stat.timeText}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
