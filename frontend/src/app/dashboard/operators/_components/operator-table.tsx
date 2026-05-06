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
  role: string;
  title: string | null;
  createdAt: string;
};

const ROLE_LABEL: Record<string, string> = {
  developer: '개발자',
  operator: '운영자'
};

const ROLE_CLASS: Record<string, string> = {
  developer: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
  operator: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
};

export function OperatorTable() {
  const [ops, setOps] = useState<Operator[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Operator | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Operator | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fetchOps = async () => {
    const res = await fetch('/api/operators');
    const data = await res.json();
    setOps(data);
  };

  useEffect(() => { fetchOps(); }, []);

  const onAdd = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await fetch('/api/operators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          role: formData.get('role'),
          title: formData.get('title')
        })
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error);
        return;
      }
      setAddOpen(false);
      fetchOps();
    });
  };

  const onEdit = (formData: FormData) => {
    if (!editTarget) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch('/api/operators', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editTarget.id,
          name: formData.get('name'),
          role: formData.get('role'),
          title: formData.get('title')
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
    startTransition(async () => {
      await fetch('/api/operators', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id })
      });
      setDeleteTarget(null);
      fetchOps();
    });
  };

  return (
    <>
      <div className='mb-4 flex justify-end'>
        <Button onClick={() => { setError(null); setAddOpen(true); }}>
          + 운영자 추가
        </Button>
      </div>

      <div className='overflow-x-auto rounded-md border'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='bg-muted/50 border-b'>
              <th className='px-4 py-3 text-left font-medium'>이름</th>
              <th className='px-4 py-3 text-left font-medium'>직급</th>
              <th className='px-4 py-3 text-left font-medium'>권한</th>
              <th className='w-20 px-4 py-3'></th>
            </tr>
          </thead>
          <tbody>
            {ops.map((op) => (
              <tr key={op.id} className='group border-b transition-colors last:border-0 hover:bg-muted/30'>
                <td className='px-4 py-3 font-medium'>{op.name}</td>
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
                <td colSpan={4} className='px-4 py-8 text-center text-muted-foreground'>
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
              <Label htmlFor='add-title'>직급</Label>
              <Input id='add-title' name='title' placeholder='주임, 팀장 등' />
            </div>
            <div className='grid gap-2'>
              <Label>권한</Label>
              <Select name='role' defaultValue='operator'>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='operator'>운영자</SelectItem>
                  <SelectItem value='developer'>개발자</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
              <Label htmlFor='edit-title'>직급</Label>
              <Input id='edit-title' name='title' defaultValue={editTarget?.title ?? ''} key={editTarget?.id + '-title'} />
            </div>
            <div className='grid gap-2'>
              <Label>권한</Label>
              <Select name='role' defaultValue={editTarget?.role ?? 'operator'} key={editTarget?.id + '-role'}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='operator'>운영자</SelectItem>
                  <SelectItem value='developer'>개발자</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <div className='text-destructive text-sm'>{error}</div>}
            <SheetFooter>
              <Button type='submit' disabled={pending}>{pending ? '저장 중...' : '저장'}</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* 삭제 확인 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>운영자 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong>을(를) 삭제하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
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
