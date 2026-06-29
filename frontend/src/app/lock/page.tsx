'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/brand/logo';

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
      <div className='fixed inset-0 z-50 flex items-center justify-center bg-background'>
        <div className='flex flex-col items-center gap-3'>
          <div
            className='text-foreground text-3xl font-bold'
            style={{ animation: 'welcomeFadeUp 0.6s ease-out forwards', opacity: 0 }}
          >
            {welcome.name}
          </div>
          <div
            className='text-primary text-lg font-medium'
            style={{ animation: 'welcomeFadeUp 0.6s ease-out 0.4s forwards', opacity: 0 }}
          >
            {welcome.title}님
          </div>
          <div
            className='text-muted-foreground mt-2 text-base'
            style={{ animation: 'welcomeFadeUp 0.6s ease-out 0.8s forwards', opacity: 0 }}
          >
            안녕하세요, 오늘도 좋은 하루 되세요
          </div>
          <div
            className='bg-muted mt-6 h-0.5 w-32 overflow-hidden rounded-full'
            style={{ animation: 'welcomeFadeUp 0.4s ease-out 1.2s forwards', opacity: 0 }}
          >
            <div
              className='bg-primary h-full rounded-full'
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
    <div className='bg-background flex min-h-screen items-center justify-center px-4'>
      <div className='w-full max-w-sm'>
        <div className='bg-primary mx-auto mb-6 h-1 w-16 rounded-full' />

        <div className='border-border bg-card rounded-2xl border px-8 py-10 shadow-lg'>
          <div className='mb-8 flex flex-col items-center gap-2'>
            <Logo variant='color' size={36} withWordmark endorsed />
          </div>

          <div className='mb-6 text-center'>
            <h1 className='text-foreground text-lg font-semibold'>운영자 로그인</h1>
            <p className='text-muted-foreground mt-1 text-sm'>이메일과 비밀번호를 입력해주세요</p>
          </div>

          <form onSubmit={handleSubmit} className='space-y-3'>
            <div>
              <input
                type='email'
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder='이메일'
                autoComplete='email'
                className='border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/20 w-full rounded-lg border px-4 py-3 text-base outline-none transition-colors focus:ring-2'
              />
            </div>

            <div>
              <input
                type='password'
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder='비밀번호'
                autoComplete='current-password'
                className='border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/20 w-full rounded-lg border px-4 py-3 text-base outline-none transition-colors focus:ring-2'
              />
            </div>

            {error && (
              <div className='bg-destructive/10 text-destructive rounded-lg px-4 py-2.5 text-center text-sm font-medium'>
                {error}
              </div>
            )}

            <button
              type='submit'
              disabled={loading || !email.trim() || !password}
              className='bg-primary text-primary-foreground hover:bg-primary/90 w-full rounded-lg px-4 py-3 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50'
            >
              {loading ? '확인 중...' : '입장하기'}
            </button>
          </form>
        </div>

        <p className='text-muted-foreground mt-4 text-center text-xs'>
          등록된 운영자만 입장할 수 있습니다
        </p>
      </div>
    </div>
  );
}
