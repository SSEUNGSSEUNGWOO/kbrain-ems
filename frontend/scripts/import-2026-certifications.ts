/**
 * 2026년 AI챔피언 인증 명단(종합) → applicants.prior_certs 적재.
 *
 * 대상 파일: "2026년 AI챔피언 인증 명단_종합(~N월).xlsx" (그린·블루 시트, 연락처 없음)
 * 매칭: 이름 유일 → 확정 / 동명이인 → 기관명 포함 매칭 → 트랙 기수 선발 이력 교차확인
 *       → 그래도 애매하면 MANUAL_MAP 수동 지정 필요 (미지정 시 skip + 보고)
 * 명단에만 있고 applicants에 없는 사람은 신규 INSERT (2025 스크립트와 동일 정책).
 * cert_no 기준 dedupe — 매달 새 종합본으로 재실행해도 안전(멱등).
 *
 * 실행 (frontend/):
 *   bun run scripts/import-2026-certifications.ts "C:/path/to/종합.xlsx"           # dry-run
 *   bun run scripts/import-2026-certifications.ts "C:/path/to/종합.xlsx" --apply   # 실제 적재
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8');
const getEnv = (k: string) =>
  env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '') ?? '';
const supabase = createClient(getEnv('NEXT_PUBLIC_SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false }
});

const FILE = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!FILE) {
  console.error('사용법: bun run scripts/import-2026-certifications.ts <종합명단.xlsx> [--apply]');
  process.exit(1);
}

// 동명이인 자동 확정 실패분 수동 매핑: cert_no → applicant_id
const MANUAL_MAP: Record<string, string> = {
  // 한국동서발전(주) 동일인 중복 applicant 2건 중 선등록 row (병합은 추후 merge-duplicate-applicants.ts)
  '2026-BC0345': 'e6436900-c267-4ce9-8fee-ec4f8014858c'
};

type PriorCert = {
  year: number;
  cert_no: string;
  track: string;
  round: number | null;
  kind: string | null;
  event: string | null;
  organization: string | null;
  cert_name: string;
};

type ExcelRow = {
  name: string;
  orgCategory: string;
  track: 'green' | 'blue';
  kind: string;
  round: number | null;
  org: string;
  certNo: string;
};

function parseExcel(path: string): ExcelRow[] {
  const wb = XLSX.readFile(path);
  const out: ExcelRow[] = [];
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[sn], {
      header: 1,
      defval: ''
    });
    for (const r of rows) {
      const certNo = String(r[7] ?? '').trim();
      if (!/^2026-[A-Z]{2}\d{4}$/.test(certNo)) continue; // 헤더·제목행 제외
      const trackLabel = String(r[3]).trim();
      const track = trackLabel === '그린' ? 'green' : trackLabel === '블루' ? 'blue' : null;
      if (!track) {
        console.warn(`알 수 없는 인증구분 "${trackLabel}" — ${certNo} skip`);
        continue;
      }
      const roundMatch = String(r[5]).match(/(\d+)/);
      out.push({
        name: String(r[1]).trim(),
        orgCategory: String(r[2]).trim(),
        track,
        kind: String(r[4]).trim(),
        round: roundMatch ? Number(roundMatch[1]) : null,
        org: String(r[6]).trim(),
        certNo
      });
    }
  }
  return out;
}

async function fetchAllApplicants() {
  const all: {
    id: string;
    name: string;
    prior_certs: PriorCert[] | null;
    organizations: { name: string } | null;
  }[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = (await supabase
      .from('applicants')
      .select('id, name, prior_certs, organizations(name)')
      .range(off, off + 999)) as unknown as {
      data: (typeof all)[number][] | null;
      error: { message: string } | null;
    };
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return all;
}

/** 동명이인 후보 중 "해당 트랙 2026 기수에 선발된 이력"이 있는 사람으로 좁힘 */
async function disambiguateByTrackSelection(
  candidateIds: string[],
  trackLabel: string
): Promise<string | null> {
  const { data } = await supabase
    .from('applications')
    .select('applicant_id, status, cohorts(name)')
    .in('applicant_id', candidateIds)
    .eq('status', 'selected');
  const hits = new Set<string>();
  for (const a of data ?? []) {
    const cohortName = (a as unknown as { cohorts: { name: string } | null }).cohorts?.name ?? '';
    if (cohortName.includes(trackLabel)) hits.add(a.applicant_id as string);
  }
  return hits.size === 1 ? [...hits][0] : null;
}

async function main() {
  const excel = parseExcel(FILE);
  const trackCount = { green: 0, blue: 0 };
  for (const r of excel) trackCount[r.track]++;
  console.log(
    `엑셀 파싱: ${excel.length}건 (그린 ${trackCount.green} / 블루 ${trackCount.blue}) — ${APPLY ? 'APPLY' : 'DRY-RUN'}`
  );

  const applicants = await fetchAllApplicants();
  const byName = new Map<string, typeof applicants>();
  for (const a of applicants) {
    const list = byName.get(a.name) ?? [];
    list.push(a);
    byName.set(a.name, list);
  }
  const byId = new Map(applicants.map((a) => [a.id, a]));

  // 매칭 — 같은 사람의 그린·블루 복수 인증을 한 번에 머지하기 위해 applicant 단위로 그룹
  const certsByApplicant = new Map<string, ExcelRow[]>();
  const newPeople: ExcelRow[] = []; // applicants에 없음 → INSERT
  const unresolved: { row: ExcelRow; candidates: string[] }[] = [];
  let viaUnique = 0;
  let viaOrg = 0;
  let viaTrack = 0;
  let viaManual = 0;

  for (const row of excel) {
    if (MANUAL_MAP[row.certNo]) {
      viaManual++;
      const list = certsByApplicant.get(MANUAL_MAP[row.certNo]) ?? [];
      list.push(row);
      certsByApplicant.set(MANUAL_MAP[row.certNo], list);
      continue;
    }
    const cands = byName.get(row.name) ?? [];
    let matchedId: string | null = null;
    if (cands.length === 1) {
      matchedId = cands[0].id;
      viaUnique++;
    } else if (cands.length > 1) {
      const orgHit = cands.filter((c) => c.organizations?.name && row.org.includes(c.organizations.name));
      if (orgHit.length === 1) {
        matchedId = orgHit[0].id;
        viaOrg++;
      } else {
        const trackLabel = row.track === 'green' ? '그린' : '블루';
        matchedId = await disambiguateByTrackSelection(
          cands.map((c) => c.id),
          trackLabel
        );
        if (matchedId) viaTrack++;
        else {
          unresolved.push({ row, candidates: cands.map((c) => c.id) });
          continue;
        }
      }
    } else {
      newPeople.push(row);
      continue;
    }
    const list = certsByApplicant.get(matchedId) ?? [];
    list.push(row);
    certsByApplicant.set(matchedId, list);
  }

  console.log(
    `\n매칭: 이름 유일 ${viaUnique} / 기관 확정 ${viaOrg} / 트랙 선발이력 확정 ${viaTrack} / 수동 ${viaManual}`
  );
  console.log(`신규 INSERT 대상: ${newPeople.length}건 / 미확정: ${unresolved.length}건`);

  if (unresolved.length > 0) {
    console.log('\n=== 미확정 (MANUAL_MAP에 cert_no → applicant_id 추가 필요) ===');
    for (const { row, candidates } of unresolved) {
      console.log(`  ${row.certNo} ${row.name} | ${row.org}`);
      for (const id of candidates) {
        const c = byId.get(id)!;
        console.log(`    후보: ${id} (${c.organizations?.name ?? '기관없음'})`);
      }
    }
  }

  const trackLabelMap = { green: '그린', blue: '블루' } as const;
  const toCert = (r: ExcelRow): PriorCert => ({
    year: 2026,
    cert_no: r.certNo,
    track: r.track,
    round: r.round,
    kind: r.kind || null,
    event: null,
    organization: r.org || null,
    cert_name: `2026년 AI챔피언 ${trackLabelMap[r.track]}`
  });

  let patched = 0;
  let certAdded = 0;
  let dupSkipped = 0;
  for (const [applicantId, rows] of certsByApplicant) {
    const existing = byId.get(applicantId)?.prior_certs ?? [];
    const existingNos = new Set(existing.map((c) => c.cert_no));
    const additions = rows.filter((r) => {
      if (existingNos.has(r.certNo)) {
        dupSkipped++;
        return false;
      }
      return true;
    });
    if (additions.length === 0) continue;
    patched++;
    certAdded += additions.length;
    if (APPLY) {
      const { error } = await supabase
        .from('applicants')
        .update({ prior_certs: [...existing, ...additions.map(toCert)] })
        .eq('id', applicantId);
      if (error) throw new Error(`PATCH ${applicantId}: ${error.message}`);
    }
  }

  let inserted = 0;
  const newByName = new Map<string, ExcelRow[]>();
  for (const r of newPeople) {
    const list = newByName.get(r.name) ?? [];
    list.push(r);
    newByName.set(r.name, list);
  }
  for (const [name, rows] of newByName) {
    inserted++;
    certAdded += rows.length;
    console.log(`  신규: ${name} (${rows.map((r) => r.certNo).join(', ')}) | ${rows[0].org}`);
    if (APPLY) {
      const { error } = await supabase
        .from('applicants')
        .insert({ name, prior_certs: rows.map(toCert) });
      if (error) throw new Error(`INSERT ${name}: ${error.message}`);
    }
  }

  console.log(`\n=== 결과 (${APPLY ? '적용됨' : 'dry-run'}) ===`);
  console.log(`  기존 applicant 업데이트: ${patched}명`);
  console.log(`  신규 등록:              ${inserted}명`);
  console.log(`  추가된 인증:            ${certAdded}건`);
  console.log(`  중복 skip:              ${dupSkipped}건`);
  console.log(`  미확정 skip:            ${unresolved.length}건`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
