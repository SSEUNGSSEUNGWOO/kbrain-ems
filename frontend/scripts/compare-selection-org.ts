// 선발 명단 xlsx vs 우리 시스템 소속 — 진짜 오류만 가려서 보고
// 분류:
//   [REAL_DIFF]   둘 다 값 있는데 prefix도 아님 = 진짜 다른 소속
//   [MISSING]     xlsx에 있는데 우리에 없음 (학생 자체 누락)
//   [GHOST]       우리에 있는데 xlsx에 없음 (잘못 등록 가능성)
//   [DUP]         동명이인 — 매칭 모호
//   [PREFIX_OK]   xlsx가 우리 org를 prefix로 포함 = 정규화 차이 (정상)
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

type Row = { name: string; title: string; org: string };
const data = JSON.parse(
  fs.readFileSync('C:/Users/USER/AppData/Local/Temp/selection-xlsx.json', 'utf8')
) as Record<string, Row[]>;

const SHEET_TO_COHORT: Record<string, string> = {};
for (const sn of Object.keys(data)) {
  let c = '';
  if (sn.includes('그린') && sn.includes('1회차')) c = 'AI 챔피언 그린 1회차';
  else if (sn.includes('블루') && sn.includes('2회차')) c = 'AI 챔피언 블루 2회차';
  else if (sn.includes('AI리터러시') || sn.includes('리터러시와')) c = 'AI 리터러시와 업무활용';
  else if (sn.includes('생성형') || sn.includes('노코드')) c = '생성형 AI 활용 노코드 데이터분석';
  else if (sn.includes('데이터 리터러시') || sn.includes('데이터리터러시')) c = '데이터 리터러시';
  else if (sn.includes('AI 행정') || sn.includes('AI행정')) c = 'AI 행정 융합 기획';
  SHEET_TO_COHORT[sn] = c;
}

const norm = (x: string) =>
  (x ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\(주\)/g, '㈜')
    .trim();

// xlsx_org가 our_org를 prefix로 포함하면 정규화 차이(정상)
function isPrefixOK(xlsxOrg: string, ourOrg: string): boolean {
  if (!ourOrg) return false;
  const x = norm(xlsxOrg);
  const o = norm(ourOrg);
  if (x === o) return true;
  // 공백 정규화 후 startsWith 또는 substring 비교
  return x.replace(/\s/g, '').startsWith(o.replace(/\s/g, ''));
}

type Issue = { type: string; name: string; xlsxOrg?: string; ourOrg?: string; phone?: string };
const issues: Record<string, Issue[]> = {};

for (const [sn, rows] of Object.entries(data)) {
  const cohortName = SHEET_TO_COHORT[sn];
  if (!cohortName) continue;
  issues[cohortName] = [];

  const { data: cohort } = await s.from('cohorts').select('id').eq('name', cohortName).maybeSingle();
  if (!cohort) continue;

  const { data: stu } = await s
    .from('students')
    .select('id, name, phone, organizations(name)')
    .eq('cohort_id', cohort.id)
    .not('name', 'ilike', '테스트%');
  if (!stu) continue;

  // 동명이인 체크
  const dupNames = new Set<string>();
  const counts = new Map<string, number>();
  for (const r of stu) counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
  for (const [n, c] of counts) if (c > 1) dupNames.add(n);
  const xlsxCounts = new Map<string, number>();
  for (const r of rows) xlsxCounts.set(r.name, (xlsxCounts.get(r.name) ?? 0) + 1);
  for (const [n, c] of xlsxCounts) if (c > 1) dupNames.add(n);

  const stuByName = new Map<string, typeof stu[0]>();
  for (const r of stu) stuByName.set(r.name, r);

  // 1) xlsx 행 기준
  for (const xrow of rows) {
    if (dupNames.has(xrow.name)) {
      issues[cohortName].push({ type: 'DUP', name: xrow.name, xlsxOrg: xrow.org });
      continue;
    }
    const stuRow = stuByName.get(xrow.name);
    if (!stuRow) {
      issues[cohortName].push({ type: 'MISSING', name: xrow.name, xlsxOrg: xrow.org });
      continue;
    }
    const ourOrg = (stuRow.organizations as any)?.name ?? '';
    if (!isPrefixOK(xrow.org, ourOrg)) {
      issues[cohortName].push({
        type: 'REAL_DIFF',
        name: xrow.name,
        xlsxOrg: xrow.org,
        ourOrg,
        phone: stuRow.phone ?? ''
      });
    }
  }

  // 2) 우리 학생 중 xlsx에 없는 사람
  const xlsxNameSet = new Set(rows.map(r => r.name));
  for (const r of stu) {
    if (dupNames.has(r.name)) continue;
    if (!xlsxNameSet.has(r.name)) {
      issues[cohortName].push({
        type: 'GHOST',
        name: r.name,
        ourOrg: (r.organizations as any)?.name ?? '',
        phone: r.phone ?? ''
      });
    }
  }
}

// 출력
const ORDER = ['REAL_DIFF', 'MISSING', 'GHOST', 'DUP'];
const LABEL: Record<string, string> = {
  REAL_DIFF: '❌ 진짜 소속 다름 (prefix 관계 아님)',
  MISSING: '⚠ xlsx에 있는데 우리에 없음 (등록 누락 후보)',
  GHOST: '⚠ 우리에 있는데 xlsx에 없음 (잘못 등록 후보)',
  DUP: '🔁 동명이인 (수동 확인 필요)'
};

let grand = 0;
for (const [cohort, items] of Object.entries(issues)) {
  console.log(`\n========== ${cohort} ==========`);
  if (items.length === 0) {
    console.log('  ✓ 이상 없음');
    continue;
  }
  for (const t of ORDER) {
    const sub = items.filter(x => x.type === t);
    if (sub.length === 0) continue;
    console.log(`\n  ${LABEL[t]} (${sub.length}건)`);
    for (const i of sub) {
      if (t === 'REAL_DIFF') {
        console.log(`    ${i.name.padEnd(8)} | xlsx: ${i.xlsxOrg}`);
        console.log(`             | 우리:  ${i.ourOrg}  (phone ${i.phone})`);
      } else if (t === 'MISSING') {
        console.log(`    ${i.name.padEnd(8)} | ${i.xlsxOrg}`);
      } else if (t === 'GHOST') {
        console.log(`    ${i.name.padEnd(8)} | ${i.ourOrg} | ${i.phone}`);
      } else {
        console.log(`    ${i.name.padEnd(8)} | xlsx: ${i.xlsxOrg ?? '-'}`);
      }
    }
    grand += sub.length;
  }
}

console.log(`\n\n=== 합계 ===  총 이슈: ${grand}건`);
for (const t of ORDER) {
  const cnt = Object.values(issues).flat().filter(x => x.type === t).length;
  console.log(`  ${LABEL[t]}: ${cnt}`);
}
