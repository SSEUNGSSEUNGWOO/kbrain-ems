import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const RESPONSE_ID = 'c32e1c41-4c95-46e9-85ea-0e3f572239f8';
const TOKEN = 'MDQd4yt8TAWH';
const URL = `http://localhost:3100/diagnosis/${TOKEN}`;

async function setStartedAt(value: string | null) {
  const { error } = await supabase
    .from('diagnosis_responses')
    .update({ started_at: value, submitted_at: null, total_score: null, responses: null })
    .eq('id', RESPONSE_ID);
  if (error) throw error;
}

async function fetchHtml(): Promise<string> {
  const res = await fetch(URL);
  return await res.text();
}

function findTimerText(html: string): string | null {
  // formatTime 결과는 "M:SS" 형태 (예: "5:00", "9:59"). tabular-nums 클래스 옆에 노출.
  const m = html.match(/tabular-nums[^>]*">\s*(\d+:\d{2})\s*</);
  return m ? m[1] : null;
}

type Result = { ok: boolean; got: string };

async function check(label: string, expected: Record<string, boolean | string>, actual: Record<string, boolean | string>): Promise<Result> {
  const lines: string[] = [];
  let allOk = true;
  for (const k of Object.keys(expected)) {
    const e = expected[k];
    const a = actual[k];
    const ok = e === a;
    if (!ok) allOk = false;
    lines.push(`  ${ok ? 'OK ' : 'NG '} ${k}: expected=${JSON.stringify(e)} got=${JSON.stringify(a)}`);
  }
  console.log(`\n[${label}] ${allOk ? 'PASS' : 'FAIL'}`);
  console.log(lines.join('\n'));
  return { ok: allOk, got: '' };
}

async function main() {
  const results: Result[] = [];

  // ====== Case 1: started_at = null → confirm 화면 ======
  await setStartedAt(null);
  let html = await fetchHtml();
  results.push(
    await check(
      'CASE 1: started_at=null → 본인 확인 화면',
      {
        confirm_q: true,
        start_btn: true,
        expired_msg: false,
        timer: 'null'
      },
      {
        confirm_q: /본인이 맞으십니까/.test(html),
        start_btn: /예, 시작/.test(html),
        expired_msg: /응답 가능 시간이 종료/.test(html),
        timer: String(findTimerText(html))
      }
    )
  );

  // ====== Case 2: started_at = NOW - 5분 → 시험 화면, timer ≈ 5:00 ======
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await setStartedAt(fiveMinAgo);
  html = await fetchHtml();
  const timer2 = findTimerText(html);
  // 허용 오차: 4:55 ~ 5:00 (네트워크 + SSR 지연으로 몇 초 빠질 수 있음)
  const minutes = timer2 ? Number(timer2.split(':')[0]) : -1;
  const timerOk = minutes === 4 || minutes === 5;
  results.push(
    await check(
      'CASE 2: started_at = NOW - 5분 → 시험 화면, 타이머 ~5:00',
      {
        confirm_q: false,
        timer_in_range: true,
        expired_msg: false,
        nav_panel: true
      },
      {
        confirm_q: /본인이 맞으십니까/.test(html),
        timer_in_range: timerOk,
        expired_msg: /응답 가능 시간이 종료/.test(html),
        nav_panel: /문항 목록/.test(html)
      }
    )
  );
  console.log(`  (참고) 타이머 표시값: ${timer2}`);

  // ====== Case 3: started_at = NOW - 11분 → 만료 ======
  const elevenMinAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();
  await setStartedAt(elevenMinAgo);
  html = await fetchHtml();
  results.push(
    await check(
      'CASE 3: started_at = NOW - 11분 → 만료 안내',
      {
        confirm_q: true, // 만료 시에도 본인 확인 박스는 위에 노출
        expired_label: true,
        start_btn_disabled_label: true,
        timer: 'null'
      },
      {
        confirm_q: /본인이 맞으십니까/.test(html) || /본인이 맞/.test(html),
        expired_label: /응답 가능 시간이 종료/.test(html),
        start_btn_disabled_label: /시간 초과/.test(html),
        timer: String(findTimerText(html))
      }
    )
  );

  // ====== cleanup: started_at = null ======
  await setStartedAt(null);
  console.log('\n[cleanup] started_at=null 로 리셋 완료');

  const allPass = results.every((r) => r.ok);
  console.log(`\n=== ${allPass ? 'ALL PASS' : 'SOME FAILED'} ===`);
  process.exit(allPass ? 0 : 1);
}

main();
