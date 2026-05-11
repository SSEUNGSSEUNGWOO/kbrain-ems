import { createAdminClient } from '@/lib/supabase/server';
import { isDeveloper } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = createAdminClient();
  const [operatorsResult, usersResult] = await Promise.all([
    supabase
      .from('operators')
      .select('id, name, role, title, auth_user_id, created_at')
      .order('created_at', { ascending: true }),
    supabase.auth.admin.listUsers({ perPage: 1000 })
  ]);

  if (operatorsResult.error) {
    return NextResponse.json({ error: operatorsResult.error.message }, { status: 500 });
  }

  const emailMap = new Map(
    (usersResult.data?.users ?? []).map((u) => [u.id, u.email ?? null])
  );

  const rows = (operatorsResult.data ?? []).map((op) => ({
    id: op.id,
    name: op.name,
    role: op.role,
    title: op.title,
    email: op.auth_user_id ? emailMap.get(op.auth_user_id) ?? null : null,
    createdAt: op.created_at
  }));

  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  if (!(await isDeveloper())) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const { name, email, password, role, title } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: '이름을 입력해주세요.' }, { status: 400 });
  }
  if (!email?.trim()) {
    return NextResponse.json({ error: '이메일을 입력해주세요.' }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 1. Auth 계정 생성
  const { data: created, error: authError } = await supabase.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true
  });

  if (authError || !created.user) {
    const msg = authError?.message?.includes('already')
      ? '이미 등록된 이메일입니다.'
      : authError?.message ?? '인증 계정 생성에 실패했습니다.';
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  // 2. operators row 추가 — 실패 시 Auth 계정 rollback
  const { data: row, error: opError } = await supabase
    .from('operators')
    .insert({
      name: name.trim(),
      role: role || 'operator',
      title: title || null,
      auth_user_id: created.user.id
    })
    .select()
    .single();

  if (opError) {
    await supabase.auth.admin.deleteUser(created.user.id);
    const msg = opError.message.includes('duplicate')
      ? '이미 등록된 이름입니다.'
      : opError.message;
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  return NextResponse.json({ ...row, email });
}

export async function PUT(req: Request) {
  if (!(await isDeveloper())) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const { id, name, email, password, role, title } = await req.json();
  if (!id || !name?.trim()) {
    return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 1. operators row 업데이트
  const { data: row, error } = await supabase
    .from('operators')
    .update({
      name: name.trim(),
      role: role || 'operator',
      title: title || null
    })
    .eq('id', id)
    .select('auth_user_id')
    .single();

  if (error) {
    const msg = error.message.includes('duplicate')
      ? '이미 등록된 이름입니다.'
      : error.message;
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  // 2. Auth 계정 정보 업데이트 (이메일·비번)
  if (row?.auth_user_id) {
    const updates: { email?: string; password?: string } = {};
    if (email?.trim()) updates.email = email.trim();
    if (password) {
      if (password.length < 8) {
        return NextResponse.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 });
      }
      updates.password = password;
    }
    if (Object.keys(updates).length > 0) {
      const { error: authError } = await supabase.auth.admin.updateUserById(
        row.auth_user_id,
        updates
      );
      if (authError) {
        const msg = authError.message?.includes('already')
          ? '이미 등록된 이메일입니다.'
          : authError.message;
        return NextResponse.json({ error: msg }, { status: 409 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await isDeveloper())) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: 'ID가 필요합니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // operators row → auth.users 순서로 삭제 (FK는 SET NULL이라 순서 무관하지만 명시적으로)
  const { data: row } = await supabase
    .from('operators')
    .select('auth_user_id')
    .eq('id', id)
    .single();

  const { error } = await supabase.from('operators').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (row?.auth_user_id) {
    await supabase.auth.admin.deleteUser(row.auth_user_id);
  }

  return NextResponse.json({ ok: true });
}
