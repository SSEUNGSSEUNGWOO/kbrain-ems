import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { computeCohortStage } from '@/lib/cohort-stage';

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('cohorts')
    .select(
      'id, name, started_at, ended_at, application_start_at, application_end_at'
    )
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const enriched = (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    stage: computeCohortStage(c)
  }));

  return NextResponse.json(enriched);
}
