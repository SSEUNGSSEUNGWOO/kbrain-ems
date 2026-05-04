import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cohorts } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  const rows = await db
    .select({ id: cohorts.id, name: cohorts.name })
    .from(cohorts)
    .orderBy(desc(cohorts.createdAt));

  return NextResponse.json(rows);
}
