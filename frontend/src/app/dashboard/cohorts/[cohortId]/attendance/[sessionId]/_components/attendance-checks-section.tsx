'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { QrDialog } from '@/components/qr-dialog';
import {
  createAttendanceCheck,
  deleteAttendanceCheck,
  updateAttendanceCheck
} from '../_actions';

type StudentInfo = {
  id: string;
  name: string;
  phone: string | null;
  org_name: string | null;
};

function formatPhone(phone: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}

function StudentNameTooltip({
  student,
  children
}: {
  student: StudentInfo;
  children: React.ReactNode;
}) {
  if (!student.org_name && !student.phone) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side='top' className='space-y-0.5 text-xs'>
        {student.org_name && <div>{student.org_name}</div>}
        {student.phone && <div className='tabular-nums opacity-90'>{formatPhone(student.phone)}</div>}
      </TooltipContent>
    </Tooltip>
  );
}

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
  students: StudentInfo[];
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

// ISO timestamp → 'HH:MM' (time input 호환)
function isoToTimeInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

const isTestStudent = (name: string) => name.startsWith('테스트');

export function AttendanceChecksSection({
  cohortId,
  sessionId,
  sessionDate,
  students,
  checks
}: Props) {
  const realStudents = students.filter((s) => !isTestStudent(s.name));
  const testStudents = students.filter((s) => isTestStudent(s.name));
  const realIds = new Set(realStudents.map((s) => s.id));
  const testIds = new Set(testStudents.map((s) => s.id));
  const [creating, setCreating] = useState(false);
  const [labelInput, setLabelInput] = useState('');
  const [criterionInput, setCriterionInput] = useState('');
  const [roleInput, setRoleInput] = useState<'none' | 'arrival' | 'departure'>('none');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [origin, setOrigin] = useState('');
  const [qrTarget, setQrTarget] = useState<{ label: string; url: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editCriterion, setEditCriterion] = useState('');
  const [editRole, setEditRole] = useState<'none' | 'arrival' | 'departure'>('none');

  const startEdit = (check: Check) => {
    setEditingId(check.id);
    setEditLabel(check.label);
    setEditCriterion(isoToTimeInput(check.criterion_at));
    setEditRole(
      check.attendance_role === 'arrival' || check.attendance_role === 'departure'
        ? check.attendance_role
        : 'none'
    );
    setMessage(null);
  };

  const handleSaveEdit = (checkId: string) => {
    setMessage(null);
    startTransition(async () => {
      const r = await updateAttendanceCheck(checkId, cohortId, sessionId, {
        label: editLabel,
        opens_at: null,
        closes_at: null,
        criterion_at: combineDateTime(sessionDate, editCriterion),
        attendance_role: editRole === 'none' ? null : editRole
      });
      if (r.error) setMessage(`오류: ${r.error}`);
      else setEditingId(null);
    });
  };

  if (typeof window !== 'undefined' && !origin) {
    setOrigin(window.location.origin);
  }

  const handleCreate = () => {
    if (!labelInput.trim()) return;
    setMessage(null);
    const criterionAt = combineDateTime(sessionDate, criterionInput);
    const role = roleInput === 'none' ? null : roleInput;
    startTransition(async () => {
      const r = await createAttendanceCheck(
        sessionId,
        cohortId,
        labelInput,
        null,
        null,
        role,
        criterionAt
      );
      if (r.error) setMessage(`오류: ${r.error}`);
      else {
        setLabelInput('');
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
    <TooltipProvider delayDuration={150}>
    <div className='rounded-2xl border bg-white p-6 shadow-sm'>
      <div className='mb-4 flex items-center justify-between'>
        <div>
          <h2 className='text-lg font-bold text-slate-900'>셀프 출석 체크</h2>
          <p className='mt-0.5 text-xs text-slate-500'>
            학생이 share 링크로 직접 체크인합니다. 한 세션에 여러 개(교육 시작/중간/마감) 만들 수 있어요. 학생은 언제든 체크인 가능하고, 지각 기준 시각만 지각 판정에 사용됩니다.
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
              지각 기준 시각 <span className='font-normal text-slate-400'>(이 시각 이후 체크인 = 지각)</span>
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
          <CheckpointSummaryTable
            realStudents={realStudents}
            testStudents={testStudents}
            checks={checks}
          />
          <div className='space-y-3'>
          {checks.map((check) => {
            const url = check.share_code ? `${origin}/attendance/${check.share_code}` : '';
            const recordByStudent = new Map<string, string>();
            for (const r of check.records) recordByStudent.set(r.student_id, r.checked_at);
            const realCheckedIn = check.records.filter((r) => realIds.has(r.student_id)).length;
            const testCheckedIn = check.records.filter((r) => testIds.has(r.student_id)).length;

            return (
              <div key={check.id} className='rounded-xl border bg-white'>
                <div className='flex items-center justify-between gap-3 p-4'>
                  <div className='min-w-0 flex-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <h3 className='font-semibold text-slate-900'>{check.label}</h3>
                      <span className='rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700'>
                        {realCheckedIn} / {realStudents.length}명
                      </span>
                      {testStudents.length > 0 && (
                        <span className='rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600'>
                          테스트 {testCheckedIn} / {testStudents.length}
                        </span>
                      )}
                      {check.attendance_role === 'arrival' && (
                        <span className='rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700'>
                          출석/지각 {check.criterion_at ? `(이후 지각: ${formatTime(check.criterion_at)})` : ''}
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
                    <Button variant='outline' onClick={() => startEdit(check)}>
                      수정
                    </Button>
                    <Button
                      variant='outline'
                      onClick={() => handleDelete(check.id, check.label)}
                      className='text-red-600 hover:bg-red-50 hover:text-red-700'
                    >
                      삭제
                    </Button>
                  </div>
                </div>

                {editingId === check.id && (
                  <div className='space-y-3 border-t bg-amber-50/40 px-4 py-4'>
                    <div>
                      <label className='mb-1 block text-xs font-semibold text-slate-600'>
                        체크포인트 이름
                      </label>
                      <input
                        type='text'
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                      />
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
                            onClick={() => setEditRole(opt.value as typeof editRole)}
                            className={`rounded-lg border p-2 text-left transition-all ${
                              editRole === opt.value
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
                        지각 기준 시각{' '}
                        <span className='font-normal text-slate-400'>(이 시각 이후 체크인 = 지각)</span>
                      </label>
                      <input
                        type='time'
                        value={editCriterion}
                        onChange={(e) => setEditCriterion(e.target.value)}
                        className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                      />
                    </div>
                    <p className='text-[11px] text-slate-500'>
                      기준일: {sessionDate}. 비우면 지각 판정 안 함.
                    </p>
                    <div className='flex gap-2'>
                      <Button
                        onClick={() => handleSaveEdit(check.id)}
                        disabled={pending || !editLabel.trim()}
                        className='flex-1'
                      >
                        {pending ? '...' : '저장'}
                      </Button>
                      <Button variant='outline' onClick={() => setEditingId(null)}>
                        취소
                      </Button>
                    </div>
                  </div>
                )}

                {/* 명단 — 항상 표시. 체크인 안 한 학생은 회색, 한 학생은 시각 표시 */}
                <div className='space-y-3 border-t bg-slate-50 px-4 py-3'>
                  {students.length === 0 ? (
                    <p className='text-center text-xs text-slate-400'>학생이 없습니다.</p>
                  ) : (
                    <>
                      <CheckpointNameGrid
                        students={realStudents}
                        recordByStudent={recordByStudent}
                        criterionAt={check.criterion_at}
                      />
                      {testStudents.length > 0 && (
                        <div className='space-y-1.5'>
                          <div className='flex items-center gap-2'>
                            <span className='text-[11px] font-semibold text-slate-500'>테스트</span>
                            <div className='h-px flex-1 bg-slate-200' />
                          </div>
                          <CheckpointNameGrid
                            students={testStudents}
                            recordByStudent={recordByStudent}
                            criterionAt={check.criterion_at}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </>
      )}
    </div>
    </TooltipProvider>
  );
}

function CheckpointNameGrid({
  students,
  recordByStudent,
  criterionAt
}: {
  students: StudentInfo[];
  recordByStudent: Map<string, string>;
  criterionAt: string | null;
}) {
  return (
    <div className='grid grid-cols-3 gap-1.5 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-9'>
      {students.map((s) => {
        const checkedAt = recordByStudent.get(s.id);
        const isLate =
          checkedAt && criterionAt && new Date(checkedAt) > new Date(criterionAt);
        return (
          <div
            key={s.id}
            className={`flex items-center justify-between gap-1 rounded-lg px-2.5 py-1 text-xs ring-1 ${
              checkedAt
                ? isLate
                  ? 'bg-white text-slate-900 ring-orange-300'
                  : 'bg-white text-slate-900 ring-emerald-200'
                : 'bg-transparent text-slate-400 ring-slate-200'
            }`}
          >
            <StudentNameTooltip student={s}>
              <span className={`truncate font-medium ${checkedAt ? '' : 'line-through'}`}>
                {s.name}
              </span>
            </StudentNameTooltip>
            {checkedAt ? (
              <span
                className={`font-bold tabular-nums ${isLate ? 'text-orange-600' : 'text-emerald-600'}`}
                title={isLate ? '지각' : '정시'}
              >
                {new Date(checkedAt).toLocaleTimeString('ko-KR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
                })}
              </span>
            ) : (
              <span className='text-[10px] text-slate-400'>대기</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CheckpointSummaryTable({
  realStudents,
  testStudents,
  checks
}: {
  realStudents: StudentInfo[];
  testStudents: StudentInfo[];
  checks: Check[];
}) {
  if (realStudents.length === 0 && testStudents.length === 0) return null;
  const colSpan = checks.length + 1;
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
            {realStudents.map((s) => (
              <SummaryRow key={s.id} student={s} checks={checks} />
            ))}
            {testStudents.length > 0 && (
              <tr className='bg-slate-100'>
                <td
                  colSpan={colSpan}
                  className='sticky left-0 px-3 py-1.5 text-[11px] font-semibold text-slate-500'
                >
                  테스트
                </td>
              </tr>
            )}
            {testStudents.map((s) => (
              <SummaryRow key={s.id} student={s} checks={checks} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryRow({
  student,
  checks
}: {
  student: StudentInfo;
  checks: Check[];
}) {
  return (
    <tr>
      <td className='sticky left-0 bg-white px-3 py-2 font-medium text-slate-900'>
        <StudentNameTooltip student={student}>
          <span className='cursor-default'>{student.name}</span>
        </StudentNameTooltip>
      </td>
      {checks.map((c) => {
        const record = c.records.find((r) => r.student_id === student.id);
        return (
          <td key={c.id} className='whitespace-nowrap border-l px-3 py-2'>
            <CellStatus checkedAt={record?.checked_at} criterionAt={c.criterion_at} />
          </td>
        );
      })}
    </tr>
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
