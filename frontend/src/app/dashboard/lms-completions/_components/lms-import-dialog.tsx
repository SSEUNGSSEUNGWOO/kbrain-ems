'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Icons } from '@/components/icons';
import {
  fetchApplicantsMatchKeys,
  importMatchedLmsCompletions,
  type LmsRow
} from '../../applicants/_actions';

type Stage = 'idle' | 'parsing' | 'preview' | 'importing' | 'done';

// 자주 쓰는 과목 프리셋 (드롭다운 + 직접 입력 가능)
const COURSE_PRESETS = [
  { code: 'ai_literacy', label: 'AI 리터러시' },
  { code: 'data_literacy', label: '데이터분석 리터러시' }
];

const normalizePhone = (s: string | undefined | null) => (s ?? '').replace(/[^\d]/g, '');
const normalizeEmail = (s: string | undefined | null) => (s ?? '').trim().toLowerCase();

// Excel date serial number → 'YYYY-MM-DD'
function excelSerialToDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    // Excel epoch: 1899-12-30
    const ms = (v - 25569) * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // 'YYYY-MM-DD' / 'YYYY.MM.DD' / 'YYYY/MM/DD'
  const m1 = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}`;
  // 'M/D/YY' / 'M/D/YYYY' — LMS export 포맷 (예: "5/29/26 7:57"). 2자리 연도는 20YY로 해석.
  const mYY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (mYY) {
    const yy = mYY[3];
    const yyyy = yy.length === 2 ? `20${yy.padStart(2, '0')}` : yy;
    return `${yyyy}-${mYY[1].padStart(2, '0')}-${mYY[2].padStart(2, '0')}`;
  }
  // 'YYYYMMDD'
  const m2 = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return null;
}

type Props = {
  trigger: React.ReactNode;
};

export function LmsImportDialog({ trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [courseCode, setCourseCode] = useState(COURSE_PRESETS[0].code);
  const [customCode, setCustomCode] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [fileName, setFileName] = useState('');
  const [matchedRows, setMatchedRows] = useState<LmsRow[]>([]);
  const [stats, setStats] = useState<{
    totalLms: number;
    matched: number;
    unmatched: number;
  } | null>(null);
  const [result, setResult] = useState<{ inserted: number; updated: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setStage('idle');
    setError(null);
    setFileName('');
    setMatchedRows([]);
    setStats(null);
    setResult(null);
  };

  const onFile = async (file: File) => {
    setError(null);
    setFileName(file.name);
    setStage('parsing');
    try {
      const [xlsxMod, keysRes] = await Promise.all([
        import('xlsx'),
        fetchApplicantsMatchKeys()
      ]);
      // CommonJS 패키지 — Turbopack에서 default 추출 불안정. namespace 직접 사용.
      const xlsx = (xlsxMod as unknown as { default?: typeof xlsxMod }).default ?? xlsxMod;
      if (keysRes.error || !keysRes.applicants) {
        throw new Error(keysRes.error ?? '신청자 정보 로드 실패');
      }
      // 매칭 인덱스: phone → applicant, email → applicant
      const phoneIdx = new Map<string, true>();
      const emailIdx = new Map<string, true>();
      for (const a of keysRes.applicants) {
        const p = normalizePhone(a.phone);
        const e = normalizeEmail(a.email);
        if (p) phoneIdx.set(p, true);
        if (e) emailIdx.set(e, true);
      }

      const buf = await file.arrayBuffer();
      const wb = xlsx.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      const finalCode = useCustom ? customCode.trim() : courseCode;
      if (!finalCode) throw new Error('과정 코드를 입력하세요.');
      const courseLabel =
        COURSE_PRESETS.find((c) => c.code === finalCode)?.label ?? finalCode;
      // LMS 수료자 전체를 저장. 새 신청자가 들어와도 phone/email로 자동 매칭됨.
      const allRows: LmsRow[] = [];
      let totalLms = 0;
      let matchedNow = 0;
      for (const r of rows) {
        const completed = String(r['수료'] ?? '').trim().toUpperCase() === 'Y';
        if (!completed) continue;
        totalLms++;
        const name = String(r['이름'] ?? '').trim();
        const phone = normalizePhone(String(r['휴대폰'] ?? ''));
        const email = normalizeEmail(String(r['이메일'] ?? ''));
        const hitNow = (phone && phoneIdx.has(phone)) || (email && emailIdx.has(email));
        if (hitNow) matchedNow++;
        allRows.push({
          course_code: finalCode,
          course_name: String(r['과정'] ?? courseLabel).trim(),
          name,
          phone: phone || null,
          email: email || null,
          completed: true,
          completed_at: excelSerialToDate(r['수료일']),
          certificate_no: String(r['수료번호'] ?? '').trim() || null
        });
      }

      setMatchedRows(allRows);
      setStats({ totalLms, matched: matchedNow, unmatched: totalLms - matchedNow });
      setStage('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : '파싱 실패');
      setStage('idle');
    }
  };

  const onConfirm = () => {
    setStage('importing');
    startTransition(async () => {
      const res = await importMatchedLmsCompletions(matchedRows);
      if (res.error) {
        setError(res.error);
        setStage('preview');
        return;
      }
      setResult({ inserted: res.inserted ?? 0, updated: res.updated ?? 0 });
      setStage('done');
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className='max-w-xl'>
        <DialogHeader>
          <DialogTitle>사전학습 명단 업로드</DialogTitle>
          <DialogDescription>
            LMS 수료자 명단(.xlsx)을 업로드해 신청자와 자동 매칭합니다.
          </DialogDescription>
        </DialogHeader>

        {stage === 'idle' && (
          <div className='flex flex-col gap-4 py-2'>
            <div className='flex flex-col gap-2'>
              <label htmlFor='lms-course' className='text-sm font-medium'>
                과정 코드
              </label>
              {!useCustom ? (
                <select
                  id='lms-course'
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  className='border-input bg-background h-9 rounded-md border px-3 text-sm'
                >
                  {COURSE_PRESETS.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label} ({c.code})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id='lms-course'
                  type='text'
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value)}
                  placeholder='예: ai_literacy_advanced'
                  className='border-input bg-background h-9 rounded-md border px-3 text-sm'
                />
              )}
              <label className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                <input
                  type='checkbox'
                  checked={useCustom}
                  onChange={(e) => setUseCustom(e.target.checked)}
                />
                직접 입력 (새 과목 코드)
              </label>
            </div>
            <label className='border-input hover:bg-muted/40 flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed py-10 text-sm transition-colors'>
              <Icons.upload className='text-muted-foreground mb-2 size-8' />
              <span className='font-medium'>클릭해서 .xlsx 파일 선택</span>
              <span className='text-muted-foreground mt-1 text-xs'>LMS 수료자 명단</span>
              <input
                type='file'
                accept='.xlsx,.xls'
                className='hidden'
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
            </label>
            {error && <div className='text-destructive text-sm'>{error}</div>}
          </div>
        )}

        {stage === 'parsing' && (
          <div className='flex flex-col items-center gap-2 py-10'>
            <Icons.spinner className='text-primary size-6 animate-spin' />
            <div className='text-sm'>파싱·매칭 중...</div>
          </div>
        )}

        {(stage === 'preview' || stage === 'importing') && stats && (
          <div className='flex flex-col gap-3 py-2'>
            <div className='text-muted-foreground truncate text-xs'>파일: {fileName}</div>
            <div className='grid grid-cols-3 gap-2 text-sm'>
              <Stat label='LMS 수료자 (수료=Y)' value={stats.totalLms} />
              <Stat label='현재 신청자와 매칭' value={stats.matched} tone='text-emerald-600' />
              <Stat label='향후 신청자 대비' value={stats.unmatched} tone='text-muted-foreground' />
            </div>
            <p className='text-muted-foreground text-xs'>
              <strong>전체 {stats.totalLms}건</strong>이 DB에 저장됩니다. 지금 신청자 중 {stats.matched}명이
              이미 매칭됐고, 나머지 {stats.unmatched}건은 향후 추가 신청자가 들어왔을 때 휴대폰·이메일로 자동 매칭됩니다.
            </p>
            {error && <div className='text-destructive text-sm'>{error}</div>}
          </div>
        )}

        {stage === 'done' && result && (
          <div className='flex flex-col gap-2 py-4'>
            <div className='text-emerald-600 flex items-center gap-2 font-medium'>
              <Icons.check className='size-5' /> 완료
            </div>
            <div className='text-sm'>
              신규 {result.inserted}건 · 업데이트 {result.updated}건
            </div>
          </div>
        )}

        <DialogFooter>
          {stage === 'idle' && (
            <Button variant='outline' onClick={() => setOpen(false)}>
              닫기
            </Button>
          )}
          {stage === 'preview' && (
            <>
              <Button variant='outline' onClick={reset} disabled={pending}>
                다시 선택
              </Button>
              <Button onClick={onConfirm} disabled={pending || matchedRows.length === 0}>
                {matchedRows.length.toLocaleString()}건 저장
              </Button>
            </>
          )}
          {stage === 'done' && (
            <>
              <Button variant='outline' onClick={reset}>
                다른 파일 추가
              </Button>
              <Button onClick={() => setOpen(false)}>완료</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className='border-input flex flex-col gap-0.5 rounded-md border px-3 py-2'>
      <span className='text-muted-foreground text-xs'>{label}</span>
      <span className={`text-base font-semibold tabular-nums ${tone ?? ''}`}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}
