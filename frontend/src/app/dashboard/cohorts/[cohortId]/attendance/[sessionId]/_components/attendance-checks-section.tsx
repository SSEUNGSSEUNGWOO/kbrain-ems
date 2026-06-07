'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { QrDialog } from '@/components/qr-dialog';
import { createAttendanceCheck, deleteAttendanceCheck } from '../_actions';

type Check = {
  id: string;
  label: string;
  share_code: string | null;
  opens_at: string | null;
  closes_at: string | null;
  criterion_at: string | null;
  attendance_role: string | null;
  records: { student_id: string; checked_at: string; students: { name: string } | null }[];
};

type Props = {
  cohortId: string;
  sessionId: string;
  sessionDate: string;
  students: { id: string; name: string }[];
  checks: Check[];
};

function combineDateTime(date: string, time: string): string | null {
  if (!time) return null;
  // date: 'YYYY-MM-DD', time: 'HH:MM'
  return new Date(`${date}T${time}:00`).toISOString();
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

export function AttendanceChecksSection({
  cohortId,
  sessionId,
  sessionDate,
  students,
  checks
}: Props) {
  const totalStudents = students.length;
  const [creating, setCreating] = useState(false);
  const [labelInput, setLabelInput] = useState('');
  const [opensInput, setOpensInput] = useState('');
  const [closesInput, setClosesInput] = useState('');
  const [criterionInput, setCriterionInput] = useState('');
  const [roleInput, setRoleInput] = useState<'none' | 'arrival' | 'departure'>('none');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [origin, setOrigin] = useState('');
  const [qrTarget, setQrTarget] = useState<{ label: string; url: string } | null>(null);

  if (typeof window !== 'undefined' && !origin) {
    setOrigin(window.location.origin);
  }

  const handleCreate = () => {
    if (!labelInput.trim()) return;
    setMessage(null);
    const opensAt = combineDateTime(sessionDate, opensInput);
    const closesAt = combineDateTime(sessionDate, closesInput);
    const criterionAt = combineDateTime(sessionDate, criterionInput);
    const role = roleInput === 'none' ? null : roleInput;
    startTransition(async () => {
      const r = await createAttendanceCheck(
        sessionId,
        cohortId,
        labelInput,
        opensAt,
        closesAt,
        role,
        criterionAt
      );
      if (r.error) setMessage(`오류: ${r.error}`);
      else {
        setLabelInput('');
        setOpensInput('');
        setClosesInput('');
        setCriterionInput('');
        setRoleInput('none');
        setCreating(false);
      }
    });
  };

  const handleDelete = (id: string, label: string) => {
    if (!window.confirm(`"${label}" 체크포인트와 모든 체크인 기록을 삭제할까요?`)) return;
    startTransition(async () => {
      const r = await deleteAttendanceCheck(id, cohortId, sessionId);
      if (r.error) setMessage(`오류: ${r.error}`);
    });
  };

  const copyShareLink = async (code: string, label: string) => {
    const url = `${origin}/attendance/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setMessage(`"${label}" 링크 복사됨: ${url}`);
    } catch {
      setMessage(`링크: ${url}`);
    }
  };

  return (
    <div className='rounded-2xl border bg-white p-6 shadow-sm'>
      <div className='mb-4 flex items-center justify-between'>
        <div>
          <h2 className='text-lg font-bold text-slate-900'>셀프 출석 체크</h2>
          <p className='mt-0.5 text-xs text-slate-500'>
            학생이 share 링크로 직접 체크인합니다. 한 세션에 여러 개(예: 오전·점심후·마감) 만들 수 있어요.
          </p>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)} variant='outline'>
            + 체크포인트 추가
          </Button>
        )}
      </div>

      {creating && (
        <div className='mb-4 space-y-3 rounded-xl bg-slate-50 p-4'>
          <div>
            <label className='mb-1 block text-xs font-semibold text-slate-600'>
              체크포인트 이름
            </label>
            <input
              type='text'
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              autoFocus
              placeholder='예: 오전 시작, 점심 후, 마감'
              className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
            />
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div>
              <label className='mb-1 block text-xs font-semibold text-slate-600'>
                체크인 시작 시각 <span className='font-normal text-slate-400'>(선택)</span>
              </label>
              <input
                type='time'
                value={opensInput}
                onChange={(e) => setOpensInput(e.target.value)}
                className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
              />
            </div>
            <div>
              <label className='mb-1 block text-xs font-semibold text-slate-600'>
                체크인 종료 시각 <span className='font-normal text-slate-400'>(선택)</span>
              </label>
              <input
                type='time'
                value={closesInput}
                onChange={(e) => setClosesInput(e.target.value)}
                className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
              />
            </div>
          </div>
          <div>
            <label className='mb-1.5 block text-xs font-semibold text-slate-600'>
              출결 자동 반영
            </label>
            <div className='grid grid-cols-3 gap-2'>
              {[
                { value: 'none', label: '없음 (기록만)', desc: '체크인 시각만 저장' },
                { value: 'arrival', label: '출석/지각 판별', desc: '정시 기준 이후=지각' },
                { value: 'departure', label: '마감 확인', desc: '퇴실 시각 기록' }
              ].map((opt) => (
                <button
                  key={opt.value}
                  type='button'
                  onClick={() => setRoleInput(opt.value as typeof roleInput)}
                  className={`rounded-lg border p-2 text-left transition-all ${
                    roleInput === opt.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className='text-xs font-semibold text-slate-900'>{opt.label}</div>
                  <div className='mt-0.5 text-[10px] text-slate-500'>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className='mb-1 block text-xs font-semibold text-slate-600'>
              정시 기준 시각 <span className='font-normal text-slate-400'>(이후 체크인 = 지각 표시 · 역할 무관 · 선택)</span>
            </label>
            <input
              type='time'
              value={criterionInput}
              onChange={(e) => setCriterionInput(e.target.value)}
              className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
            />
          </div>
          <p className='text-[11px] text-slate-500'>
            시간 입력 안 하면 언제든 체크인 가능. 입력하면 그 시간대에만 학생 체크인 허용 ({sessionDate} 기준).
          </p>
          <div className='flex gap-2'>
            <Button onClick={handleCreate} disabled={pending || !labelInput.trim()} className='flex-1'>
              {pending ? '...' : '생성'}
            </Button>
            <Button
              variant='outline'
              onClick={() => {
                setCreating(false);
                setLabelInput('');
                setOpensInput('');
                setClosesInput('');
                setCriterionInput('');
                setRoleInput('none');
              }}
            >
              취소
            </Button>
          </div>
        </div>
      )}

      {message && (
        <div className='mb-4 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800 break-all'>
          {message}
        </div>
      )}

      <QrDialog
        open={!!qrTarget}
        onClose={() => setQrTarget(null)}
        label={qrTarget?.label ?? ''}
        url={qrTarget?.url ?? ''}
        filenamePrefix='attendance'
      />

      {checks.length === 0 ? (
        <div className='rounded-xl border border-dashed border-slate-200 px-6 py-8 text-center text-sm text-slate-400'>
          아직 체크포인트가 없습니다. 위 + 버튼으로 추가하세요.
        </div>
      ) : (
        <>
          <CheckpointSummaryTable students={students} checks={checks} />
          <div className='space-y-3'>
          {checks.map((check) => {
            const url = check.share_code ? `${origin}/attendance/${check.share_code}` : '';
            const recordByStudent = new Map<string, string>();
            for (const r of check.records) recordByStudent.set(r.student_id, r.checked_at);

            return (
              <div key={check.id} className='rounded-xl border bg-white'>
                <div className='flex items-center justify-between gap-3 p-4'>
                  <div className='min-w-0 flex-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <h3 className='font-semibold text-slate-900'>{check.label}</h3>
                      <span className='rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700'>
                        {check.records.length} / {totalStudents}명
                      </span>
                      {(check.opens_at || check.closes_at) && (
                        <span className='rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700'>
                          {formatTime(check.opens_at) || '~~'} ~ {formatTime(check.closes_at) || '~~'}
                        </span>
                      )}
                      {check.attendance_role === 'arrival' && (
                        <span className='rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700'>
                          출석/지각 {check.criterion_at ? `(정시 ${formatTime(check.criterion_at)})` : ''}
                        </span>
                      )}
                      {check.attendance_role === 'departure' && (
                        <span className='rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700'>
                          마감 확인
                        </span>
                      )}
                    </div>
                    {url && (
                      <p className='mt-1 truncate text-xs text-slate-500'>
                        <span className='font-mono'>{url}</span>
                      </p>
                    )}
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    {check.share_code && (
                      <>
                        <Button variant='outline' onClick={() => copyShareLink(check.share_code!, check.label)}>
                          링크 복사
                        </Button>
                        <Button
                          variant='outline'
                          onClick={() => setQrTarget({ label: check.label, url })}
                        >
                          QR 보기
                        </Button>
                      </>
                    )}
                    <Button
                      variant='outline'
                      onClick={() => handleDelete(check.id, check.label)}
                      className='text-red-600 hover:bg-red-50 hover:text-red-700'
                    >
                      삭제
                    </Button>
                  </div>
                </div>

                {/* 명단 — 항상 표시. 체크인 안 한 학생은 회색, 한 학생은 시각 표시 */}
                <div className='border-t bg-slate-50 px-4 py-3'>
                  {students.length === 0 ? (
                    <p className='text-center text-xs text-slate-400'>학생이 없습니다.</p>
                  ) : (
                    <div className='flex flex-wrap gap-1.5'>
                      {students.map((s) => {
                        const checkedAt = recordByStudent.get(s.id);
                        const isLate =
                          checkedAt &&
                          check.criterion_at &&
                          new Date(checkedAt) > new Date(check.criterion_at);
                        return (
                          <div
                            key={s.id}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs ring-1 ${
                              checkedAt
                                ? isLate
                                  ? 'bg-white text-slate-900 ring-orange-300'
                                  : 'bg-white text-slate-900 ring-emerald-200'
                                : 'bg-transparent text-slate-400 ring-slate-200'
                            }`}
                          >
                            <span className={`font-medium ${checkedAt ? '' : 'line-through'}`}>
                              {s.name}
                            </span>
                            {checkedAt ? (
                              <>
                                <span className={isLate ? 'text-orange-600' : 'text-emerald-600'}>
                                  {new Date(checkedAt).toLocaleTimeString('ko-KR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: false
                                  })}
                                </span>
                                {isLate && (
                                  <span className='rounded bg-orange-100 px-1.5 py-0 text-[10px] font-bold text-orange-700'>
                                    지각
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className='text-[10px] text-slate-400'>대기</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </>
      )}
    </div>
  );
}

function CheckpointSummaryTable({
  students,
  checks
}: {
  students: { id: string; name: string }[];
  checks: Check[];
}) {
  if (students.length === 0) return null;
  return (
    <div className='mb-4 overflow-hidden rounded-xl border bg-white'>
      <div className='border-b bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700'>
        체크포인트별 출결 요약
      </div>
      <div className='max-h-96 overflow-auto'>
        <table className='w-full text-xs'>
          <thead className='sticky top-0 z-10 bg-white shadow-sm'>
            <tr>
              <th className='sticky left-0 z-20 bg-white px-3 py-2 text-left font-semibold text-slate-700'>
                이름
              </th>
              {checks.map((c) => (
                <th
                  key={c.id}
                  className='whitespace-nowrap border-l px-3 py-2 text-left font-semibold text-slate-700'
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className='divide-y'>
            {students.map((s) => (
              <tr key={s.id}>
                <td className='sticky left-0 bg-white px-3 py-2 font-medium text-slate-900'>
                  {s.name}
                </td>
                {checks.map((c) => {
                  const record = c.records.find((r) => r.student_id === s.id);
                  return (
                    <td key={c.id} className='whitespace-nowrap border-l px-3 py-2'>
                      <CellStatus checkedAt={record?.checked_at} criterionAt={c.criterion_at} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CellStatus({
  checkedAt,
  criterionAt
}: {
  checkedAt: string | undefined;
  criterionAt: string | null;
}) {
  if (!checkedAt) {
    return <span className='text-slate-400'>—</span>;
  }
  const time = new Date(checkedAt).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  if (!criterionAt) {
    return (
      <span className='inline-flex items-center gap-1.5'>
        <span className='rounded bg-emerald-100 px-1.5 py-0 font-semibold text-emerald-700'>출석</span>
        <span className='text-slate-500'>{time}</span>
      </span>
    );
  }
  const diffMin = Math.round((new Date(checkedAt).getTime() - new Date(criterionAt).getTime()) / 60000);
  if (diffMin > 0) {
    return (
      <span className='inline-flex items-center gap-1.5'>
        <span className='rounded bg-orange-100 px-1.5 py-0 font-semibold text-orange-700'>
          지각 {diffMin}분
        </span>
        <span className='text-slate-500'>{time}</span>
      </span>
    );
  }
  return (
    <span className='inline-flex items-center gap-1.5'>
      <span className='rounded bg-emerald-100 px-1.5 py-0 font-semibold text-emerald-700'>정시</span>
      <span className='text-slate-500'>{time}</span>
    </span>
  );
}
