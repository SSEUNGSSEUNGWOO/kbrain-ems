// organizations.category 자동 분류.
// 룰: 이름 패턴으로 6개 카테고리 추정.
//   central(중앙부처) / metro(광역지자체) / local(기초지자체) / edu(교육청) / public(공공기관) / other(기타)
// 멱등성: 매번 모든 row 재분류해 update. 운영자가 UI에서 수정한 값도 덮어쓰므로 주의.
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

const ONLY_NULL = process.argv.includes('--only-null');

export function classifyOrg(name: string): string {
  const n = name.trim();

  // 교육청 우선
  if (n.endsWith('교육청')) return 'edu';

  // 명시 케이스
  if (n === '케이브레인') return 'other';
  if (n.startsWith('국립')) return 'central';

  // 광역지자체 (단독)
  if (/^[가-힣]+(특별시|광역시|특별자치시|특별자치도|도)$/.test(n)) return 'metro';

  // 기초지자체 — 광역 + 공백 + 시·군·구로 끝
  if (/^[가-힣]+(특별시|광역시|특별자치시|특별자치도|도|시)\s+[가-힣\d ]+(시|군|구)$/.test(n)) {
    return 'local';
  }
  // 단독 시·군·구
  if (/^[가-힣]+(시|군|구)$/.test(n) && !/(특별시|광역시|특별자치시)$/.test(n)) {
    return 'local';
  }

  // 경찰청 산하
  if (n === '경찰청' || n.startsWith('경찰청 ')) return 'central';

  // 중앙 정부조직 — 부·청·처·본부 (마지막 토큰 단독)
  if (/(부|청|처|본부)$/.test(n)) return 'central';

  // 공공기관 — 한국* / 코레일* / 우체국* / 공사·공단·진흥원·개발원·협력단 등
  if (
    n.startsWith('한국') ||
    n.startsWith('코레일') ||
    n.startsWith('우체국') ||
    /(공사|공단|진흥원|진흥공단|개발원|협력단|연구원|연구소)$/.test(n)
  ) {
    return 'public';
  }

  // 광역 prefix만 있고 분류 안 됨 → 기초로 추정 (산하 조직)
  if (/^[가-힣]+(특별시|광역시|특별자치시|특별자치도|도)\s+/.test(n)) return 'local';

  return 'other';
}

const { data: orgs } = await s.from('organizations').select('id, name, category').order('name');
if (!orgs) {
  console.error('조회 실패');
  process.exit(1);
}

const CATEGORY_LABEL: Record<string, string> = {
  central: '중앙부처',
  metro: '광역지자체',
  local: '기초지자체',
  edu: '교육청',
  public: '공공기관',
  other: '기타'
};

let updated = 0;
let unchanged = 0;
const byCategory = new Map<string, string[]>();

for (const o of orgs) {
  if (ONLY_NULL && o.category) continue;
  const cat = classifyOrg(o.name);
  byCategory.set(cat, [...(byCategory.get(cat) ?? []), o.name]);
  if (o.category === cat) {
    unchanged += 1;
    continue;
  }
  await s.from('organizations').update({ category: cat }).eq('id', o.id);
  updated += 1;
}

console.log(`\n=== 분류 결과 ===\n`);
for (const cat of ['central', 'metro', 'local', 'edu', 'public', 'other']) {
  const list = byCategory.get(cat) ?? [];
  if (list.length === 0) continue;
  console.log(`\n[${CATEGORY_LABEL[cat]}] ${list.length}개`);
  for (const n of list) console.log(`  ${n}`);
}

console.log(`\n완료 — 갱신 ${updated}, 변경없음 ${unchanged} / 전체 ${orgs.length}`);
