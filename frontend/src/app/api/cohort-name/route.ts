import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ name: null });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('cohorts')
    .select('name')
    .eq('id', id)
    .limit(1);

  if (error) {
    return NextResponse.json({ name: null });
  }

  return NextResponse.json({ name: data?.[0]?.name ?? null });
}
