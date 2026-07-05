import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isDeveloper } from '@/lib/auth';

export async function GET() {
  if (!(await isDeveloper())) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('instructors')
    .select('id, name, kind, affiliation')
    .order('kind', { ascending: false }) // sub 먼저, main 나중 (보조강사 우선 노출)
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
