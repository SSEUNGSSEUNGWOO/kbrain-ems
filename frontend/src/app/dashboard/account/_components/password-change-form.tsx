'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

export function PasswordChangeForm({ email }: { email: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (next.length < 8) {
      setError('새 비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (next !== confirm) {
      setError('새 비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    if (next === current) {
      setError('새 비밀번호가 현재 비밀번호와 같습니다.');
      return;
    }

    startTransition(async () => {
      const supabase = createClient();

      // 현재 비밀번호 재인증
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: current
      });
      if (signInError) {
        setError('현재 비밀번호가 올바르지 않습니다.');
        return;
      }

      // 비밀번호 변경
      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    });
  };

  return (
    <form onSubmit={handleSubmit} className='grid max-w-md gap-3'>
      <div className='grid gap-1.5'>
        <Label htmlFor='current'>현재 비밀번호</Label>
        <Input
          id='current'
          type='password'
          value={current}
          onChange={(e) => { setCurrent(e.target.value); setError(''); setSuccess(false); }}
          required
          autoComplete='current-password'
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor='next'>새 비밀번호 (8자 이상)</Label>
        <Input
          id='next'
          type='password'
          value={next}
          onChange={(e) => { setNext(e.target.value); setError(''); setSuccess(false); }}
          required
          minLength={8}
          autoComplete='new-password'
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor='confirm'>새 비밀번호 확인</Label>
        <Input
          id='confirm'
          type='password'
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setError(''); setSuccess(false); }}
          required
          minLength={8}
          autoComplete='new-password'
        />
      </div>

      {error && <div className='text-destructive text-sm'>{error}</div>}
      {success && <div className='text-sm text-green-600'>비밀번호가 변경되었습니다.</div>}

      <div className='mt-2'>
        <Button type='submit' disabled={pending || !current || !next || !confirm}>
          {pending ? '변경 중...' : '변경'}
        </Button>
      </div>
    </form>
  );
}
