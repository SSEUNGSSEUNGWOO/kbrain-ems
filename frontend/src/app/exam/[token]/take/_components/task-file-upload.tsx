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
  files,
  onChange
}: {
  token: string;
  files: UploadedFile[];
  onChange: (next: UploadedFile[]) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const uploadOne = async (file: File): Promise<UploadedFile | null> => {
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`${file.name}: 파일 크기가 ${MAX_MB}MB를 초과합니다.`);
      return null;
    }
    const fd = new FormData();
    fd.append('file', file);
    const res = await uploadTaskFile(token, fd);
    if (res.error) {
      setError(`${file.name}: ${res.error}`);
      return null;
    }
    return res.file ?? null;
  };

  const handleFiles = async (fs: FileList | File[]) => {
    setError(null);
    setBusy(true);
    const list = Array.from(fs);
    const uploaded: UploadedFile[] = [];
    for (const f of list) {
      const res = await uploadOne(f);
      if (res) uploaded.push(res);
    }
    if (uploaded.length > 0) onChange([...files, ...uploaded]);
    setBusy(false);
  };

  const removeAt = async (idx: number) => {
    const target = files[idx];
    // 서버에서도 파일 제거 (실패해도 UI에서는 지움)
    void deleteTaskFile(token, target.path);
    const next = files.filter((_, i) => i !== idx);
    onChange(next);
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all ${
          dragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-slate-300 bg-slate-50/60 hover:bg-slate-50 hover:border-slate-400'
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
          {busy ? '업로드 중…' : '파일 끌어놓기 또는 클릭해서 선택'}
        </div>
        <div className='text-xs text-slate-500 mt-1'>
          코드·캡처 이미지·zip 등 여러 개 업로드 가능 · 최대 {MAX_MB}MB / 파일
        </div>
      </div>

      {error && (
        <div className='mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700'>
          {error}
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
