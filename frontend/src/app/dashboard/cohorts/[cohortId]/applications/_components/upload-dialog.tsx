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
import { importApplicationsXls } from '../_actions';
import type { AppQuestion, MappingPreview, ParsedRow } from '@/lib/applications-xls-parser';

type Stage = 'select' | 'preview' | 'running' | 'done';

type Props = {
  cohortId: string;
  questions: AppQuestion[];
  trigger: React.ReactNode;
};

export function UploadDialog({ cohortId, questions, trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>('select');
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<MappingPreview | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [multiMapping, setMultiMapping] = useState<Record<string, Record<string, string>>>({});
  const [result, setResult] = useState<Awaited<ReturnType<typeof importApplicationsXls>> | null>(
    null
  );
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setStage('select');
    setFileName('');
    setError(null);
    setPreview(null);
    setParsedRows([]);
    setMultiMapping({});
    setResult(null);
  };

  const onFile = async (file: File) => {
    setError(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const { parseAnyXls, buildPreview } = await import('@/lib/applications-xls-parser');
      const rows = parseAnyXls(buf);
      const pv = buildPreview(rows, questions);
      const preRows = rows.filter((r) => r.surveyType === '사전설문');
      setParsedRows(preRows);
      setPreview(pv);
      const seed: Record<string, Record<string, string>> = {};
      for (const mq of pv.multiQuestions) {
        seed[mq.question_no] = { ...mq.autoSuggest };
      }
      setMultiMapping(seed);
      setStage('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : '파싱 실패');
    }
  };

  const onConfirm = () => {
    if (!preview) return;
    setStage('running');
    startTransition(async () => {
      const res = await importApplicationsXls(cohortId, parsedRows, multiMapping);
      setResult(res);
      setStage('done');
      if (!res.error) router.refresh();
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
      <DialogContent className='max-h-[90vh] max-w-2xl overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>응답 엑셀 업로드</DialogTitle>
          <DialogDescription>
            외부 신청 시스템에서 받은 .xls 파일을 업로드해 신청자·응답을 가져옵니다.
          </DialogDescription>
        </DialogHeader>

        {stage === 'select' && (
          <SelectStage onFile={onFile} fileName={fileName} error={error} />
        )}

        {stage === 'preview' && preview && (
          <PreviewStage
            preview={preview}
            multiMapping={multiMapping}
            setMultiMapping={setMultiMapping}
            fileName={fileName}
          />
        )}

        {stage === 'running' && <RunningStage />}

        {stage === 'done' && result && <DoneStage result={result} />}

        <DialogFooter>
          {stage === 'select' && (
            <Button variant='outline' onClick={() => setOpen(false)}>
              닫기
            </Button>
          )}
          {stage === 'preview' && (
            <>
              <Button variant='outline' onClick={reset} disabled={pending}>
                다시 선택
              </Button>
              <Button onClick={onConfirm} disabled={pending}>
                {preview ? `${preview.preSurveyRows}건 import 실행` : 'import 실행'}
              </Button>
            </>
          )}
          {stage === 'done' && (
            <Button
              onClick={() => {
                setOpen(false);
                router.refresh();
              }}
            >
              완료
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SelectStage({
  onFile,
  fileName,
  error
}: {
  onFile: (f: File) => void;
  fileName: string;
  error: string | null;
}) {
  return (
    <div className='flex flex-col gap-3 py-4'>
      <label className='border-input hover:bg-muted/40 flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed py-10 text-sm transition-colors'>
        <Icons.upload className='text-muted-foreground mb-2 size-8' />
        <span className='font-medium'>클릭해서 .xls 파일 선택</span>
        <span className='text-muted-foreground mt-1 text-xs'>외부 설문 시스템 export</span>
        <input
          type='file'
          accept='.xls,.xlsx,.html,.htm'
          className='hidden'
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </label>
      {fileName && (
        <div className='text-muted-foreground truncate text-xs'>선택: {fileName}</div>
      )}
      {error && <div className='text-destructive text-sm'>{error}</div>}
    </div>
  );
}

function PreviewStage({
  preview,
  multiMapping,
  setMultiMapping,
  fileName
}: {
  preview: MappingPreview;
  multiMapping: Record<string, Record<string, string>>;
  setMultiMapping: (m: Record<string, Record<string, string>>) => void;
  fileName: string;
}) {
  const totalFailed = preview.unknownSingleValues.length;
  return (
    <div className='flex flex-col gap-4 py-2'>
      <div className='text-muted-foreground truncate text-xs'>파일: {fileName}</div>

      <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
        <Stat label='총 행' value={preview.totalRows} />
        <Stat label='사전설문' value={preview.preSurveyRows} tone='text-emerald-600' />
        <Stat label='사후설문 (스킵)' value={preview.postSurveyRows} tone='text-muted-foreground' />
        <Stat
          label='이름 없음 (스킵)'
          value={preview.rowsWithoutName}
          tone={preview.rowsWithoutName > 0 ? 'text-amber-600' : 'text-muted-foreground'}
        />
      </div>

      <Section title='문항별 매칭'>
        <div className='grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3'>
          {preview.questionMapping.map((m) => (
            <div key={m.question_no} className='flex justify-between'>
              <span className='text-muted-foreground'>{m.question_no}</span>
              <span className='tabular-nums'>
                {m.mappedCount}
                {m.failedCount > 0 && (
                  <span className='text-destructive ml-1'>(-{m.failedCount})</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {totalFailed > 0 && (
        <Section title={`매칭 실패 ${totalFailed}건`} tone='warning'>
          <div className='max-h-32 overflow-y-auto text-xs'>
            {preview.unknownSingleValues.slice(0, 20).map((u, i) => (
              <div key={i} className='text-muted-foreground'>
                {u.question_no} · row{u.row}: {u.raw.slice(0, 60)}
              </div>
            ))}
            {totalFailed > 20 && (
              <div className='text-muted-foreground mt-1'>… 외 {totalFailed - 20}건</div>
            )}
          </div>
        </Section>
      )}

      {preview.multiQuestions.map((mq) => (
        <Section key={mq.question_no} title={`다중선택 매핑: ${mq.question_no}`}>
          <div className='text-muted-foreground mb-2 text-xs'>
            외부 ID를 EMS 선택지에 매핑하세요. (자동 추천: 순서대로)
          </div>
          <div className='flex flex-col gap-2'>
            {mq.externalIds.map((extId) => (
              <div key={extId} className='flex items-center gap-2 text-sm'>
                <span className='bg-muted w-12 rounded px-2 py-1 text-center font-mono text-xs tabular-nums'>
                  {extId}
                </span>
                <span className='text-muted-foreground'>→</span>
                <select
                  className='border-input bg-background flex-1 rounded-md border px-2 py-1 text-xs'
                  value={multiMapping[mq.question_no]?.[extId] ?? ''}
                  onChange={(e) => {
                    setMultiMapping({
                      ...multiMapping,
                      [mq.question_no]: {
                        ...multiMapping[mq.question_no],
                        [extId]: e.target.value
                      }
                    });
                  }}
                >
                  <option value=''>— 매핑 안 함 —</option>
                  {mq.emsChoices.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.key} {c.text.slice(0, 40)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}

function RunningStage() {
  return (
    <div className='flex flex-col items-center gap-2 py-10'>
      <Icons.spinner className='text-primary size-6 animate-spin' />
      <div className='text-sm'>import 진행 중...</div>
    </div>
  );
}

function DoneStage({ result }: { result: Awaited<ReturnType<typeof importApplicationsXls>> }) {
  if (result.error) {
    return (
      <div className='flex flex-col gap-2 py-4'>
        <div className='text-destructive flex items-center gap-2 font-medium'>
          <Icons.alertCircle className='size-4' /> 실패
        </div>
        <div className='text-destructive text-sm'>{result.error}</div>
      </div>
    );
  }
  const s = result.stats!;
  return (
    <div className='flex flex-col gap-3 py-2'>
      <div className='text-emerald-600 font-medium'>import 완료</div>
      <div className='grid grid-cols-2 gap-2 text-sm'>
        <Stat label='신규 지원자' value={s.newApplicants} tone='text-emerald-600' />
        <Stat label='업데이트 지원자' value={s.updatedApplicants} />
        <Stat label='신규 기관' value={s.newOrganizations} tone='text-emerald-600' />
        <Stat label='신규 신청' value={s.newApplications} tone='text-emerald-600' />
        <Stat label='업데이트 신청' value={s.updatedApplications} />
        <Stat label='기록된 응답' value={s.answersWritten} />
        {s.skippedNoName > 0 && (
          <Stat label='이름 없음 스킵' value={s.skippedNoName} tone='text-amber-600' />
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className='border-input flex flex-col gap-0.5 rounded-md border px-3 py-2'>
      <span className='text-muted-foreground text-xs'>{label}</span>
      <span className={`text-base font-semibold tabular-nums ${tone ?? ''}`}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function Section({
  title,
  tone,
  children
}: {
  title: string;
  tone?: 'warning';
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-md border p-3 ${
        tone === 'warning' ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20' : ''
      }`}
    >
      <div className='text-xs font-medium'>{title}</div>
      {children}
    </div>
  );
}
