'use client';

import { useState, useTransition } from 'react';
import { enterExamViaShare } from '../_actions';

export function ShareEntryForm({ code }: { code: string }) {
  const [name, setName] = useState('');
  const [phoneLast4, setPhoneLast4] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await enterExamViaShare({ code, name, phoneLast4 });
      if (res?.error) setError(res.error);
      // 성공 시 서버 액션 내부 redirect
    });
  };

  return (
    <form onSubmit={onSubmit} className='rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4'>
      <div>
        <label htmlFor='name' className='block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5'>
          이름
        </label>
        <input
          id='name'
          type='text'
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete='off'
          className='w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all'
          placeholder='홍길동'
        />
      </div>

      <div>
        <label htmlFor='phone' className='block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5'>
          전화번호 뒷 4자리
        </label>
        <input
          id='phone'
          type='tel'
          inputMode='numeric'
          pattern='[0-9]*'
          maxLength={4}
          value={phoneLast4}
          onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
          required
          className='w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-base font-mono tracking-widest text-center focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all'
          placeholder='0000'
        />
      </div>

      {error && (
        <div className='rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>
          {error}
        </div>
      )}

      <button
        type='submit'
        disabled={pending || !name.trim() || phoneLast4.length !== 4}
        className='w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 shadow-sm transition-all'
      >
        {pending ? '확인 중...' : '응시 시작하기'}
      </button>
    </form>
  );
}
