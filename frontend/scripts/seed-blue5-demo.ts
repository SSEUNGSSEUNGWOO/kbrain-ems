/**
 * AI 챔피언 블루 5회차 자동선발 시연용 200명 시드.
 * 모두 status='applied' (= 자동선발 대상).
 *
 * 정원 100, 신청자 200 → 2배 경쟁률.
 * 카테고리 분포 (5:3:2 + 약간 변동): 중앙 80 / 광역 45 / 기초 35 / 공공 25 / 교육 10 / 기타 5
 *
 * usage:
 *   bun run scripts/seed-blue5-demo.ts          # dry-run
 *   bun run scripts/seed-blue5-demo.ts --apply  # 실제 삽입
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

const COHORT_ID = 'f046ddf8-c458-4bf4-a71d-3230bc798e8a';
const APPLY = process.argv.includes('--apply');

const SURNAMES = '김 이 박 최 정 강 조 윤 장 임 한 오 서 신 권 황 안 송 류 전 홍 고 문 양 손 배 백 허 유 남 심 노 하 곽 성 차 주 우'.split(/\s+/);
const GIVENS = '민수 지영 철호 수연 영준 은지 도현 서연 지훈 미라 다은 주원 하준 시우 유진 채원 지원 현서 준영 예린 가은 시현 태양 보경 인호 동현 영민 수빈 정훈 미경 광현 정민 재훈 혜진 다현 윤석 지은 준혁 영수 민호 세정 가람 태경 우진 유나 한별 도윤 진우 가현 효주 상민 보영 가영 현주 인성 승호 영진 미선'.split(/\s+/);

const DEPTS = '정보화담당관 디지털정부과 AI정책팀 데이터기획팀 디지털혁신과 행정정보과 정책기획관 운영지원과 기획예산담당관 인사혁신과 정보보안팀 빅데이터팀 디지털콘텐츠과 정보통신팀 디지털플랫폼과 사회혁신과 국제협력과 미래전략기획단 디지털전환추진단 데이터융합담당관 미래성장정책관 ICT기획과'.split(/\s+/);

const ORGS_CENTRAL = [
  '행정안전부','기획재정부','교육부','외교부','국방부','법무부','보건복지부','환경부','고용노동부','여성가족부',
  '국토교통부','해양수산부','농림축산식품부','산업통상자원부','문화체육관광부','과학기술정보통신부','통일부','국가보훈부',
  '국세청','관세청','조달청','통계청','대검찰청','경찰청','소방청','산림청','농촌진흥청','특허청','기상청','해양경찰청',
  '식품의약품안전처','법제처','인사혁신처','국무조정실',
  '공정거래위원회','금융위원회','국민권익위원회','개인정보보호위원회','방송통신위원회'
];
const ORGS_METRO = [
  '서울특별시','부산광역시','대구광역시','인천광역시','광주광역시','대전광역시','울산광역시','세종특별자치시',
  '경기도','강원특별자치도','충청북도','충청남도','전북특별자치도','전라남도','경상북도','경상남도','제주특별자치도'
];
const ORGS_LOCAL = [
  '서울특별시 강남구','서울특별시 마포구','서울특별시 송파구','서울특별시 종로구','서울특별시 성동구','서울특별시 영등포구',
  '부산광역시 해운대구','부산광역시 동래구','부산광역시 사하구',
  '인천광역시 연수구','인천광역시 부평구',
  '대구광역시 수성구','대구광역시 달서구',
  '광주광역시 동구','광주광역시 서구',
  '대전광역시 유성구','대전광역시 서구',
  '울산광역시 남구',
  '경기도 수원시','경기도 성남시','경기도 안양시','경기도 고양시','경기도 용인시','경기도 화성시','경기도 평택시','경기도 부천시',
  '강원특별자치도 춘천시','강원특별자치도 원주시',
  '충청북도 청주시','충청남도 천안시',
  '전북특별자치도 전주시','전라남도 여수시',
  '경상북도 포항시','경상북도 안동시',
  '경상남도 창원시','경상남도 김해시',
  '제주특별자치도 제주시','제주특별자치도 서귀포시'
];
const ORGS_PUBLIC = [
  '한국전력공사','국민건강보험공단','한국토지주택공사','한국가스공사','한국수자원공사','한국도로공사','한국철도공사',
  '한국공항공사','인천국제공항공사','국민연금공단','한국주택금융공사','한국관광공사','한국산업단지공단','한국환경공단',
  '한국전자통신연구원','한국과학기술연구원','한국개발연구원','한국보건사회연구원','한국교육과정평가원',
  '한국지능정보사회진흥원','한국문화예술위원회','영화진흥위원회','한국디자인진흥원','코레일유통','한국국제협력단','한국석유관리원'
];
const ORGS_EDU = [
  '서울특별시교육청','부산광역시교육청','인천광역시교육청','경기도교육청','강원특별자치도교육청','충청남도교육청',
  '전북특별자치도교육청','경상북도교육청','세종특별자치시교육청','종로구 교육지원청','강남구 교육지원청','수원교육지원청'
];
const ORGS_OTHER = [
  '국회사무처','국회예산정책처','대법원','헌법재판소','중앙선거관리위원회','국가인권위원회'
];

const PLANS = [
  '부서 내 정기 보고서 자동 초안 생성 워크플로를 설계하여 월간 보고 시간을 30% 절감하고자 한다.',
  '민원 자료 정리·요약 자동화를 시범 도입해 응대 속도와 일관성을 개선하겠다.',
  '공공데이터 기반 정책 인사이트 도출용 노코드 분석 파이프라인을 PoC로 구축할 계획이다.',
  '부서원 대상 AI 활용 가이드 워크숍을 분기별로 운영하여 조직 전체 적응력을 높이겠다.',
  '본 기관 RFP·기획안 초안 작성에 LLM을 활용하는 표준 프롬프트 템플릿을 마련하고자 한다.',
  '기관 내부 회의록 요약·액션아이템 추출을 자동화하여 회의 결과 공유 속도를 단축한다.',
  '시민 대상 정책 안내문 작성에 AI 보조를 도입해 가독성·정확성을 동시에 끌어올리겠다.',
  'AI 활용 사례집을 내부에 정리·배포하여 부서 간 best practice 확산을 추진하려 한다.',
  '본 과정에서 배운 데이터 기반 의사결정 프레임을 차년도 예산 기획 단계에서 적용해보겠다.',
  '개인정보 유출 위험을 줄이기 위한 LLM 활용 가이드라인을 부서 내 정착시키겠다.'
];

type Category = '①'|'②'|'③'|'④'|'⑤'|'⑥';

const ORG_POOL: Record<Category, string[]> = {
  '①': ORGS_CENTRAL,
  '②': ORGS_METRO,
  '③': ORGS_LOCAL,
  '④': ORGS_PUBLIC,
  '⑤': ORGS_EDU,
  '⑥': ORGS_OTHER
};

// 분포 — 200명 합계
const DISTRIBUTION: { cat: Category; count: number }[] = [
  { cat: '①', count: 80 },
  { cat: '②', count: 45 },
  { cat: '③', count: 35 },
  { cat: '④', count: 25 },
  { cat: '⑤', count: 10 },
  { cat: '⑥', count: 5 }
];

// C5 직군 가중치 — 공무원 다수는 행정
const C5_WEIGHTED: { key: string; w: number }[] = [
  { key: '①', w: 60 }, // 행정
  { key: '②', w: 15 }, // 전산
  { key: '③', w: 10 }, // 기술
  { key: '④', w: 5 },  // 특수
  { key: '⑤', w: 5 },  // 연구
  { key: '⑥', w: 3 },  // 보건
  { key: '⑦', w: 2 }   // 관리
];

// P1 사전학습 가중치
const P1_WEIGHTED: { key: string; w: number }[] = [
  { key: '①', w: 30 }, // 2개 이수
  { key: '②', w: 25 }, // AI만
  { key: '③', w: 25 }, // 데이터만
  { key: '④', w: 20 }  // 미수강
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function weightedPick(items: { key: string; w: number }[]): string {
  const sum = items.reduce((a, b) => a + b.w, 0);
  let r = Math.random() * sum;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it.key;
  }
  return items[0].key;
}
function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

type Persona = {
  name: string;
  org: string;
  dept: string;
  c2: Category;
  c5: string;
  p1: string;
  phone: string;
  email: string;
  knowledgeAccuracy: number;
  planText: string;
  planChars: number;
  u1Picks: string[];
};

// ---------- 페르소나 풀 생성 ----------
const personas: Persona[] = [];
const usedNameOrgKeys = new Set<string>();
let phoneIdx = 0;
for (const { cat, count } of DISTRIBUTION) {
  let made = 0;
  while (made < count) {
    const surname = pick(SURNAMES);
    const given = pick(GIVENS);
    const name = `${surname}${given}`;
    const org = pick(ORG_POOL[cat]);
    const key = `${org}|${name}`;
    if (usedNameOrgKeys.has(key)) continue;
    usedNameOrgKeys.add(key);

    const dept = pick(DEPTS);
    const c5 = weightedPick(C5_WEIGHTED);
    const p1 = weightedPick(P1_WEIGHTED);
    const knowledgeAccuracy = 0.35 + Math.random() * 0.6; // 0.35~0.95
    const planText = pick(PLANS);
    // 약간 변형해 글자수 분산
    const extra = Math.random() < 0.5 ? ' ' + pick(PLANS).slice(0, 30 + Math.floor(Math.random() * 60)) : '';
    const finalPlan = planText + extra;
    const planChars = finalPlan.length;

    const u1Count = 1 + Math.floor(Math.random() * 5); // 1~5개
    const u1Picks = pickN(['①','②','③','④','⑤','⑥'], u1Count);

    phoneIdx++;
    const phone = `010-${String(1000 + phoneIdx).padStart(4,'0')}-${String(2000 + phoneIdx * 37 % 9000).padStart(4,'0')}`;
    const email = `applicant${phoneIdx}@gov.kr`;

    personas.push({
      name, org, dept, c2: cat, c5, p1, phone, email,
      knowledgeAccuracy, planText: finalPlan, planChars, u1Picks
    });
    made++;
  }
}

console.log(`${APPLY ? '[APPLY]' : '[DRY-RUN]'} 페르소나 ${personas.length}명 생성`);
console.log('카테고리 분포:', Object.fromEntries(DISTRIBUTION.map(d => [d.cat, d.count])));

if (!APPLY) {
  console.log('\n샘플 5명:');
  for (const p of personas.slice(0, 5)) {
    console.log(`  [${p.c2}] ${p.name} | ${p.org} | ${p.dept} | acc=${p.knowledgeAccuracy.toFixed(2)} | plan=${p.planChars}자`);
  }
  console.log('\n--apply 로 실제 삽입');
  process.exit(0);
}

// ---------- application_questions 로드 ----------
const { data: qRows, error: qErr } = await s
  .from('application_questions')
  .select('id, section, question_no, question_type, choices, correct_choice, weight')
  .eq('cohort_id', COHORT_ID);
if (qErr) { console.error(qErr); process.exit(1); }
const questions = qRows!;
const qByNo = new Map(questions.map(q => [q.question_no, q]));

// ---------- organizations upsert ----------
const orgNames = [...new Set(personas.map(p => p.org))];
console.log(`\norganizations: ${orgNames.length}개 upsert...`);
const orgIdByName = new Map<string, string>();
for (const name of orgNames) {
  const { data: existing } = await s.from('organizations').select('id').eq('name', name).maybeSingle();
  if (existing) {
    orgIdByName.set(name, existing.id);
    continue;
  }
  const { data: inserted, error } = await s.from('organizations').insert({ name }).select('id').single();
  if (error) { console.error(`org insert fail ${name}:`, error); process.exit(1); }
  orgIdByName.set(name, inserted!.id);
}

// ---------- applicants + applications + answers ----------
let created = 0;
let skipped = 0;

for (const p of personas) {
  const orgId = orgIdByName.get(p.org)!;
  // C2 코드 → applicants.category 한글 라벨
  const C2_TO_LABEL: Record<Category, string> = {
    '①':'중앙부처','②':'광역지자체','③':'기초지자체','④':'공공기관','⑤':'교육행정기관','⑥':'기타'
  };

  // applicant: 같은 (name, org) 있으면 재사용. 없으면 insert.
  const { data: existing } = await s
    .from('applicants')
    .select('id')
    .eq('name', p.name)
    .eq('organization_id', orgId)
    .maybeSingle();
  let applicantId: string;
  if (existing) {
    applicantId = existing.id;
    await s.from('applicants').update({
      department: p.dept,
      job_role: ['행정','전산','기술','특수','연구','보건','관리'][['①','②','③','④','⑤','⑥','⑦'].indexOf(p.c5)] + '직렬',
      email: p.email, phone: p.phone,
      category: C2_TO_LABEL[p.c2]
    }).eq('id', applicantId);
  } else {
    const { data: ins, error } = await s.from('applicants').insert({
      name: p.name,
      organization_id: orgId,
      department: p.dept,
      job_role: ['행정','전산','기술','특수','연구','보건','관리'][['①','②','③','④','⑤','⑥','⑦'].indexOf(p.c5)] + '직렬',
      email: p.email,
      phone: p.phone,
      category: C2_TO_LABEL[p.c2]
    }).select('id').single();
    if (error) { console.error(`applicant insert fail ${p.name}:`, error); skipped++; continue; }
    applicantId = ins!.id;
  }

  // application — 동일 (applicant, cohort) 이미 있으면 스킵
  const { data: existingApp } = await s
    .from('applications')
    .select('id')
    .eq('applicant_id', applicantId)
    .eq('cohort_id', COHORT_ID)
    .maybeSingle();
  if (existingApp) { skipped++; continue; }

  const { data: appIns, error: appErr } = await s.from('applications').insert({
    applicant_id: applicantId,
    cohort_id: COHORT_ID,
    status: 'applied',
    applied_at: '2026-07-15'
  }).select('id').single();
  if (appErr) { console.error(`application insert fail ${p.name}:`, appErr); skipped++; continue; }
  const applicationId = appIns!.id;

  // 응답 생성
  const answers: { application_id: string; question_id: string; answer_value: unknown; is_correct: boolean | null; score: number | null }[] = [];
  let knowledgeScore = 0;
  let knowledgeCorrect = 0;
  let knowledgeTotal = 0;

  for (const q of questions) {
    let value: unknown = null;
    let isCorrect: boolean | null = null;
    let score: number | null = null;

    if (q.question_no === 'C1') value = '①';
    else if (q.question_no === 'C2') value = p.c2;
    else if (q.question_no === 'C3') value = `02-${2100 + Math.floor(Math.random()*900)}-${1000 + Math.floor(Math.random()*9000)}`;
    else if (q.question_no === 'C4') value = `${p.dept} / ${p.org}`;
    else if (q.question_no === 'C5') value = p.c5;
    else if (q.question_no === 'P1') value = p.p1;
    else if (q.question_no === 'U1') value = p.u1Picks;
    else if (q.question_no === 'Plan') value = p.planText;
    else if (q.section === 'knowledge' && q.correct_choice) {
      const correct = Math.random() < p.knowledgeAccuracy;
      const choices = (q.choices as { key: string }[]) ?? [];
      value = correct ? q.correct_choice : pick(choices.filter(c => c.key !== q.correct_choice)).key;
      isCorrect = correct;
      score = correct ? q.weight : 0;
      knowledgeTotal++;
      if (correct) { knowledgeCorrect++; knowledgeScore += q.weight; }
    }

    answers.push({
      application_id: applicationId,
      question_id: q.id,
      answer_value: value as never,
      is_correct: isCorrect,
      score
    });
  }

  const { error: ansErr } = await s.from('application_answers').insert(answers);
  if (ansErr) { console.error(`answers insert fail ${p.name}:`, ansErr); skipped++; continue; }

  await s.from('applications').update({
    knowledge_score: knowledgeScore,
    knowledge_correct_count: knowledgeCorrect,
    knowledge_total_count: knowledgeTotal
  }).eq('id', applicationId);

  created++;
  if (created % 25 === 0) console.log(`  진행 ${created}/${personas.length}`);
}

console.log(`\n완료 — 생성 ${created}, 스킵 ${skipped}`);
