import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import { stateLabel, type DispatchStageGroup, type DispatchStageState } from '@/lib/dispatch-stages';
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
  group: DispatchStageGroup;
  operatorNameById: Map<string, string>;
};

export function StageRow({ cohortId, group, operatorNameById }: Props) {
  const tone = stateToneClass(group.state);
  const sentRow = group.state === 'sent' ? group.latest_notifications[0] : null;
  const opName = sentRow?.sent_by_operator_id
    ? operatorNameById.get(sentRow.sent_by_operator_id)
    : null;
  const label = group.labels.join(' · ');

  return (
    <div className='flex items-center justify-between gap-3 rounded-md border p-3'>
      <div className='flex flex-1 items-center gap-3'>
        <Badge variant='outline' className={tone}>
          {stateLabel(group.state)}
        </Badge>
        <div className='flex-1'>
          <div className='flex items-center gap-2 text-sm font-medium'>
            <span>{label}</span>
            <span className='text-muted-foreground text-xs'>
              {group.ideal_send_date ? `발송일 ${group.ideal_send_date}` : '트리거 날짜 미설정'}
            </span>
          </div>
          <div className='text-muted-foreground text-xs'>{group.hint}</div>
          {sentRow && sentRow.sent_at && (
            <div className='text-muted-foreground mt-1 flex items-center gap-2 text-xs'>
              <Icons.check className='size-3 text-emerald-600' />
              {new Date(sentRow.sent_at).toLocaleString('ko-KR', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })}
              {opName && <span>· {opName}</span>}
              {sentRow.channels && sentRow.channels.length > 0 && (
                <span>· {sentRow.channels.join(', ')}</span>
              )}
            </div>
          )}
        </div>
      </div>
      <div className='flex shrink-0 items-center gap-2'>
        {group.state !== 'sent' && (
          <DispatchMaterialTrigger
            cohortId={cohortId}
            templates={group.templates}
            stageLabel={label}
          />
        )}
        <StageActionPopover
          cohortId={cohortId}
          templates={group.templates}
          stageLabel={label}
          sentNotificationIds={group.latest_notifications.map((n) => n.id)}
        />
      </div>
    </div>
  );
}
