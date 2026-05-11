'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';

export default function LockPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [welcome, setWelcome] = useState<{ name: string; title: string } | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (signInError) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      setLoading(false);
      return;
    }

    // 로그인 성공 → 운영자 정보 조회
    const res = await fetch('/api/auth', { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? '운영자 정보를 찾을 수 없습니다.');
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }
    const operator = await res.json();

    setWelcome({ name: operator.name, title: operator.title ?? '' });
    setTimeout(() => {
      router.push('/dashboard/overview');
      router.refresh();
    }, 2500);
  };

  // 환영 화면
  if (welcome) {
    return (
      <div className='fixed inset-0 z-50 flex items-center justify-center bg-white'>
        <div className='flex flex-col items-center gap-3'>
          <div
            className='text-3xl font-bold text-slate-900'
            style={{ animation: 'welcomeFadeUp 0.6s ease-out forwards', opacity: 0 }}
          >
            {welcome.name}
          </div>
          <div
            className='text-lg font-medium text-blue-600'
            style={{ animation: 'welcomeFadeUp 0.6s ease-out 0.4s forwards', opacity: 0 }}
          >
            {welcome.title}님
          </div>
          <div
            className='mt-2 text-base text-slate-500'
            style={{ animation: 'welcomeFadeUp 0.6s ease-out 0.8s forwards', opacity: 0 }}
          >
            안녕하세요, 오늘도 좋은 하루 되세요
          </div>
          <div
            className='mt-6 h-0.5 w-32 overflow-hidden rounded-full bg-muted'
            style={{ animation: 'welcomeFadeUp 0.4s ease-out 1.2s forwards', opacity: 0 }}
          >
            <div
              className='h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500'
              style={{ animation: 'welcomeProgress 1.2s ease-in-out 1.3s forwards', width: '0%' }}
            />
          </div>
        </div>
        <style>{`
          @keyframes welcomeFadeUp {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes welcomeProgress {
            from { width: 0%; }
            to { width: 100%; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className='flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4'>
      <div className='w-full max-w-sm'>
        <div className='mx-auto mb-6 h-1 w-16 rounded-full bg-gradient-to-r from-blue-500 to-violet-500' />

        <div className='rounded-2xl border bg-white/80 px-8 py-10 shadow-lg backdrop-blur'>
          <div className='mb-8 flex flex-col items-center gap-2'>
            <Image
              src='/k-brain-logo.png'
              alt='K-Brain'
              width={3233}
              height={1326}
              className='h-8 w-auto'
            />
            <span className='text-[10.5px] font-semibold uppercase tracking-[0.15em] text-slate-400'>
              Education Management System
            </span>
          </div>

          <div className='mb-6 text-center'>
            <h1 className='text-lg font-semibold text-slate-900'>운영자 로그인</h1>
            <p className='mt-1 text-sm text-slate-500'>이메일과 비밀번호를 입력해주세요</p>
          </div>

          <form onSubmit={handleSubmit} className='space-y-3'>
            <div>
              <input
                type='email'
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder='이메일'
                autoComplete='email'
                className='w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
              />
            </div>

            <div>
              <input
                type='password'
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder='비밀번호'
                autoComplete='current-password'
                className='w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
              />
            </div>

            {error && (
              <div className='rounded-lg bg-red-50 px-4 py-2.5 text-center text-sm font-medium text-red-600'>
                {error}
              </div>
            )}

            <button
              type='submit'
              disabled={loading || !email.trim() || !password}
              className='w-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-sm font-semibold text-white transition-all hover:from-blue-700 hover:to-blue-800 disabled:cursor-not-allowed disabled:opacity-50'
            >
              {loading ? '확인 중...' : '입장하기'}
            </button>
          </form>
        </div>

        <p className='mt-4 text-center text-xs text-slate-400'>
          등록된 운영자만 입장할 수 있습니다
        </p>
      </div>
    </div>
  );
}
