import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cohorts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ name: null });

  const rows = await db
    .select({ name: cohorts.name })
    .from(cohorts)
    .where(eq(cohorts.id, id))
    .limit(1);

  return NextResponse.json({ name: rows[0]?.name ?? null });
}
