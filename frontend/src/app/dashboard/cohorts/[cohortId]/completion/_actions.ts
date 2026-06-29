'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';

export async function saveMinAttendance(
  cohortId: string,
  value: number | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized =
    value === null || Number.isNaN(value) || value <= 0
      ? null
      : Math.floor(value);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('cohorts')
    .update({ min_attendance: normalized })
    .eq('id', cohortId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/dashboard/cohorts/${cohortId}/completion`);
  return { ok: true };
}
