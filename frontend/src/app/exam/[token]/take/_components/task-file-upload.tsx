'use client';

import { useRef, useState } from 'react';
import { uploadTaskFile, deleteTaskFile } from '../../_actions';

export type UploadedFile = {
  name: string;
  path: string;
  size: number;
  url: string;
};

const MAX_MB = 20;

export function TaskFileUpload({
  token,
  questionId,
  files,
  onServerFiles,
  disabled = false,
  onExpired
}: {
  token: string;
  questionId: string;
  files: UploadedFile[];
  // 서버가 반환한 최종 파일 목록으로 상태 교체 (append/remove 성공 시).
  // 클라이언트가 직접 배열을 만들지 않으므로 상태 divergence 원천 차단.
  onServerFiles: (next: UploadedFile[]) => void;
  disabled?: boolean;
  onExpired?: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // 부분 실패한 파일들 (재시도 대상)
  const [failed, setFailed] = useState<{ file: File; reason: string }[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 서버 응답의 code나 error 문구로 "재시도 무의미"를 판단.
  // 재시도해도 결과가 바뀌지 않는 에러는 즉시 실패 처리하고 원본 메시지 노출.
  const isNonRetryable = (res: { error?: string; code?: string }) => {
    if (res.code === 'expired' || res.code === 'no_session' || res.code === 'submitted') return true;
    if (!res.error) return false;
    // 크기 초과·경로 오류·문항 정보 누락 등 응시자 액션으로 해소되지 않는 에러
    return (
      res.error.includes('크기') ||
      res.error.includes('문항 정보') ||
      res.error.includes('경로가')
    );
  };

  // 단일 파일 업로드 — 서버가 원자적 append 후 전체 files 배열을 리턴.
  // 네트워크 장애·타임아웃 대비 3회 재시도 (단, 응시자 액션으로 안 풀리는 에러는 즉시 실패).
  const uploadOne = async (
    file: File
  ): Promise<{ ok: true; files: UploadedFile[] } | { ok: false; reason: string; code?: string }> => {
    if (file.size > MAX_MB * 1024 * 1024) {
      return { ok: false, reason: `파일 크기가 ${MAX_MB}MB를 초과` };
    }
    let lastError = '네트워크 오류 (3회 실패)';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('questionId', questionId);
        const res = await uploadTaskFile(token, fd);
        if (res.files) return { ok: true, files: res.files };
        if (isNonRetryable(res)) {
          return { ok: false, reason: res.error ?? '업로드 거부됨', code: res.code };
        }
        if (res.error) lastError = res.error;
      } catch (e) {
        lastError = e instanceof Error ? e.message : '네트워크 오류';
      }
      if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    return { ok: false, reason: lastError };
  };

  const handleFiles = async (fs: FileList | File[]) => {
    if (disabled) return;
    if (busy) {
      setError('업로드가 진행 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    setError(null);
    setFailed([]);
    const list = Array.from(fs);
    setBusy(true);
    setPendingCount(list.length);

    // 병렬 실행 — 서버가 Postgres RPC의 jsonb || 연산자로 원자적 append하므로
    // 여러 요청이 겹쳐도 race 없음. 5개 파일 순차 15~25초 → 병렬 3~5초로 단축.
    // 낙관적 UI는 각 요청 완료 순간 반영 (마지막 완료의 files 배열이 서버 상태).
    let latestServerFiles: UploadedFile[] | null = null;
    const newFailed: { file: File; reason: string }[] = [];
    let expiredHit = false;

    const results = await Promise.all(
      list.map(async (f) => {
        const res = await uploadOne(f);
        setPendingCount((n) => n - 1);
        return { file: f, res };
      })
    );

    // 결과 정리 (완료 순서 무관)
    for (const { file, res } of results) {
      if (res.ok) {
        latestServerFiles = res.files;
      } else if (res.code === 'expired') {
        expiredHit = true;
      } else {
        newFailed.push({ file, reason: res.reason });
      }
    }

    if (latestServerFiles) onServerFiles(latestServerFiles);
    if (expiredHit) {
      onExpired?.();
      setError('작업형 시간이 만료되어 업로드가 거부되었습니다.');
    } else if (newFailed.length > 0) {
      setFailed(newFailed);
      setError(`${newFailed.length}개 파일이 업로드 실패했습니다. 아래에서 재시도해 주세요.`);
    }
    setBusy(false);
    setPendingCount(0);
  };

  const retryFailed = async () => {
    if (failed.length === 0) return;
    const retryList = failed.map((x) => x.file);
    await handleFiles(retryList);
  };

  const removeAt = async (idx: number) => {
    if (disabled) return;
    const target = files[idx];
    // 서버에서 원자적으로 제거 + 새 files 목록 리턴
    const res = await deleteTaskFile(token, questionId, target.path);
    if (res.files) {
      onServerFiles(res.files);
    } else if (res.error) {
      if (res.code === 'expired') onExpired?.();
      setError(`삭제 실패: ${res.error}`);
    }
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => {
          if (disabled) return;
          inputRef.current?.click();
        }}
        className={`rounded-xl border-2 border-dashed p-6 text-center transition-all ${
          disabled
            ? 'cursor-not-allowed border-slate-200 bg-slate-100/60 opacity-60'
            : dragOver
              ? 'cursor-pointer border-blue-500 bg-blue-50'
              : 'cursor-pointer border-slate-300 bg-slate-50/60 hover:bg-slate-50 hover:border-slate-400'
        }`}
      >
        <input
          ref={inputRef}
          type='file'
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div className='mx-auto mb-2 h-11 w-11 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xl'>
          ⬆
        </div>
        <div className='text-sm font-semibold text-slate-700'>
          {disabled
            ? '남은 시간이 부족해 업로드가 잠겼습니다'
            : busy
              ? pendingCount > 0
                ? `업로드 중… (${pendingCount}개 남음)`
                : '업로드 중…'
              : '파일 끌어놓기 또는 클릭해서 선택'}
        </div>
        <div className='text-xs text-slate-500 mt-1'>
          코드·캡처 이미지·zip 등 여러 개 업로드 가능 · 최대 {MAX_MB}MB / 파일
        </div>
      </div>

      {error && (
        <div className='mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 space-y-2'>
          <div className='font-semibold'>⚠ {error}</div>
          {failed.length > 0 && (
            <>
              <ul className='space-y-1'>
                {failed.map((x, i) => (
                  <li key={i} className='flex items-center justify-between gap-2'>
                    <span className='truncate' title={x.file.name}>
                      · {x.file.name}
                    </span>
                    <span className='text-rose-500 text-[10px] flex-shrink-0'>{x.reason}</span>
                  </li>
                ))}
              </ul>
              <button
                type='button'
                onClick={() => void retryFailed()}
                disabled={busy}
                className='w-full rounded-md bg-rose-600 hover:bg-rose-500 text-white font-semibold py-1.5 text-xs disabled:opacity-50'
              >
                {busy ? '재시도 중…' : `${failed.length}개 파일 다시 업로드`}
              </button>
            </>
          )}
        </div>
      )}

      {files.length > 0 && (
        <ul className='mt-3 space-y-1.5'>
          {files.map((f, i) => (
            <li
              key={f.path}
              className='flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2'
            >
              <span className='flex-shrink-0 text-lg'>📄</span>
              <div className='flex-1 min-w-0'>
                <div className='text-sm text-slate-800 truncate' title={f.name}>
                  {f.name}
                </div>
                <div className='text-[11px] text-slate-500'>
                  {(f.size / 1024).toFixed(1)} KB
                </div>
              </div>
              <button
                type='button'
                onClick={() => void removeAt(i)}
                className='flex-shrink-0 text-xs text-rose-600 hover:text-rose-700 font-medium'
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
