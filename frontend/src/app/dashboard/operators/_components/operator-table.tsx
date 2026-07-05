'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Icons } from '@/components/icons';

type Operator = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  title: string | null;
  instructorId: string | null;
  createdAt: string;
};

type InstructorOption = {
  id: string;
  name: string;
  kind: string;
  affiliation: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  developer: '개발자',
  head: '총괄',
  viewer: '운영자',
  assistant: '보조강사'
};

const ROLE_CLASS: Record<string, string> = {
  developer: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
  head: 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-300',
  viewer: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  assistant: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
};

export function OperatorTable() {
  const [ops, setOps] = useState<Operator[]>([]);
  const [instructors, setInstructors] = useState<InstructorOption[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addRole, setAddRole] = useState('viewer');
  const [addInstructorId, setAddInstructorId] = useState<string>('');
  const [editTarget, setEditTarget] = useState<Operator | null>(null);
  const [editRole, setEditRole] = useState<string>('viewer');
  const [editInstructorId, setEditInstructorId] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<Operator | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fetchOps = async () => {
    const res = await fetch('/api/operators');
    const data = await res.json();
    setOps(data);
  };

  const fetchInstructors = async () => {
    const res = await fetch('/api/instructors-list');
    if (!res.ok) return;
    const data = await res.json();
    setInstructors(data);
  };

  useEffect(() => { fetchOps(); fetchInstructors(); }, []);

  useEffect(() => {
    if (editTarget) {
      setEditRole(editTarget.role);
      setEditInstructorId(editTarget.instructorId ?? '');
    }
  }, [editTarget]);

  const onAdd = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await fetch('/api/operators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          email: formData.get('email'),
          password: formData.get('password'),
          role: addRole,
          title: formData.get('title'),
          instructorId: addRole === 'assistant' ? addInstructorId : null
        })
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error);
        return;
      }
      setAddOpen(false);
      setAddRole('viewer');
      setAddInstructorId('');
      fetchOps();
    });
  };

  const onEdit = (formData: FormData) => {
    if (!editTarget) return;
    setError(null);
    startTransition(async () => {
      const password = formData.get('password') as string;
      const res = await fetch('/api/operators', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editTarget.id,
          name: formData.get('name'),
          email: formData.get('email'),
          password: password || undefined,
          role: editRole,
          title: formData.get('title'),
          instructorId: editRole === 'assistant' ? editInstructorId : null
        })
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error);
        return;
      }
      setEditTarget(null);
      fetchOps();
    });
  };

  const onDelete = () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    startTransition(async () => {
      const res = await fetch('/api/operators', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: '삭제에 실패했습니다.' }));
        setDeleteError(data.error ?? '삭제에 실패했습니다.');
        return;
      }
      setDeleteTarget(null);
      fetchOps();
    });
  };

  return (
    <>
      <div className='mb-4 flex justify-end'>
        <Button onClick={() => {
          setError(null);
          setAddRole('viewer');
          setAddInstructorId('');
          setAddOpen(true);
        }}>
          + 운영자 추가
        </Button>
      </div>

      <div className='overflow-x-auto rounded-md border'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='bg-muted/50 border-b'>
              <th className='px-4 py-3 text-left font-medium'>이름</th>
              <th className='px-4 py-3 text-left font-medium'>이메일</th>
              <th className='px-4 py-3 text-left font-medium'>직급</th>
              <th className='px-4 py-3 text-left font-medium'>권한</th>
              <th className='w-20 px-4 py-3'></th>
            </tr>
          </thead>
          <tbody>
            {ops.map((op) => (
              <tr key={op.id} className='group border-b transition-colors last:border-0 hover:bg-muted/30'>
                <td className='px-4 py-3 font-medium'>{op.name}</td>
                <td className='text-muted-foreground px-4 py-3 font-mono text-xs'>{op.email ?? '-'}</td>
                <td className='text-muted-foreground px-4 py-3'>{op.title ?? '-'}</td>
                <td className='px-4 py-3'>
                  <Badge variant='outline' className={ROLE_CLASS[op.role] ?? ''}>
                    {ROLE_LABEL[op.role] ?? op.role}
                  </Badge>
                </td>
                <td className='px-4 py-3'>
                  <div className='flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-7 w-7'
                      onClick={() => { setError(null); setEditTarget(op); }}
                    >
                      <Icons.edit className='h-3.5 w-3.5' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='text-destructive hover:text-destructive h-7 w-7'
                      onClick={() => setDeleteTarget(op)}
                    >
                      <Icons.trash className='h-3.5 w-3.5' />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {ops.length === 0 && (
              <tr>
                <td colSpan={5} className='px-4 py-8 text-center text-muted-foreground'>
                  등록된 운영자가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 추가 Sheet */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>운영자 추가</SheetTitle>
          </SheetHeader>
          <form action={onAdd} className='grid gap-4 px-4 py-4'>
            <div className='grid gap-2'>
              <Label htmlFor='add-name'>이름 *</Label>
              <Input id='add-name' name='name' required placeholder='홍길동' />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='add-email'>이메일 *</Label>
              <Input id='add-email' name='email' type='email' required placeholder='user@example.com' autoComplete='off' />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='add-password'>임시 비밀번호 *</Label>
              <Input id='add-password' name='password' type='password' required minLength={8} placeholder='8자 이상' autoComplete='new-password' />
              <p className='text-xs text-muted-foreground'>본인에게 직접 전달하고, 첫 로그인 후 변경하도록 안내해주세요.</p>
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='add-title'>직급</Label>
              <Input id='add-title' name='title' placeholder='주임, 팀장 등' />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='add-role'>권한</Label>
              <Select value={addRole} onValueChange={setAddRole}>
                <SelectTrigger id='add-role'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='viewer'>운영자</SelectItem>
                  <SelectItem value='head'>총괄</SelectItem>
                  <SelectItem value='developer'>개발자</SelectItem>
                  <SelectItem value='assistant'>보조강사</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {addRole === 'assistant' && (
              <div className='bg-muted/40 grid gap-1 rounded-md border p-3'>
                <p className='text-xs text-muted-foreground'>
                  운영자 이름과 동일한 강사풀의 보조강사가 자동 연결됩니다. 연결된 강사가 세션·셀프스터디에 배정된 cohort만 사이드바에 표시되며, 모든 페이지가 읽기 전용입니다. 이름 매칭 실패 시 시야는 비어 있고, 강사가 나중에 등록되면 재저장 시 자동 반영됩니다.
                </p>
              </div>
            )}
            {error && <div className='text-destructive text-sm'>{error}</div>}
            <SheetFooter>
              <Button type='submit' disabled={pending}>{pending ? '추가 중...' : '추가'}</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* 수정 Sheet */}
      <Sheet open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>운영자 수정</SheetTitle>
          </SheetHeader>
          <form action={onEdit} className='grid gap-4 px-4 py-4'>
            <div className='grid gap-2'>
              <Label htmlFor='edit-name'>이름 *</Label>
              <Input id='edit-name' name='name' required defaultValue={editTarget?.name ?? ''} key={editTarget?.id + '-name'} />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='edit-email'>이메일</Label>
              <Input id='edit-email' name='email' type='email' defaultValue={editTarget?.email ?? ''} key={editTarget?.id + '-email'} autoComplete='off' />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='edit-password'>비밀번호 재설정</Label>
              <Input id='edit-password' name='password' type='password' minLength={8} placeholder='변경하지 않으려면 비워두세요' autoComplete='new-password' />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='edit-title'>직급</Label>
              <Input id='edit-title' name='title' defaultValue={editTarget?.title ?? ''} key={editTarget?.id + '-title'} />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='edit-role'>권한</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger id='edit-role'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='viewer'>운영자</SelectItem>
                  <SelectItem value='head'>총괄</SelectItem>
                  <SelectItem value='developer'>개발자</SelectItem>
                  <SelectItem value='assistant'>보조강사</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editRole === 'assistant' && (
              <div className='bg-muted/40 grid gap-1 rounded-md border p-3'>
                <p className='text-xs text-muted-foreground'>
                  운영자 이름과 동일한 강사풀의 보조강사가 자동 연결됩니다. 연결된 강사가 세션·셀프스터디에 배정된 cohort만 사이드바에 표시되며, 모든 페이지가 읽기 전용입니다. 이름 매칭 실패 시 시야는 비어 있고, 강사가 나중에 등록되면 재저장 시 자동 반영됩니다.
                </p>
              </div>
            )}
            {error && <div className='text-destructive text-sm'>{error}</div>}
            <SheetFooter>
              <Button type='submit' disabled={pending}>{pending ? '저장 중...' : '저장'}</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* 삭제 확인 */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>운영자 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong>을(를) 삭제하시겠습니까? 인증 계정도 함께 삭제되어 로그인할 수 없게 됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <div className='text-destructive px-1 text-sm'>{deleteError}</div>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              disabled={pending}
              className='bg-destructive hover:bg-destructive/90 text-white'
            >
              {pending ? '삭제 중...' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
