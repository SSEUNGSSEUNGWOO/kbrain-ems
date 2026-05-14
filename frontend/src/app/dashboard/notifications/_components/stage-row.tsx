import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import { stateLabel, type DispatchStage, type DispatchStageState } from '@/lib/dispatch-stages';
import { StageActionPopover } from './stage-action-popover';
import { DispatchMaterialTrigger } from './dispatch-material-trigger';

const stateToneClass = (s: DispatchStageState): string => {
  switch (s) {
    case 'sent':
      return 'border-emerald-300 bg-emerald-50 text-emerald-700';
    case 'overdue':
      return 'border-red-300 bg-red-50 text-red-700';
    case 'due':
      return 'border-amber-300 bg-amber-50 text-amber-700';
    case 'upcoming':
      return 'border-slate-300 bg-slate-50 text-slate-600';
    case 'no_trigger':
      return 'border-amber-200 bg-amber-50/40 text-amber-600';
  }
};

type Props = {
  cohortId: string;
  stage: DispatchStage;
  operatorNameById: Map<string, string>;
};

export function StageRow({ cohortId, stage, operatorNameById }: Props) {
  const tone = stateToneClass(stage.state);
  const sent = stage.state === 'sent' ? stage.latest_notification : null;
  const opName =
    sent?.sent_by_operator_id ? operatorNameById.get(sent.sent_by_operator_id) : null;

  return (
    <div className='flex items-center justify-between gap-3 rounded-md border p-3'>
      <div className='flex flex-1 items-center gap-3'>
        <Badge variant='outline' className={tone}>
          {stateLabel(stage.state)}
        </Badge>
        <div className='flex-1'>
          <div className='flex items-center gap-2 text-sm font-medium'>
            <span>{stage.label}</span>
            <span className='text-muted-foreground text-xs'>
              {stage.ideal_send_date ? `발송일 ${stage.ideal_send_date}` : '트리거 날짜 미설정'}
            </span>
          </div>
          <div className='text-muted-foreground text-xs'>{stage.hint}</div>
          {sent && sent.sent_at && (
            <div className='text-muted-foreground mt-1 flex items-center gap-2 text-xs'>
              <Icons.check className='size-3 text-emerald-600' />
              {new Date(sent.sent_at).toLocaleString('ko-KR', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })}
              {opName && <span>· {opName}</span>}
              {sent.channels && sent.channels.length > 0 && (
                <span>· {sent.channels.join(', ')}</span>
              )}
            </div>
          )}
        </div>
      </div>
      <div className='flex shrink-0 items-center gap-2'>
        {!sent && (
          <DispatchMaterialTrigger
            cohortId={cohortId}
            template={stage.template}
            stageLabel={stage.label}
          />
        )}
        <StageActionPopover
          cohortId={cohortId}
          template={stage.template}
          stageLabel={stage.label}
          sentNotificationId={sent?.id ?? null}
        />
      </div>
    </div>
  );
}
