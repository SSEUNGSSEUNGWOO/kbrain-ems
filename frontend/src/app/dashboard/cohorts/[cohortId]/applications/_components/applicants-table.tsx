'use client';

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export type ApplicationRow = {
  id: string;
  applicant_id: string;
  name: string;
  organization: string | null;
  department: string | null;
  job_role: string | null;
  status: string;
  rejected_stage: string | null;
  knowledge_score: number | null;
  knowledge_correct_count: number | null;
  knowledge_total_count: number | null;
  self_diagnosis_avg: number | null;
  decided_at: string | null;
  applied_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  applied: '신청',
  pending: '심사중',
  selected: '선발',
  rejected: '탈락',
  withdrawn: '취하'
};

const STATUS_TONE: Record<string, string> = {
  applied: 'bg-slate-100 text-slate-700 border-slate-300',
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  selected: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
  withdrawn: 'bg-slate-50 text-slate-500 border-slate-200'
};

export function ApplicantsTable({
  rows,
  cohortId
}: {
  rows: ApplicationRow[];
  cohortId: string;
}) {
  return (
    <div className='overflow-x-auto rounded-lg border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>이름</TableHead>
            <TableHead>소속</TableHead>
            <TableHead>부서·직렬</TableHead>
            <TableHead className='text-right'>지식평가</TableHead>
            <TableHead className='text-right'>자가진단</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>신청일</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className='hover:bg-muted/50'>
              <TableCell>
                <Link
                  href={`/dashboard/cohorts/${cohortId}/applications/${r.id}`}
                  className='font-medium hover:underline'
                >
                  {r.name}
                </Link>
              </TableCell>
              <TableCell className='text-muted-foreground'>{r.organization ?? '—'}</TableCell>
              <TableCell className='text-muted-foreground text-sm'>
                {[r.department, r.job_role].filter(Boolean).join(' · ') || '—'}
              </TableCell>
              <TableCell className='text-right tabular-nums'>
                <KnowledgeCell row={r} />
              </TableCell>
              <TableCell className='text-right tabular-nums'>
                {r.self_diagnosis_avg !== null ? `${r.self_diagnosis_avg.toFixed(1)} / 5` : '—'}
              </TableCell>
              <TableCell>
                <StatusBadge status={r.status} rejectedStage={r.rejected_stage} />
              </TableCell>
              <TableCell className='text-muted-foreground text-sm'>
                {r.applied_at ?? '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function KnowledgeCell({ row }: { row: ApplicationRow }) {
  if (row.knowledge_score === null) return <span className='text-muted-foreground'>—</span>;
  const correct = row.knowledge_correct_count;
  const total = row.knowledge_total_count;
  return (
    <span>
      <span className='font-medium'>{row.knowledge_score}점</span>
      {correct !== null && total !== null && (
        <span className='text-muted-foreground ml-1 text-xs'>
          ({correct}/{total})
        </span>
      )}
    </span>
  );
}

function StatusBadge({
  status,
  rejectedStage
}: {
  status: string;
  rejectedStage: string | null;
}) {
  const label = STATUS_LABEL[status] ?? status;
  const tone = STATUS_TONE[status] ?? STATUS_TONE.applied;
  return (
    <Badge variant='outline' className={cn('font-normal', tone)}>
      {label}
      {status === 'rejected' && rejectedStage && (
        <span className='ml-1 opacity-70'>· {rejectedStage}</span>
      )}
    </Badge>
  );
}
