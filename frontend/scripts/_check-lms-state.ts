import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // 전체 lms_completions를 course_code 기준으로 그룹화
  type Row = {
    course_code: string;
    course_name: string;
    certificate_no: string | null;
    created_at: string;
    updated_at: string;
  };
  const all: Row[] = [];
  const CHUNK = 1000;
  for (let from = 0; from < 1_000_000; from += CHUNK) {
    const res = (await supabase
      .from('lms_completions')
      .select('course_code, course_name, certificate_no, created_at, updated_at')
      .range(from, from + CHUNK - 1)) as unknown as { data: Row[] | null };
    const batch = res.data ?? [];
    all.push(...batch);
    if (batch.length < CHUNK) break;
  }
  console.log(`total lms_completions: ${all.length}`);

  // 그룹: course_code 기준 (몇 명, 가장 오래된 cert·가장 최근 cert·sample course_name)
  const byCode = new Map<
    string,
    {
      count: number;
      withCert: number;
      noCert: number;
      sampleName: string;
      oldestCreated: string;
      newestUpdated: string;
      certSamples: string[];
    }
  >();
  for (const r of all) {
    const e = byCode.get(r.course_code);
    if (e) {
      e.count++;
      if (r.certificate_no) e.withCert++;
      else e.noCert++;
      if (r.created_at < e.oldestCreated) e.oldestCreated = r.created_at;
      if (r.updated_at > e.newestUpdated) e.newestUpdated = r.updated_at;
      if (r.certificate_no && e.certSamples.length < 3) e.certSamples.push(r.certificate_no);
    } else {
      byCode.set(r.course_code, {
        count: 1,
        withCert: r.certificate_no ? 1 : 0,
        noCert: r.certificate_no ? 0 : 1,
        sampleName: r.course_name,
        oldestCreated: r.created_at,
        newestUpdated: r.updated_at,
        certSamples: r.certificate_no ? [r.certificate_no] : []
      });
    }
  }
  console.log('\nby course_code:');
  for (const [code, info] of [...byCode.entries()].sort()) {
    console.log(`  ${code.padEnd(20)} count=${info.count} withCert=${info.withCert} noCert=${info.noCert}`);
    console.log(`    course_name: "${info.sampleName}"`);
    console.log(`    oldest_created: ${info.oldestCreated.slice(0, 19)}`);
    console.log(`    newest_updated: ${info.newestUpdated.slice(0, 19)}`);
    console.log(`    cert samples: ${info.certSamples.join(', ')}`);
  }

  // ai_literacy / data_literacy 의 신규 vs 이전 데이터 비교
  for (const code of ['ai_literacy', 'data_literacy']) {
    const rows = all.filter((r) => r.course_code === code);
    const today = new Date().toISOString().slice(0, 10);
    const createdToday = rows.filter((r) => r.created_at.startsWith(today)).length;
    const createdBefore = rows.filter((r) => !r.created_at.startsWith(today)).length;
    console.log(
      `\n  ${code}: total=${rows.length} created_today=${createdToday} created_before=${createdBefore}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
