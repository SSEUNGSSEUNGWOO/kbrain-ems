'use server';

import { db } from '@/lib/db';
import { operators } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { name } = await req.json();
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: '이름을 입력해주세요.' }, { status: 400 });
  }

  const trimmed = name.trim();
  const rows = await db
    .select({ id: operators.id, name: operators.name, role: operators.role, title: operators.title })
    .from(operators)
    .where(eq(operators.name, trimmed))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ error: '등록된 사용자가 아닙니다.' }, { status: 401 });
  }

  const operator = rows[0];
  const cookieStore = await cookies();

  cookieStore.set('operator_name', operator.name, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });
  cookieStore.set('operator_role', operator.role, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });
  cookieStore.set('operator_title', operator.title ?? '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });

  return NextResponse.json({ ok: true, name: operator.name, role: operator.role, title: operator.title });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set('operator_name', '', { maxAge: 0, path: '/' });
  cookieStore.set('operator_role', '', { maxAge: 0, path: '/' });
  cookieStore.set('operator_title', '', { maxAge: 0, path: '/' });
  return NextResponse.json({ ok: true });
}
