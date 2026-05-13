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

export type Answer = {
  answer_value: unknown;
  is_correct: boolean | null;
  score: number | null;
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
  beginner:
    'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900',
  intermediate:
    'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900',
  advanced:
    'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900'
};

export function ResponseViewer({
  questions,
  answers
}: {
  questions: Question[];
  answers: Map<string, Answer>;
}) {
  const bySection = new Map<string, Question[]>();
  for (const q of questions) {
    if (!bySection.has(q.section)) bySection.set(q.section, []);
    bySection.get(q.section)!.push(q);
  }
  const visible = SECTION_ORDER.filter((s) => bySection.has(s));

  return (
    <Tabs defaultValue={visible[0]}>
      <TabsList className='h-auto flex-wrap gap-1'>
        {visible.map((s) => {
          const sectionRows = bySection.get(s)!;
          const responded = sectionRows.filter((q) => answers.has(q.id)).length;
          return (
            <TabsTrigger key={s} value={s} className='gap-2'>
              <span>{SECTION_LABEL[s] ?? s}</span>
              <span className='text-muted-foreground bg-muted rounded-full px-1.5 text-xs font-normal'>
                {responded}/{sectionRows.length}
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>

      {visible.map((s) => (
        <TabsContent key={s} value={s} className='mt-4'>
          <div className='flex flex-col gap-3'>
            {bySection.get(s)!.map((q) => (
              <QuestionAnswerCard key={q.id} q={q} answer={answers.get(q.id)} />
            ))}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}

function QuestionAnswerCard({ q, answer }: { q: Question; answer: Answer | undefined }) {
  const isKnowledge = q.section === 'knowledge';
  const responded = answer !== undefined;
  const selectedKeys = extractSelectedKeys(answer?.answer_value);
  const likertValue =
    q.question_type === 'likert5' && typeof answer?.answer_value === 'number'
      ? answer.answer_value
      : null;
  const textValue =
    q.question_type === 'text' && typeof answer?.answer_value === 'string'
      ? answer.answer_value
      : null;

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
          {!responded && (
            <Badge variant='outline' className='border-dashed text-muted-foreground'>
              미응답
            </Badge>
          )}
          {responded && isKnowledge && answer?.is_correct === true && (
            <Badge className='bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100'>
              정답 · +{answer.score ?? q.weight}점
            </Badge>
          )}
          {responded && isKnowledge && answer?.is_correct === false && (
            <Badge className='bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-100'>
              오답
            </Badge>
          )}
        </div>

        <p className='text-sm leading-relaxed'>{q.question_text}</p>

        {q.choices.length > 0 && (
          <ul className='flex flex-col gap-1.5 text-sm'>
            {q.choices.map((c) => {
              const isCorrect = q.correct_choice === c.key;
              const isSelected = selectedKeys.includes(c.key);
              const knowledgeCorrectPick = isKnowledge && isCorrect && isSelected;
              const knowledgeWrongPick = isKnowledge && !isCorrect && isSelected;
              const nonKnowledgePick = !isKnowledge && isSelected;
              const knowledgeMissedCorrect = isKnowledge && isCorrect && !isSelected;

              return (
                <li
                  key={c.key}
                  className={cn(
                    'flex items-start gap-2 rounded-md border px-3 py-2',
                    knowledgeCorrectPick &&
                      'border-emerald-400 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-700',
                    knowledgeWrongPick &&
                      'border-rose-400 bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100 dark:border-rose-700',
                    knowledgeMissedCorrect &&
                      'border-emerald-200 bg-emerald-50/40 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200 dark:border-emerald-900',
                    nonKnowledgePick &&
                      'border-primary/50 bg-primary/5 text-foreground',
                    !isCorrect && !isSelected && 'border-transparent'
                  )}
                >
                  <span
                    className={cn(
                      'flex-shrink-0 font-mono text-xs leading-relaxed',
                      (knowledgeCorrectPick || knowledgeMissedCorrect || nonKnowledgePick) &&
                        'font-semibold'
                    )}
                  >
                    {c.key}
                  </span>
                  <span className='leading-relaxed'>{c.text}</span>
                  <span className='ml-auto flex flex-shrink-0 gap-1.5 text-xs font-semibold'>
                    {isSelected && (
                      <Badge variant='outline' className='bg-background font-normal'>
                        선택
                      </Badge>
                    )}
                    {isKnowledge && isCorrect && (
                      <Badge
                        variant='outline'
                        className='border-emerald-400 bg-emerald-100 text-emerald-800 font-normal'
                      >
                        정답
                      </Badge>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {q.question_type === 'likert5' && (
          <LikertScale value={likertValue} />
        )}

        {q.question_type === 'text' && (
          <div
            className={cn(
              'rounded-md border px-3 py-3 text-sm leading-relaxed whitespace-pre-wrap',
              textValue
                ? 'bg-muted/30'
                : 'border-dashed text-muted-foreground italic'
            )}
          >
            {textValue ?? '미응답'}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LikertScale({ value }: { value: number | null }) {
  const labels = ['전혀 그렇지 않다', '그렇지 않다', '보통', '그렇다', '매우 그렇다'];
  return (
    <div className='flex gap-1.5'>
      {labels.map((label, i) => {
        const score = i + 1;
        const active = value === score;
        return (
          <div
            key={score}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs',
              active
                ? 'border-primary bg-primary/10 text-foreground font-semibold'
                : 'text-muted-foreground border-transparent bg-muted/40'
            )}
          >
            <span className='text-base tabular-nums'>{score}</span>
            <span className='text-center'>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function extractSelectedKeys(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}
