import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ title: null });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('sessions')
    .select('session_date, title')
    .eq('id', id)
    .limit(1);

  if (error) {
    return NextResponse.json({ title: null });
  }

  const row = data?.[0];
  if (!row) return NextResponse.json({ title: null });

  return NextResponse.json({ title: row.title ?? row.session_date });
}
