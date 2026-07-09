import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 서버 시각만 리턴 — 클라이언트가 NTP 방식 offset 계산에 사용.
// GET 요청 도착 시점 == 응답 생성 시점 (초경량, 캐시 없음).
export async function GET() {
  return NextResponse.json(
    { now: new Date().toISOString() },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0'
      }
    }
  );
}
