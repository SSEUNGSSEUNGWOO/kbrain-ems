import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { PriorCert } from '../_selection-logic';

const TRACK_LETTER: Record<PriorCert['track'], string> = {
  green: 'G',
  blue: 'B',
  expert: 'E',
  continuing: 'C'
};

const TRACK_LABEL: Record<PriorCert['track'], string> = {
  green: '그린',
  blue: '블루',
  expert: '전문인재',
  continuing: '보수교육'
};

const TRACK_TONE: Record<PriorCert['track'], string> = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  expert: 'bg-violet-50 text-violet-700 border-violet-200',
  continuing: 'bg-slate-100 text-slate-600 border-slate-300'
};

const EVENT_LETTER: Record<NonNullable<PriorCert['event']>, string> = {
  hackathon: 'H',
  miniproject: 'M',
  private: 'P'
};

const EVENT_LABEL: Record<NonNullable<PriorCert['event']>, string> = {
  hackathon: '해커톤',
  miniproject: '미니프로젝트',
  private: '민간협업'
};

function certShort(c: PriorCert): string {
  const t = TRACK_LETTER[c.track] ?? '?';
  const r = c.round ? String(c.round) : '';
  const e = c.event ? EVENT_LETTER[c.event] : '';
  return `${t}${r}${e}`;
}

function certFull(c: PriorCert): string {
  const parts = [`${c.year}`, TRACK_LABEL[c.track] ?? c.track];
  if (c.round) parts.push(`${c.round}회차`);
  if (c.event) parts.push(EVENT_LABEL[c.event]);
  if (c.kind) parts.push(`(${c.kind})`);
  return parts.join(' ');
}

export function PriorCertsChips({ certs }: { certs: PriorCert[] }) {
  if (!certs || certs.length === 0) {
    return <span className='text-muted-foreground'>—</span>;
  }
  // 트랙·회차 순으로 정렬해 일관된 노출
  const sorted = [...certs].toSorted((a, b) => {
    if (a.track !== b.track) return a.track.localeCompare(b.track);
    return (a.round ?? 0) - (b.round ?? 0);
  });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className='inline-flex flex-wrap items-center justify-center gap-0.5'
          onClick={(e) => e.preventDefault()}
        >
          {sorted.map((c) => (
            <span
              key={c.cert_no}
              className={cn(
                'inline-flex items-center rounded border px-1 py-px text-[10px] font-semibold leading-tight tabular-nums',
                TRACK_TONE[c.track]
              )}
            >
              {certShort(c)}
            </span>
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent side='top' className='max-w-xs'>
        <div className='flex flex-col gap-0.5 text-xs'>
          <div className='mb-0.5 font-semibold opacity-90'>인증 이력</div>
          {sorted.map((c) => (
            <div key={c.cert_no}>
              {certFull(c)}
              <span className='ml-1 opacity-60'>· {c.cert_no}</span>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
