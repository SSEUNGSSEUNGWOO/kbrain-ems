'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function LockPage() {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [welcome, setWelcome] = useState<{ name: string; title: string } | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? '입장에 실패했습니다.');
        setLoading(false);
        return;
      }

      // 환영 애니메이션 시작
      setWelcome({ name: data.name, title: data.title ?? '' });

      // 2.5초 후 대시보드로 이동
      setTimeout(() => {
        router.push('/dashboard/overview');
      }, 2500);
    } catch {
      setError('서버에 연결할 수 없습니다.');
      setLoading(false);
    }
  };

  // 환영 화면
  if (welcome) {
    return (
      <div className='fixed inset-0 z-50 flex items-center justify-center bg-white dark:bg-slate-950'>
        <div className='flex flex-col items-center gap-3'>
          {/* 이름 */}
          <div
            className='text-3xl font-bold text-foreground'
            style={{
              animation: 'welcomeFadeUp 0.6s ease-out forwards',
              opacity: 0
            }}
          >
            {welcome.name}
          </div>

          {/* 직급 */}
          <div
            className='text-lg font-medium text-blue-600 dark:text-blue-400'
            style={{
              animation: 'welcomeFadeUp 0.6s ease-out 0.4s forwards',
              opacity: 0
            }}
          >
            {welcome.title}님
          </div>

          {/* 인사 */}
          <div
            className='mt-2 text-base text-muted-foreground'
            style={{
              animation: 'welcomeFadeUp 0.6s ease-out 0.8s forwards',
              opacity: 0
            }}
          >
            안녕하세요, 오늘도 좋은 하루 되세요
          </div>

          {/* 로딩 바 */}
          <div
            className='mt-6 h-0.5 w-32 overflow-hidden rounded-full bg-muted'
            style={{
              animation: 'welcomeFadeUp 0.4s ease-out 1.2s forwards',
              opacity: 0
            }}
          >
            <div
              className='h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500'
              style={{
                animation: 'welcomeProgress 1.2s ease-in-out 1.3s forwards',
                width: '0%'
              }}
            />
          </div>
        </div>

        <style>{`
          @keyframes welcomeFadeUp {
            from {
              opacity: 0;
              transform: translateY(16px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes welcomeProgress {
            from { width: 0%; }
            to { width: 100%; }
          }
        `}</style>
      </div>
    );
  }

  // 입장 폼
  return (
    <div className='flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4 dark:from-slate-950 dark:to-blue-950/30'>
      <div className='w-full max-w-sm'>
        {/* 상단 악센트 */}
        <div className='mx-auto mb-6 h-1 w-16 rounded-full bg-gradient-to-r from-blue-500 to-violet-500' />

        <div className='rounded-2xl border bg-white/80 px-8 py-10 shadow-lg backdrop-blur dark:bg-slate-900/80'>
          {/* 로고 */}
          <div className='mb-8 flex flex-col items-center gap-2'>
            <Image
              src='/k-brain-logo.png'
              alt='K-Brain'
              width={3233}
              height={1326}
              className='h-8 w-auto dark:brightness-0 dark:invert'
            />
            <span className='text-[10.5px] font-semibold uppercase tracking-[0.15em] text-muted-foreground'>
              Education Management
            </span>
          </div>

          {/* 안내 */}
          <div className='mb-6 text-center'>
            <h1 className='text-lg font-semibold text-foreground'>입장</h1>
            <p className='mt-1 text-sm text-muted-foreground'>이름을 입력해주세요</p>
          </div>

          {/* 입력 폼 */}
          <form onSubmit={handleSubmit} className='space-y-4'>
            <div>
              <input
                type='text'
                value={name}
                onChange={(e) => { setName(e.target.value); setError(''); }}
                placeholder='홍길동'
                autoFocus
                className='w-full rounded-lg border bg-background px-4 py-3 text-center text-base outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
              />
            </div>

            {error && (
              <div className='rounded-lg bg-red-50 px-4 py-2.5 text-center text-sm font-medium text-red-600 dark:bg-red-950/40 dark:text-red-400'>
                {error}
              </div>
            )}

            <button
              type='submit'
              disabled={loading || !name.trim()}
              className='w-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-sm font-semibold text-white transition-all hover:from-blue-700 hover:to-blue-800 disabled:cursor-not-allowed disabled:opacity-50 dark:from-blue-500 dark:to-blue-600'
            >
              {loading ? '확인 중...' : '입장하기'}
            </button>
          </form>
        </div>

        <p className='mt-4 text-center text-xs text-muted-foreground'>
          등록된 운영자만 입장할 수 있습니다
        </p>
      </div>
    </div>
  );
}
