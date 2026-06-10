import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createAdminClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity-log';

const typeLabel = (t: string) =>
  t === 'multiple_choice' ? '4지선다' : t === 'ox' ? 'O/X' : '단답형';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ cohortId: string }> }
) {
  const { cohortId } = await params;
  const supabase = createAdminClient();

  const { data: cohort } = await supabase
    .from('cohorts')
    .select('id, name')
    .eq('id', cohortId)
    .maybeSingle();
  if (!cohort) return new NextResponse('Cohort not found', { status: 404 });

  // 사전·사후 동일 문항이라 첫 번째 진단만 가져옴
  const { data: diagnoses } = await supabase
    .from('diagnoses')
    .select('id, title, type')
    .eq('cohort_id', cohortId)
    .order('type', { ascending: true })
    .limit(1);
  if (!diagnoses || diagnoses.length === 0) {
    return new NextResponse('No diagnosis found', { status: 404 });
  }

  type Q = {
    question_no: number;
    type: string;
    text: string;
    options: {
      choices?: { key: string; text: string }[];
      correct?: string;
      correct_keywords?: string[];
    } | null;
    weight: string | null;
  };
  const { data: questions, error } = await supabase
    .from('diagnosis_questions')
    .select('question_no, type, text, options, weight')
    .eq('diagnosis_id', diagnoses[0].id)
    .order('question_no', { ascending: true })
    .returns<Q[]>();
  if (error) return new NextResponse(error.message, { status: 500 });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'kbrain-ems';
  wb.created = new Date();
  const ws = wb.addWorksheet('정답지');

  const headers = ['NO', '유형', '배점', '문항', '보기 ①', '보기 ②', '보기 ③', '보기 ④', '정답'];
  const widths = [5, 9, 6, 52, 26, 26, 26, 26, 24];

  const headerRow = ws.addRow(headers);
  headerRow.height = 28;
  headerRow.eachCell((cell, col) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: col === 9 ? 'FF4A86E8' : 'FFF2F2F2' }
    };
    cell.font = {
      name: 'Arial',
      size: 11,
      bold: true,
      color: { argb: col === 9 ? 'FFFFFFFF' : 'FF000000' }
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };
  });
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  (questions ?? []).forEach((q) => {
    const opts = q.options ?? {};
    const choices = opts.choices ?? [];
    const c = (i: number) => {
      const ch = choices[i];
      return ch ? `${ch.key} ${ch.text}` : '';
    };

    let answer = '';
    if (q.type === 'multiple_choice') {
      const correctKey = opts.correct ?? '';
      const correctChoice = choices.find((ch) => ch.key === correctKey);
      answer = correctChoice ? `${correctKey} ${correctChoice.text}` : correctKey;
    } else if (q.type === 'ox') {
      answer = opts.correct ?? '';
    } else if (q.type === 'short_text') {
      answer = (opts.correct_keywords ?? []).join(', ');
    }

    const row = ws.addRow([
      q.question_no,
      typeLabel(q.type),
      q.weight ? Number(q.weight) : '',
      q.text,
      c(0),
      c(1),
      c(2),
      c(3),
      answer
    ]);
    row.eachCell((cell, col) => {
      cell.font = { name: 'Arial', size: 10 };
      cell.alignment = {
        horizontal: col === 1 || col === 2 || col === 3 ? 'center' : 'left',
        vertical: 'top',
        wrapText: true
      };
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
      if (col === 9) {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F6F3D' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE8F5E9' }
        };
      }
    });
  });

  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();

  await logActivity({
    actionType: 'download',
    resourceType: 'diagnosis',
    cohortId,
    summary: '역량평가 정답지 다운로드'
  });

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `${cohort.name} 역량평가 정답지 ${today}.xlsx`;
  const encoded = encodeURIComponent(filename);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'no-store'
    }
  });
}
