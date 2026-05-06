import { db } from '@/lib/db';
import { operators } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

async function checkDeveloper() {
  const cookieStore = await cookies();
  return cookieStore.get('operator_role')?.value === 'developer';
}

export async function GET() {
  const all = await db
    .select({ id: operators.id, name: operators.name, role: operators.role, title: operators.title, createdAt: operators.createdAt })
    .from(operators);
  return NextResponse.json(all);
}

export async function POST(req: Request) {
  if (!(await checkDeveloper())) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const { name, role, title } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: '이름을 입력해주세요.' }, { status: 400 });
  }

  try {
    const [row] = await db.insert(operators).values({
      name: name.trim(),
      role: role || 'operator',
      title: title || null
    }).returning();
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: '이미 등록된 이름입니다.' }, { status: 409 });
  }
}

export async function PUT(req: Request) {
  if (!(await checkDeveloper())) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const { id, name, role, title } = await req.json();
  if (!id || !name?.trim()) {
    return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 });
  }

  try {
    await db.update(operators).set({
      name: name.trim(),
      role: role || 'operator',
      title: title || null
    }).where(eq(operators.id, id));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: '이미 등록된 이름입니다.' }, { status: 409 });
  }
}

export async function DELETE(req: Request) {
  if (!(await checkDeveloper())) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: 'ID가 필요합니다.' }, { status: 400 });
  }

  await db.delete(operators).where(eq(operators.id, id));
  return NextResponse.json({ ok: true });
}
