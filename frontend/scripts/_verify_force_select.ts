import { recommendByQuotas, type CandidateRow } from '../src/app/dashboard/cohorts/[cohortId]/applications/_selection-logic';
let id = 0;
const mk = (org: string, ks: number, opts: Partial<CandidateRow> = {}): CandidateRow => ({
  application_id: `app-${++id}`, applicant_id: `appl-${id}`, name: `${org}-${ks}`,
  organization: org, category: 'central', knowledge_score: ks,
  plan_char_count: 100, plan_text: 'x'.repeat(100),
  multi_selected_count: 0, multi_choices_max: 0,
  prereq_done_count: 0, prereq_max: 2, has_cert: false,
  current_status: 'applied', other_applications: [], prior_certs: [],
  force_select: false, force_reason: null,
  ...opts
});
const candidates = [
  mk('A', 100, { prereq_done_count: 2, has_cert: true }),
  mk('B', 50, { prereq_done_count: 2, has_cert: true }),
  mk('C', 0, { force_select: true, force_reason: '전문인재' }),
  mk('D', 90, { prereq_done_count: 0, has_cert: false })
];
const { selectedIds } = recommendByQuotas(
  candidates, { knowledge: 50, plan: 50 }, 3, 100,
  { central: 10, local: 0, public_edu: 0 }, 0, true, 0, true
);
const byId = new Map(candidates.map((c) => [c.application_id, c.name]));
console.log('선발:', selectedIds.map((i) => byId.get(i)));
console.log('기대: A-100, B-50, C-0 (C는 force_select로 필터 통과)');
