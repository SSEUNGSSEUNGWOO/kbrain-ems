'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

type Choice = { key: string; text: string };

export type Question = {
  id: string;
  section: string;
  question_no: string;
  difficulty: string | null;
  question_text: string;
  question_type: string;
  choices: Choice[];
  correct_choice: string | null;
  weight: number;
};

const SECTION_ORDER = [
  'common',
  'pre_learning',
  'self_diagnosis',
  'knowledge',
  'usability',
  'plan'
] as const;

const SECTION_LABEL: Record<string, string> = {
  common: '공통',
  pre_learning: '사전학습',
  self_diagnosis: '자가진단',
  knowledge: '지식평가',
  usability: '업무활용성',
  plan: '적용계획'
};

const SECTION_DESC: Record<string, string> = {
  common: '모든 신청자 공통 — 소속·직렬·즉시 적용 가능성·기타 의견',
  pre_learning: '권장 사전학습(이러닝) 이수 여부',
  self_diagnosis: '응답자가 자기 수준을 1~5점으로 진단 (가중치 없음)',
  knowledge: '정답 채점 대상. 가중치: 초급 1점 · 중급 2점 · 고급 3점',
  usability: '교육 후 업무에 적용할 영역 (다중선택)',
  plan: '100자 내외 자유 서술'
};

const TYPE_LABEL: Record<string, string> = {
  single: '단일선택',
  multi: '다중선택',
  likert5: '5점 척도',
  text: '자유서술'
};

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: '초급',
  intermediate: '중급',
  advanced: '고급'
};

const DIFFICULTY_TONE: Record<string, string> = {
  beginner: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900',
  intermediate:
    'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900',
  advanced:
    'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900'
};

export function ApplicationsViewer({ questions }: { questions: Question[] }) {
  const bySection = new Map<string, Question[]>();
  for (const q of questions) {
    if (!bySection.has(q.section)) bySection.set(q.section, []);
    bySection.get(q.section)!.push(q);
  }

  const visibleSections = SECTION_ORDER.filter((s) => bySection.has(s));
  const knowledgeRows = bySection.get('knowledge') ?? [];
  const maxScore = knowledgeRows.reduce((sum, q) => sum + (q.weight ?? 1), 0);

  return (
    <div className='flex flex-col gap-6'>
      <SummaryStats
        total={questions.length}
        sections={visibleSections.map((s) => ({
          key: s,
          label: SECTION_LABEL[s] ?? s,
          count: bySection.get(s)!.length
        }))}
        knowledgeMax={maxScore}
      />

      <Tabs defaultValue={visibleSections[0]}>
        <TabsList className='h-auto flex-wrap gap-1'>
          {visibleSections.map((s) => (
            <TabsTrigger key={s} value={s} className='gap-2'>
              <span>{SECTION_LABEL[s] ?? s}</span>
              <span className='text-muted-foreground bg-muted rounded-full px-1.5 text-xs font-normal'>
                {bySection.get(s)!.length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {visibleSections.map((s) => (
          <TabsContent key={s} value={s} className='mt-4'>
            <p className='text-muted-foreground mb-4 text-sm'>{SECTION_DESC[s]}</p>
            <div className='flex flex-col gap-3'>
              {bySection.get(s)!.map((q) => (
                <QuestionCard key={q.id} q={q} />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function SummaryStats({
  total,
  sections,
  knowledgeMax
}: {
  total: number;
  sections: { key: string; label: string; count: number }[];
  knowledgeMax: number;
}) {
  return (
    <Card className='py-4'>
      <CardContent className='flex flex-wrap items-center gap-x-8 gap-y-3 px-6'>
        <Stat label='총 문항' value={total} accent />
        {sections.map((s) => (
          <Stat key={s.key} label={s.label} value={s.count} />
        ))}
        {knowledgeMax > 0 && (
          <Stat label='지식평가 만점' value={`${knowledgeMax}점`} accent />
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  accent
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className='flex flex-col'>
      <span className='text-muted-foreground text-xs'>{label}</span>
      <span
        className={cn('text-lg leading-tight font-semibold tabular-nums', accent && 'text-primary')}
      >
        {value}
      </span>
    </div>
  );
}

function QuestionCard({ q }: { q: Question }) {
  const isKnowledge = q.section === 'knowledge';

  return (
    <Card className='gap-3 py-4'>
      <CardContent className='flex flex-col gap-3 px-5'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='bg-muted text-muted-foreground rounded-md px-2 py-0.5 font-mono text-xs'>
            {q.question_no}
          </span>
          <Badge variant='outline' className='font-normal'>
            {TYPE_LABEL[q.question_type] ?? q.question_type}
          </Badge>
          {q.difficulty && (
            <span
              className={cn(
                'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
                DIFFICULTY_TONE[q.difficulty]
              )}
            >
              {DIFFICULTY_LABEL[q.difficulty] ?? q.difficulty}
              <span className='ml-1 opacity-70'>· {q.weight}점</span>
            </span>
          )}
        </div>

        <p className='text-sm leading-relaxed'>{q.question_text}</p>

        {q.choices.length > 0 && (
          <ul className='flex flex-col gap-1.5 text-sm'>
            {q.choices.map((c) => {
              const isCorrect = isKnowledge && q.correct_choice === c.key;
              return (
                <li
                  key={c.key}
                  className={cn(
                    'flex items-start gap-2 rounded-md px-3 py-2',
                    isCorrect
                      ? 'border border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'
                      : 'border border-transparent'
                  )}
                >
                  <span
                    className={cn(
                      'flex-shrink-0 font-mono text-xs leading-relaxed',
                      isCorrect ? 'font-semibold' : 'text-muted-foreground'
                    )}
                  >
                    {c.key}
                  </span>
                  <span className='leading-relaxed'>{c.text}</span>
                  {isCorrect && (
                    <span className='ml-auto flex-shrink-0 text-xs font-semibold'>정답</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {q.question_type === 'likert5' && q.choices.length === 0 && (
          <div className='text-muted-foreground flex gap-1 text-xs'>
            <span>1 전혀 그렇지 않다</span>
            <span>·</span>
            <span>2 그렇지 않다</span>
            <span>·</span>
            <span>3 보통</span>
            <span>·</span>
            <span>4 그렇다</span>
            <span>·</span>
            <span>5 매우 그렇다</span>
          </div>
        )}

        {q.question_type === 'text' && (
          <div className='border-muted text-muted-foreground rounded-md border border-dashed px-3 py-3 text-xs italic'>
            자유 서술 답변 영역
          </div>
        )}
      </CardContent>
    </Card>
  );
}
