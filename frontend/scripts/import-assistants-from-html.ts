/**
 * C:\kbrain\AI데이터기반행정_보조강사_월력표_최종.html 의 보조강사 배정을
 * session_instructors role='sub' 로 일괄 입력.
 *
 * 1. 6명 신규 instructors 등록 (임정우는 이미 있음, 이름 매칭으로 멱등)
 * 2. 카드별 (cohort 이름 정규화, 세션 날짜) → sessions.id 찾기
 * 3. session_instructors UNIQUE (session_id, instructor_id, role) 멱등 insert
 *
 * usage:
 *   bun run scripts/import-assistants-from-html.ts          # dry-run
 *   bun run scripts/import-assistants-from-html.ts --apply  # 적용
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const HTML_PATH = 'C:\\kbrain\\AI데이터기반행정_보조강사_월력표_최종.html';
const APPLY = process.argv.includes('--apply');

// ---------- HTML 파싱 ----------
type Card = {
  cardId: number;
  month: number;
  day: number;
  date: string; // YYYY-MM-DD
  courseName: string;
  sessionRound: string; // 예: "1회차"
  operation: string;
  difficulty: string;
  mainInstructor: string; // 메인 강사 (없으면 빈 문자열)
  assistants: string[]; // trim된 비공백 이름들
};

function parseHtml(html: string): Card[] {
  const cards: Card[] = [];

  // 1) 카드 시작 인덱스 모두 수집 (전체 HTML 단위)
  type CardStart = { id: number; idx: number };
  const cardStarts: CardStart[] = [];
  const startRe = /<div class="card[^"]*" data-card-id="(\d+)"/g;
  let sm: RegExpExecArray | null;
  while ((sm = startRe.exec(html)) !== null) {
    cardStarts.push({ id: parseInt(sm[1], 10), idx: sm.index });
  }

  // 2) 각 카드의 슬라이스 = 자기 시작 ~ 다음 카드 시작 (또는 EOF)
  for (let i = 0; i < cardStarts.length; i++) {
    const start = cardStarts[i].idx;
    const end = i + 1 < cardStarts.length ? cardStarts[i + 1].idx : html.length;
    const cardHtml = html.slice(start, end);
    const cardId = cardStarts[i].id;

    // 카드가 속한 월: 자기 위치보다 앞의 마지막 month-title
    const before = html.slice(0, start);
    const monthMatches = [...before.matchAll(/<div class="month-title">2026년 (\d+)월/g)];
    const month = monthMatches.length > 0 ? parseInt(monthMatches[monthMatches.length - 1][1], 10) : 0;

    // 카드가 속한 날짜: 자기 위치보다 앞의 마지막 date-num
    const dayMatches = [...before.matchAll(/<div class="date-num[^"]*">(\d+)<\/div>/g)];
    const day = dayMatches.length > 0 ? parseInt(dayMatches[dayMatches.length - 1][1], 10) : 0;
    if (!month || !day) continue;

    const courseRaw = cardHtml.match(/<div class="course">([^<]+)<\/div>/)?.[1] ?? '';
    const parts = courseRaw.split(' · ');
    const courseName = parts[0]?.trim() ?? courseRaw.trim();
    const sessionRound = parts.slice(1).join(' · ').trim();

    const badgeMatches = [...cardHtml.matchAll(/<span class="badge"[^>]*>([^<]+)<\/span>/g)];
    const operation = badgeMatches[0]?.[1]?.trim() ?? '';
    const difficulty = badgeMatches[1]?.[1]?.trim() ?? '';

    const mainM = cardHtml.match(/<div class="instructor">강사 · ([^<]+)<\/div>/);
    const mainInstructor = mainM ? mainM[1].trim() : '';

    const inputMatches = [...cardHtml.matchAll(/<input[^>]*value="([^"]*)"/g)];
    const assistants = inputMatches
      .map((x) => x[1].trim())
      .filter((x) => x.length > 0);

    const date = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cards.push({ cardId, month, day, date, courseName, sessionRound, operation, difficulty, mainInstructor, assistants });
  }
  return cards;
}

// ---------- cohort 이름 정규화 (HTML → DB) ----------
// HTML: "AI 챔피언 그린 26-1기" → DB: "AI 챔피언 그린 1회차"
// 그 외는 그대로
function normalizeCohortName(htmlName: string): string {
  const m = htmlName.match(/^(AI 챔피언 (?:그린|블루)) 26-(\d+)기$/);
  if (m) return `${m[1]} ${m[2]}회차`;
  return htmlName;
}

// ---------- 실행 ----------
const html = fs.readFileSync(HTML_PATH, 'utf8');
const cards = parseHtml(html);
console.log(`HTML 카드 ${cards.length}개 파싱`);

// 카드별 보조강사 명단 펼치기 (멱등 insert용)
type Assignment = {
  date: string;
  cohortHtml: string;
  cohortDb: string;
  assistant: string;
};
const allAssistantNames = new Set<string>();
const allMainNames = new Set<string>();
const assignments: Assignment[] = [];
for (const c of cards) {
  const cohortDb = normalizeCohortName(c.courseName);
  if (c.mainInstructor) allMainNames.add(c.mainInstructor);
  for (const a of c.assistants) {
    allAssistantNames.add(a);
    assignments.push({ date: c.date, cohortHtml: c.courseName, cohortDb, assistant: a });
  }
}
console.log(`총 보조 배정 ${assignments.length}건, 보조강사 ${allAssistantNames.size}명, 메인강사 ${allMainNames.size}명`);
console.log('보조강사:', [...allAssistantNames].sort());
console.log('메인강사:', [...allMainNames].sort());

// dry-run: 카드별 보조강사 표시
if (!APPLY) {
  console.log('\n샘플 5개 카드:');
  for (const c of cards.slice(0, 5)) {
    console.log(`  ${c.date} | ${c.courseName} · ${c.sessionRound} | 보조: ${c.assistants.join(', ') || '(없음)'}`);
  }
}

// ---------- 1) instructors 매칭/insert (메인 + 보조 합산) ----------
const nameToId = new Map<string, string>();
const allInstructorNames = new Set([...allAssistantNames, ...allMainNames]);
{
  const { data: existing } = await s
    .from('instructors')
    .select('id, name')
    .in('name', [...allInstructorNames]);
  for (const ins of existing ?? []) nameToId.set(ins.name, ins.id);
  console.log(`\ninstructors 기존: ${nameToId.size}/${allInstructorNames.size}명`);
  const toInsertSub = [...allAssistantNames].filter((n) => !nameToId.has(n));
  const toInsertMain = [...allMainNames].filter((n) => !nameToId.has(n));
  console.log(`instructors 신규 (sub): ${toInsertSub.length}명`, toInsertSub);
  console.log(`instructors 신규 (main): ${toInsertMain.length}명`, toInsertMain);

  if (APPLY) {
    const rows = [
      ...toInsertSub.map((name) => ({ name, kind: 'sub' as const })),
      ...toInsertMain.map((name) => ({ name, kind: 'main' as const }))
    ];
    if (rows.length > 0) {
      const { data: ins, error } = await s
        .from('instructors')
        .insert(rows)
        .select('id, name');
      if (error) { console.error('instructors insert fail:', error); process.exit(1); }
      for (const r of ins ?? []) nameToId.set(r.name, r.id);
    }
  }
}

// ---------- 2) cohort 매칭 ----------
const cohortNames = [...new Set(assignments.map((a) => a.cohortDb))];
const { data: cohortRows } = await s
  .from('cohorts')
  .select('id, name')
  .in('name', cohortNames);
const cohortIdByName = new Map((cohortRows ?? []).map((c) => [c.name, c.id]));
console.log(`\ncohort 매칭: ${cohortIdByName.size}/${cohortNames.length}개`);
const cohortMisses = cohortNames.filter((n) => !cohortIdByName.has(n));
if (cohortMisses.length > 0) {
  console.error('❌ cohort 매칭 실패:');
  for (const n of cohortMisses) console.error(`  - ${n}`);
}

// ---------- 3) session 매칭 (cohort_id + session_date) ----------
const allCohortIds = [...cohortIdByName.values()];
const sessionDates = [...new Set(assignments.map((a) => a.date))];
const { data: sessionRows } = await s
  .from('sessions')
  .select('id, cohort_id, session_date, title')
  .in('cohort_id', allCohortIds)
  .in('session_date', sessionDates);
type SessionRow = { id: string; cohort_id: string; session_date: string; title: string | null };
const sessionsByKey = new Map<string, SessionRow>();
const sessionsByKeyAll = new Map<string, SessionRow[]>();
for (const r of (sessionRows ?? []) as SessionRow[]) {
  const k = `${r.cohort_id}|${r.session_date}`;
  sessionsByKey.set(k, r); // 첫 매칭만
  const arr = sessionsByKeyAll.get(k) ?? [];
  arr.push(r);
  sessionsByKeyAll.set(k, arr);
}

// ---------- 3) 카드별 session 매칭 — 없으면 생성 예약 ----------
console.log(`\n세션 매칭 점검 (cards ${cards.length}개):`);
const cardSessionMap = new Map<number, string>(); // cardId → session_id (이미 있는 것)
const toCreateSessions: Card[] = []; // 없어서 새로 만들 카드
const failedCards: Card[] = [];
for (const c of cards) {
  if (c.assistants.length === 0 && !c.mainInstructor) continue;
  const cohortId = cohortIdByName.get(normalizeCohortName(c.courseName));
  if (!cohortId) { failedCards.push(c); continue; }
  const k = `${cohortId}|${c.date}`;
  const matches = sessionsByKeyAll.get(k) ?? [];
  if (matches.length === 0) {
    toCreateSessions.push(c);
  } else {
    cardSessionMap.set(c.cardId, matches[0].id);
  }
}
console.log(`  이미 있는 session: ${cardSessionMap.size}`);
console.log(`  새로 만들 session: ${toCreateSessions.length}`);
console.log(`  cohort 매칭 실패: ${failedCards.length}`);
if (failedCards.length > 0) {
  console.error('❌ cohort 매칭 실패:');
  for (const c of failedCards) console.error(`  - card${c.cardId} | ${c.date} | ${c.courseName} · ${c.sessionRound}`);
}

if (!APPLY) {
  console.log('\n--apply 로 실제 insert');
  process.exit(0);
}

// ---------- 4) 누락 sessions 자동 생성 ----------
if (toCreateSessions.length > 0) {
  console.log(`\nsessions ${toCreateSessions.length}개 자동 생성...`);
  const rows = toCreateSessions.map((c) => ({
    cohort_id: cohortIdByName.get(normalizeCohortName(c.courseName))!,
    session_date: c.date,
    title: c.sessionRound || null
  }));
  const { data: created, error } = await s.from('sessions').insert(rows).select('id, cohort_id, session_date');
  if (error) { console.error('sessions insert fail:', error); process.exit(1); }
  // 생성된 session id 를 cardSessionMap 에 채움
  const createdByKey = new Map<string, string>();
  for (const r of created ?? []) createdByKey.set(`${r.cohort_id}|${r.session_date}`, r.id);
  for (const c of toCreateSessions) {
    const k = `${cohortIdByName.get(normalizeCohortName(c.courseName))}|${c.date}`;
    const sid = createdByKey.get(k);
    if (sid) cardSessionMap.set(c.cardId, sid);
  }
  console.log(`  생성됨: ${created?.length ?? 0}개`);
}

// ---------- 5) session_instructors insert (main + sub) ----------
console.log('\nsession_instructors insert (main + sub)...');
let insertedMain = 0, insertedSub = 0, skipped = 0, failed = 0;
for (const c of cards) {
  const sessionId = cardSessionMap.get(c.cardId);
  if (!sessionId) continue;

  type Assign = { name: string; role: 'main' | 'sub' };
  const assignList: Assign[] = [];
  if (c.mainInstructor) assignList.push({ name: c.mainInstructor, role: 'main' });
  for (const a of c.assistants) assignList.push({ name: a, role: 'sub' });

  for (const { name, role } of assignList) {
    const instructorId = nameToId.get(name);
    if (!instructorId) { failed++; console.error(`  instructor not found: ${name}`); continue; }
    const { data: dup } = await s
      .from('session_instructors')
      .select('id')
      .eq('session_id', sessionId)
      .eq('instructor_id', instructorId)
      .eq('role', role)
      .maybeSingle();
    if (dup) { skipped++; continue; }
    const { error } = await s
      .from('session_instructors')
      .insert({ session_id: sessionId, instructor_id: instructorId, role });
    if (error) { failed++; console.error(`  insert fail card${c.cardId} ${name}(${role}):`, error.message); continue; }
    if (role === 'main') insertedMain++; else insertedSub++;
  }
}
console.log(`완료 — main ${insertedMain}, sub ${insertedSub}, 중복스킵 ${skipped}, 실패 ${failed}`);
