'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Icons } from '@/components/icons';
import { buildDisplayNoMap, computeFollowUpMap } from '@/lib/survey-display';
import type { Json } from '@/lib/supabase/types';
import {
  publishSurvey,
  saveSurveyDraft,
  type SectionDraft as RemoteSection
} from '../_actions';

type Instructor = {
  id: string;
  name: string;
  affiliation: string | null;
};

type QuestionType = 'likert10' | 'text' | 'choice';

type LocalQuestion = {
  key: string;
  type: QuestionType;
  text: string;
  required: boolean;
  options: Json | null;
};

type LocalSection = {
  key: string;
  title: string;
  instructor_id: string | null;
  questions: LocalQuestion[];
};

type Props = {
  cohortId: string;
  surveyId: string;
  initialSections: RemoteSection[];
  instructors: Instructor[];
  published: boolean;
  publishedAt: string | null;
};

const TYPE_LABELS: Record<QuestionType, string> = {
  likert10: '10점 척도',
  text: '서술형',
  choice: '객관식 (옵션 편집은 차후 지원)'
};

const uid = () => Math.random().toString(36).slice(2, 10);

const toLocal = (remote: RemoteSection[]): LocalSection[] =>
  remote.map((s) => ({
    key: uid(),
    title: s.title,
    instructor_id: s.instructor_id,
    questions: s.questions.map((q) => ({
      key: uid(),
      type: (q.type as QuestionType) ?? 'text',
      text: q.text,
      required: q.required,
      options: q.options
    }))
  }));

const toRemote = (local: LocalSection[]): RemoteSection[] =>
  local.map((s) => ({
    title: s.title,
    instructor_id: s.instructor_id,
    questions: s.questions.map((q) => ({
      type: q.type,
      text: q.text,
      required: q.required,
      options: q.options
    }))
  }));

const EMPTY_SECTION = (idx: number): LocalSection => ({
  key: uid(),
  title: `섹션 ${idx}`,
  instructor_id: null,
  questions: [
    { key: uid(), type: 'likert10', text: '', required: true, options: null }
  ]
});

type FlatQuestion = {
  id: string;
  type: string;
  section_no: number;
  instructor_id: string | null;
};

function flattenForDisplay(sections: LocalSection[]): FlatQuestion[] {
  return sections.flatMap((s, sIdx) =>
    s.questions.map((q) => ({
      id: q.key,
      type: q.type,
      section_no: sIdx + 1,
      instructor_id: s.instructor_id
    }))
  );
}

export function SurveyBuilder({
  cohortId,
  surveyId,
  initialSections,
  instructors,
  published,
  publishedAt
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [sections, setSections] = useState<LocalSection[]>(() =>
    initialSections.length === 0 ? [EMPTY_SECTION(1)] : toLocal(initialSections)
  );

  const flatQuestions = useMemo(() => flattenForDisplay(sections), [sections]);
  const followUpMap = useMemo(() => computeFollowUpMap(flatQuestions), [flatQuestions]);
  const followUpKeys = useMemo(() => new Set(followUpMap.keys()), [followUpMap]);
  const displayNoMap = useMemo(
    () => buildDisplayNoMap(flatQuestions, followUpMap),
    [flatQuestions, followUpMap]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const readOnly = published;

  // ---- CRUD helpers ------------------------------------------------------
  const updateSection = (key: string, patch: Partial<LocalSection>) =>
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const removeSection = (key: string) =>
    setSections((prev) => prev.filter((s) => s.key !== key));
  const addSection = () =>
    setSections((prev) => [...prev, EMPTY_SECTION(prev.length + 1)]);

  const updateQuestion = (
    sectionKey: string,
    qKey: string,
    patch: Partial<LocalQuestion>
  ) =>
    setSections((prev) =>
      prev.map((s) =>
        s.key === sectionKey
          ? {
              ...s,
              questions: s.questions.map((q) => (q.key === qKey ? { ...q, ...patch } : q))
            }
          : s
      )
    );
  const removeQuestion = (sectionKey: string, qKey: string) =>
    setSections((prev) =>
      prev.map((s) =>
        s.key === sectionKey
          ? { ...s, questions: s.questions.filter((q) => q.key !== qKey) }
          : s
      )
    );
  const addQuestion = (sectionKey: string) =>
    setSections((prev) =>
      prev.map((s) =>
        s.key === sectionKey
          ? {
              ...s,
              questions: [
                ...s.questions,
                {
                  key: uid(),
                  type: 'likert10',
                  text: '',
                  required: true,
                  options: null
                }
              ]
            }
          : s
      )
    );

  // ---- DnD --------------------------------------------------------------
  const handleSectionDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setSections((prev) => {
      const oldIdx = prev.findIndex((s) => s.key === active.id);
      const newIdx = prev.findIndex((s) => s.key === over.id);
      if (oldIdx < 0 || newIdx < 0) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  const handleQuestionDragEnd = (sectionKey: string) => (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setSections((prev) =>
      prev.map((s) => {
        if (s.key !== sectionKey) return s;
        const oldIdx = s.questions.findIndex((q) => q.key === active.id);
        const newIdx = s.questions.findIndex((q) => q.key === over.id);
        if (oldIdx < 0 || newIdx < 0) return s;
        return { ...s, questions: arrayMove(s.questions, oldIdx, newIdx) };
      })
    );
  };

  // ---- Actions ----------------------------------------------------------
  const handleSave = (onSuccess?: () => void) => {
    setError(null);
    const payload = toRemote(sections);
    startTransition(async () => {
      const result = await saveSurveyDraft(cohortId, surveyId, payload);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSavedAt(new Date());
      onSuccess?.();
    });
  };

  const handlePublish = () => {
    if (
      !window.confirm(
        '발행하면 공유 링크로 응답 접수가 시작되고 더 이상 수정할 수 없습니다. 진행하시겠습니까?'
      )
    ) {
      return;
    }
    setError(null);
    const payload = toRemote(sections);
    startTransition(async () => {
      const saveResult = await saveSurveyDraft(cohortId, surveyId, payload);
      if (saveResult.error) {
        setError(saveResult.error);
        return;
      }
      const pubResult = await publishSurvey(cohortId, surveyId);
      if (pubResult.error) {
        setError(pubResult.error);
        return;
      }
      router.refresh();
    });
  };

  // ---- Render -----------------------------------------------------------
  return (
    <div className='max-w-3xl space-y-5'>
      {published ? (
        <div className='rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-100'>
          <strong>발행됨</strong>
          {publishedAt && (
            <span className='ml-2 text-xs opacity-70'>
              {new Date(publishedAt).toLocaleString('ko-KR')}
            </span>
          )}
          {' · '}편집이 잠겨 있습니다.
        </div>
      ) : (
        <div className='rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100'>
          <strong>초안</strong> · 발행 전까지 자유 편집 가능합니다. 발행 후 공유 링크로 응답을 받기 시작합니다.
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleSectionDragEnd}
      >
        <SortableContext
          items={sections.map((s) => s.key)}
          strategy={verticalListSortingStrategy}
        >
          <div className='space-y-4'>
            {sections.map((section, idx) => (
              <SortableSection
                key={section.key}
                section={section}
                index={idx}
                instructors={instructors}
                readOnly={readOnly}
                canRemove={sections.length > 1}
                followUpKeys={followUpKeys}
                displayNoMap={displayNoMap}
                onUpdate={(patch) => updateSection(section.key, patch)}
                onRemove={() => removeSection(section.key)}
                onAddQuestion={() => addQuestion(section.key)}
                onUpdateQuestion={(qKey, patch) => updateQuestion(section.key, qKey, patch)}
                onRemoveQuestion={(qKey) => removeQuestion(section.key, qKey)}
                onQuestionDragEnd={handleQuestionDragEnd(section.key)}
                sensors={sensors}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {!readOnly && (
        <button
          type='button'
          onClick={addSection}
          className='w-full rounded-xl border-2 border-dashed bg-card/50 px-6 py-4 text-sm font-semibold text-muted-foreground hover:bg-muted'
        >
          + 섹션 추가
        </button>
      )}

      {error && (
        <div className='rounded-md bg-red-50 px-4 py-3 text-sm font-medium text-red-700'>{error}</div>
      )}

      <div className='sticky bottom-4 flex items-center justify-between rounded-xl border bg-card/95 px-5 py-3 shadow-lg backdrop-blur'>
        <div className='text-xs text-muted-foreground'>
          {readOnly
            ? '발행 후에는 편집할 수 없습니다.'
            : savedAt
              ? `마지막 저장 ${savedAt.toLocaleTimeString('ko-KR')}`
              : '아직 저장되지 않은 변경사항이 있을 수 있습니다.'}
        </div>
        <div className='flex gap-2'>
          {!readOnly && (
            <>
              <button
                type='button'
                disabled={pending}
                onClick={() => handleSave()}
                className='rounded-md border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50'
              >
                {pending ? '저장 중…' : '초안 저장'}
              </button>
              <button
                type='button'
                disabled={pending}
                onClick={handlePublish}
                className='rounded-md bg-gradient-to-r from-emerald-600 to-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50'
              >
                {pending ? '처리 중…' : '발행'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 섹션 카드
// ============================================================================

type SectionProps = {
  section: LocalSection;
  index: number;
  instructors: Instructor[];
  readOnly: boolean;
  canRemove: boolean;
  followUpKeys: Set<string>;
  displayNoMap: Map<string, string>;
  onUpdate: (patch: Partial<LocalSection>) => void;
  onRemove: () => void;
  onAddQuestion: () => void;
  onUpdateQuestion: (qKey: string, patch: Partial<LocalQuestion>) => void;
  onRemoveQuestion: (qKey: string) => void;
  onQuestionDragEnd: (e: DragEndEvent) => void;
  sensors: ReturnType<typeof useSensors>;
};

function SortableSection({
  section,
  index,
  instructors,
  readOnly,
  canRemove,
  followUpKeys,
  displayNoMap,
  onUpdate,
  onRemove,
  onAddQuestion,
  onUpdateQuestion,
  onRemoveQuestion,
  onQuestionDragEnd,
  sensors
}: SectionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.key,
    disabled: readOnly
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className='rounded-xl border bg-card shadow-sm'
    >
      <div className='flex items-start gap-2 border-b bg-muted/40 px-4 py-3'>
        {!readOnly && (
          <button
            type='button'
            {...attributes}
            {...listeners}
            className='mt-1 cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing'
            aria-label='섹션 순서 변경'
          >
            <Icons.gripVertical className='h-4 w-4' />
          </button>
        )}
        <span className='mt-2 shrink-0 text-xs font-bold text-blue-600'>{index + 1}.</span>
        <div className='flex-1 space-y-2'>
          <input
            type='text'
            value={section.title}
            disabled={readOnly}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder='섹션 제목'
            className='w-full rounded-md border bg-background px-3 py-2 text-sm font-semibold disabled:opacity-70'
          />
          <select
            value={section.instructor_id ?? ''}
            disabled={readOnly}
            onChange={(e) => onUpdate({ instructor_id: e.target.value || null })}
            className='w-full rounded-md border bg-background px-3 py-2 text-xs disabled:opacity-70'
          >
            <option value=''>공통 섹션</option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.affiliation ? `${i.name} (${i.affiliation})` : i.name}
              </option>
            ))}
          </select>
        </div>
        {!readOnly && canRemove && (
          <button
            type='button'
            onClick={() => {
              if (window.confirm(`'${section.title}' 섹션을 삭제하시겠습니까? 내부 문항도 함께 삭제됩니다.`)) {
                onRemove();
              }
            }}
            className='mt-1 rounded p-1 text-red-600 hover:bg-red-50'
            aria-label='섹션 삭제'
          >
            <Icons.trash className='h-4 w-4' />
          </button>
        )}
      </div>

      <div className='space-y-2 px-4 py-3'>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onQuestionDragEnd}
        >
          <SortableContext
            items={section.questions.map((q) => q.key)}
            strategy={verticalListSortingStrategy}
          >
            {section.questions.map((q, qIdx) => (
              <SortableQuestion
                key={q.key}
                question={q}
                index={qIdx}
                displayNo={displayNoMap.get(q.key) ?? '?'}
                readOnly={readOnly}
                canRemove={section.questions.length > 1}
                isFollowUp={followUpKeys.has(q.key)}
                onUpdate={(patch) => onUpdateQuestion(q.key, patch)}
                onRemove={() => onRemoveQuestion(q.key)}
              />
            ))}
          </SortableContext>
        </DndContext>

        {!readOnly && (
          <button
            type='button'
            onClick={onAddQuestion}
            className='w-full rounded-lg border border-dashed bg-background/50 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted'
          >
            + 문항 추가
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 문항 카드
// ============================================================================

type QuestionProps = {
  question: LocalQuestion;
  index: number;
  displayNo: string;
  readOnly: boolean;
  canRemove: boolean;
  isFollowUp: boolean;
  onUpdate: (patch: Partial<LocalQuestion>) => void;
  onRemove: () => void;
};

function SortableQuestion({
  question,
  index: _index,
  displayNo,
  readOnly,
  canRemove,
  isFollowUp,
  onUpdate,
  onRemove
}: QuestionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.key,
    disabled: readOnly
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1
  };

  const cardClass = isFollowUp
    ? 'ml-6 rounded-lg border border-amber-200/60 bg-amber-50/40 p-3 dark:border-amber-900/30 dark:bg-amber-900/10'
    : 'rounded-lg border bg-background/60 p-3';

  return (
    <div ref={setNodeRef} style={style} className={cardClass}>
      <div className='flex items-start gap-2'>
        {!readOnly && (
          <button
            type='button'
            {...attributes}
            {...listeners}
            className='mt-1 cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing'
            aria-label='문항 순서 변경'
          >
            <Icons.gripVertical className='h-3.5 w-3.5' />
          </button>
        )}
        <span className='mt-2 inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-muted-foreground'>
          {isFollowUp && <span className='text-amber-600'>↳</span>}
          Q{displayNo}
        </span>
        <div className='flex-1 space-y-2'>
          <textarea
            value={question.text}
            disabled={readOnly}
            onChange={(e) => onUpdate({ text: e.target.value })}
            placeholder={isFollowUp ? '예: 불만족 시 사유를 알려주세요' : '문항 내용을 입력하세요'}
            rows={2}
            className='w-full resize-none rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-70'
          />
          <div className='flex flex-wrap items-center gap-3'>
            <select
              value={question.type}
              disabled={readOnly}
              onChange={(e) => onUpdate({ type: e.target.value as QuestionType })}
              className='rounded-md border bg-background px-2 py-1 text-xs disabled:opacity-70'
            >
              {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <label className='inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground'>
              <input
                type='checkbox'
                checked={question.required}
                disabled={readOnly}
                onChange={(e) => onUpdate({ required: e.target.checked })}
                className='cursor-pointer'
              />
              필수
            </label>
            {isFollowUp && (
              <span className='text-[11px] text-amber-700 dark:text-amber-400'>
                조건부 — 직전 척도 점수 4 이하일 때만 노출
              </span>
            )}
            {question.type === 'choice' && (
              <span className='text-[11px] text-amber-600'>
                옵션 편집 UI는 다음 업데이트에서 지원됩니다.
              </span>
            )}
          </div>
          {question.type === 'likert10' && (
            <div className='mt-1 grid grid-cols-10 gap-0.5'>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <div
                  key={n}
                  className='rounded border border-slate-200 bg-slate-50 py-1 text-center text-[10px] tabular-nums text-slate-400 dark:border-slate-700 dark:bg-slate-900'
                >
                  {n}
                </div>
              ))}
            </div>
          )}
          {question.type === 'text' && (
            <div className='mt-1 rounded-md border border-dashed border-slate-200 bg-slate-50/50 px-3 py-2 text-[11px] italic text-slate-400 dark:border-slate-700 dark:bg-slate-900/30'>
              응답자가 자유 서술 입력
            </div>
          )}
        </div>
        {!readOnly && canRemove && (
          <button
            type='button'
            onClick={onRemove}
            className='mt-1 rounded p-1 text-red-600 hover:bg-red-50'
            aria-label='문항 삭제'
          >
            <Icons.trash className='h-3.5 w-3.5' />
          </button>
        )}
      </div>
    </div>
  );
}
