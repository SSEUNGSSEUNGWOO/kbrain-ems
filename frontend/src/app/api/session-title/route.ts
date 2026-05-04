import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sessions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ title: null });

  const rows = await db
    .select({ sessionDate: sessions.sessionDate, title: sessions.title })
    .from(sessions)
    .where(eq(sessions.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return NextResponse.json({ title: null });

  return NextResponse.json({ title: row.title ?? row.sessionDate });
}
