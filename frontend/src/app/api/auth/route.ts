import { createClient } from '@/lib/supabase/server';
import { getOperator } from '@/lib/auth';
import { NextResponse } from 'next/server';

/**
 * 로그인 직후 운영자 정보 조회.
 * /lock에서 signInWithPassword 성공 후 호출. operators 테이블에 매핑된 row가 없으면 401.
 */
export async function POST() {
  const operator = await getOperator();
  if (!operator) {
    return NextResponse.json(
      { error: '등록된 운영자가 아닙니다. 관리자에게 문의해주세요.' },
      { status: 401 }
    );
  }
  return NextResponse.json(operator);
}

/** 로그아웃 — Supabase 세션 종료 */
export async function DELETE() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
