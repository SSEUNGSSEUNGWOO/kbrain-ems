// 변경된 recommendByQuotas의 progressive cap 동작 검증.
// 시나리오: 모두 central 카테고리, 정원 6 / 8 / 12 케이스에서
// 풀 얕은 기관(C~J 각 1명)이 풀 깊은 기관(A 5명, B 3명)보다 자리를 보장받는지 확인.
import {
  recommendByQuotas,
  type CandidateRow
} from '../src/app/dashboard/cohorts/[cohortId]/applications/_selection-logic';

let id = 0;
function makeCand(org: string, knowledgeScore: number): CandidateRow {
  return {
    application_id: `app-${++id}`,
    applicant_id: `appl-${id}`,
    name: `${org}-${knowledgeScore}`,
    organization: org,
    category: 'central',
    knowledge_score: knowledgeScore,
    plan_char_count: 100,
    plan_text: 'x'.repeat(100),
    multi_selected_count: 0,
    multi_choices_max: 0,
    prereq_done_count: 0,
    prereq_max: 0,
    current_status: 'applied',
    other_applications: [],
    prior_certs: []
  };
}

const candidates: CandidateRow[] = [
  // A 기관 5명
  makeCand('A', 100),
  makeCand('A', 95),
  makeCand('A', 90),
  makeCand('A', 85),
  makeCand('A', 80),
  // B 기관 3명
  makeCand('B', 99),
  makeCand('B', 94),
  makeCand('B', 89),
  // C~J 각 1명
  makeCand('C', 50),
  makeCand('D', 45),
  makeCand('E', 40),
  makeCand('F', 35),
  makeCand('G', 30),
  makeCand('H', 25),
  makeCand('I', 20),
  makeCand('J', 15)
];

for (const capacity of [6, 8, 12]) {
  console.log(`\n${'='.repeat(70)}\n정원 ${capacity}명 · maxPerOrg=2 · 모두 central\n${'='.repeat(70)}`);
  const { selectedIds, scored } = recommendByQuotas(
    candidates,
    { knowledge: 100, plan: 0 }, // 지식점수만 (정성평가 무시)
    capacity,
    100, // knowledgeMax
    { central: 10, local: 0, public_edu: 0 }, // 모두 central
    2, // maxPerOrg
    false,
    0
  );
  const orgCount = new Map<string, number>();
  for (const c of scored) {
    if (selectedIds.includes(c.application_id)) {
      orgCount.set(c.organization!, (orgCount.get(c.organization!) ?? 0) + 1);
    }
  }
  const selectedNames = scored
    .filter((c) => selectedIds.includes(c.application_id))
    .map((c) => c.name)
    .join(', ');
  const orgSummary = [...orgCount.entries()]
    .toSorted((a, b) => a[0].localeCompare(b[0]))
    .map(([org, n]) => `${org}:${n}`)
    .join(' ');
  console.log(`  selected (${selectedIds.length}): ${selectedNames}`);
  console.log(`  by org: ${orgSummary}`);
}
