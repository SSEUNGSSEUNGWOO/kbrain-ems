import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isViewer } from '@/lib/auth';
import { logActivity } from '@/lib/activity-log';
import { buildSelectionStatusWorkbook } from '@/lib/excel/selection-status-export';

// 전 과정 횡단 집계라 응답까지 시간이 걸린다 (지원 6천 건 규모)
export const maxDuration = 120;

export async function GET(req: Request) {
  // 개인정보(연락처·이메일)가 포함된 전수 명단이라 viewer 는 내려받지 못하게 막는다
  if (await isViewer()) {
    return new NextResponse('권한이 없습니다.', { status: 403 });
  }

  const supabase = createAdminClient();
  const stamp = new URL(req.url).searchParams.get('stamp') ?? undefined;

  let result;
  try {
    result = await buildSelectionStatusWorkbook(supabase, stamp ?? undefined);
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : '리포트 생성 실패', { status: 500 });
  }

  await logActivity({
    actionType: 'download',
    resourceType: 'application',
    summary: `지원자·선발 현황 리포트 다운로드 (지원 ${result.applicationCount}건 · 선발 ${result.selectedCount}건 · ${result.cohortCount}개 과정)`
  });

  const filename = `지원자_선발현황_${result.stamp.replace(/-/g, '')}.xlsx`;
  const encoded = encodeURIComponent(filename);

  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'no-store'
    }
  });
}
