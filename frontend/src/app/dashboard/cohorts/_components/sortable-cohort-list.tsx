'use client';

import { useState, useTransition } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Icons } from '@/components/icons';
import { CohortCard } from './cohort-card';
import { reorderCohorts } from '../_actions';

type Cohort = React.ComponentProps<typeof CohortCard>['cohort'];

type Props = {
  cohorts: Cohort[];
};

function SortableCohortItem({ cohort }: { cohort: Cohort }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cohort.id
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1
  };

  return (
    <li ref={setNodeRef} style={style} className='flex'>
      <div
        {...attributes}
        {...listeners}
        role='button'
        aria-label='기수 순서 변경 핸들'
        title='끌어서 순서 변경'
        className='bg-muted/50 hover:bg-muted active:cursor-grabbing flex w-6 cursor-grab flex-col items-center justify-center gap-1 rounded-l-xl border border-r-0'
      >
        <Icons.gripVertical className='text-muted-foreground/70 h-3.5 w-3.5' />
      </div>
      <div className='flex-1 [&>div]:rounded-l-none [&>div]:border-l-0'>
        <CohortCard cohort={cohort} />
      </div>
    </li>
  );
}

export function SortableCohortList({ cohorts }: Props) {
  const [items, setItems] = useState(cohorts);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((c) => c.id === active.id);
    const newIndex = items.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);

    startTransition(async () => {
      await reorderCohorts(next.map((c) => c.id));
    });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((c) => c.id)} strategy={rectSortingStrategy}>
        <ul className='flex flex-col gap-2'>
          {items.map((c) => (
            <SortableCohortItem key={c.id} cohort={c} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
