import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { computeCohortStage } from '@/lib/cohort-stage';
import { sortCohortsByPreference } from '@/lib/cohort-sort';
import { getOperator } from '@/lib/auth';

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('cohorts')
    .select(
      'id, name, category, started_at, ended_at, application_start_at, application_end_at, created_at'
    )
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const operator = await getOperator();
  const sorted = sortCohortsByPreference(data ?? [], operator?.cohort_order ?? []);

  const enriched = sorted.map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category,
    stage: computeCohortStage(c)
  }));

  return NextResponse.json(enriched);
}
