import { NextResponse } from 'next/server';
import { isViewer } from '@/lib/auth';
import { logActivity } from '@/lib/activity-log';
import { fetchCertRows, filterCertRows } from '@/lib/certified-roster';
import { buildCertifiedWorkbook } from '@/lib/excel/certified-export';

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const filter = {
    q: sp.get('q') ?? undefined,
    year: sp.get('year') ?? undefined,
    track: sp.get('track') ?? undefined,
    kind: sp.get('kind') ?? undefined
  };

  const hidePersonal = await isViewer();
  const rows = filterCertRows(await fetchCertRows(), filter);
  const buf = await buildCertifiedWorkbook({ rows, hidePersonal });

  await logActivity({
    actionType: 'download',
    resourceType: 'applicant',
    summary: '인증자 명단 엑셀 다운로드'
  });

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `AI챔피언 인증자 명단_${today}.xlsx`;
  const encoded = encodeURIComponent(filename);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'no-store'
    }
  });
}
