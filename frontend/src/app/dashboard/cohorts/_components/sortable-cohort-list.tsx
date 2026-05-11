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
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <li ref={setNodeRef} style={style} className='relative'>
      <button
        type='button'
        {...attributes}
        {...listeners}
        aria-label='기수 순서 변경 핸들'
        title='드래그해서 순서 변경'
        className='bg-background/95 hover:bg-accent absolute top-2 right-2 z-10 flex h-8 w-8 cursor-grab items-center justify-center rounded-md border shadow-sm backdrop-blur transition active:cursor-grabbing'
      >
        <Icons.gripVertical className='text-muted-foreground h-4 w-4' />
      </button>
      <CohortCard cohort={cohort} />
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
        <ul className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {items.map((c) => (
            <SortableCohortItem key={c.id} cohort={c} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
