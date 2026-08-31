/**
 * 운영 DB → 개발 DB 단방향 동기화.
 *
 * 개발 DB 는 운영을 복제한 스냅샷이라 시간이 지나면 어긋난다. 2026-08-31 확인 시
 * 그린 6회차가 개발 110명 / 운영 108명이었다. 운영에서 취소된 인원이 개발에 남아 있고,
 * 복제 이후 운영에 새로 등록된 인원이 개발에 없어서 생긴 차이다. 개발 화면 숫자를
 * 실제로 착각하는 일을 막으려면 필요할 때 다시 맞출 수단이 있어야 한다.
 *
 * 운영에는 GET 만 나간다 (assertReadOnly). 쓰기는 개발 DB 에만 한다.
 *
 *   node scripts/sync-prod-to-dev.mjs              차이만 보고, 아무것도 바꾸지 않음
 *   node scripts/sync-prod-to-dev.mjs --apply      실제로 개발 DB 를 운영과 일치시킴
 *   node scripts/sync-prod-to-dev.mjs --only=students,applicants   특정 테이블만
 */

import { readFileSync } from 'node:fs';

const PROD_ENV = '.env.local.prod-backup';
const DEV_ENV = '.env.local';
const PAGE = 1000; // PostgREST 기본 상한

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ONLY = args.find((a) => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean) ?? null;

/**
 * 개발 DB 의 연락처는 2026-08-21 에 일괄 마스킹돼 있다 (test####@example.test / 010-0000-####).
 * 운영 값을 그대로 가져오면 이 마스킹이 풀려 개발 DB 에 실제 연락처가 들어가고,
 * 개발 중 실수로 발송하면 교육생에게 실제로 문자가 간다. 동기화 대상에서 제외한다.
 *
 * 새 행은 실제 연락처 대신 마스킹 값을 넣는다 (maskRow).
 */
const CONTACT_COLUMNS = ['email', 'personal_email', 'phone', 'phone_last4', 'mobile', 'tel'];

let maskSeq = Date.now() % 100000;
function maskRow(row, cols) {
  const out = { ...row };
  let stamped = false;
  for (const c of cols) {
    if (!(c in out) || out[c] == null) continue;
    if (!stamped) {
      maskSeq++;
      stamped = true;
    }
    if (c === 'phone_last4') out[c] = String(maskSeq).slice(-4);
    else if (/email/i.test(c)) out[c] = `sync${maskSeq}@example.test`;
    else out[c] = `010-0000-${String(maskSeq).slice(-4)}`;
  }
  return out;
}

function loadEnv(file) {
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('=') || line.trimStart().startsWith('#')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const url = out.NEXT_PUBLIC_SUPABASE_URL;
  const key = out.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(`${file} 에 URL 또는 서비스 키가 없다`);
  return { url, key, ref: url.split('//')[1].split('.')[0] };
}

/** 운영 커넥션. GET 이외의 메서드는 코드 레벨에서 막는다. */
function readOnlyClient({ url, key }) {
  return async (path, init = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      throw new Error(`운영 DB 에 ${method} 시도 — 차단됨`);
    }
    return fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, ...(init.headers ?? {}) }
    });
  };
}

function writeClient({ url, key }) {
  return async (path, init = {}) =>
    fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      }
    });
}

/** OpenAPI 스펙에서 테이블 목록·PK·외래키를 읽는다. */
async function introspect(call) {
  const spec = await (await call('')).json();
  const defs = spec.definitions ?? {};
  const tables = {};
  for (const [name, def] of Object.entries(defs)) {
    const cols = Object.entries(def.properties ?? {});
    const pk = cols.filter(([, c]) => /<pk\/>/.test(c.description ?? '')).map(([n]) => n);
    const fks = [];
    for (const [, c] of cols) {
      const m = /<fk table='([^']+)' column='([^']+)'\/>/.exec(c.description ?? '');
      if (m && m[1] !== name) fks.push(m[1]);
    }
    tables[name] = { pk, fks: [...new Set(fks)], cols: cols.map(([n]) => n) };
  }
  return tables;
}

/** 부모 → 자식 순서. 사이클이 있으면 남은 것을 그대로 뒤에 붙인다. */
function topoSort(tables) {
  const names = Object.keys(tables);
  const done = new Set();
  const order = [];
  let guard = names.length + 1;
  while (order.length < names.length && guard-- > 0) {
    for (const n of names) {
      if (done.has(n)) continue;
      if (tables[n].fks.every((f) => done.has(f) || !tables[f])) {
        order.push(n);
        done.add(n);
      }
    }
  }
  for (const n of names) if (!done.has(n)) order.push(n);
  return order;
}

async function fetchAll(call, table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await call(`${table}?select=*`, {
      headers: { Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' }
    });
    if (!res.ok) throw new Error(`${table} 읽기 실패: ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

const keyOf = (row, pk) => pk.map((c) => JSON.stringify(row[c])).join('|');

/** 컬럼 값 비교 — 운영에 있는 컬럼만 본다. */
function differs(a, b, cols) {
  for (const c of cols) {
    if (JSON.stringify(a[c] ?? null) !== JSON.stringify(b[c] ?? null)) return true;
  }
  return false;
}

async function main() {
  const prodEnv = loadEnv(PROD_ENV);
  const devEnv = loadEnv(DEV_ENV);
  if (prodEnv.ref === devEnv.ref) throw new Error('운영과 개발이 같은 프로젝트를 가리킨다 — 중단');

  const prod = readOnlyClient(prodEnv);
  const dev = writeClient(devEnv);

  console.log(`운영 ${prodEnv.ref}  →  개발 ${devEnv.ref}`);
  console.log(APPLY ? '모드: 실제 반영 (--apply)\n' : '모드: 확인만 — 아무것도 바꾸지 않는다\n');

  const meta = await introspect(prod);
  let order = topoSort(meta);
  if (ONLY) order = order.filter((t) => ONLY.includes(t));

  const plan = [];
  for (const table of order) {
    const { pk, cols } = meta[table];
    if (pk.length === 0) {
      plan.push({ table, skip: 'PK 없음 — 건너뜀' });
      continue;
    }
    let pRows, dRows;
    try {
      [pRows, dRows] = await Promise.all([fetchAll(prod, table), fetchAll(dev, table)]);
    } catch (e) {
      plan.push({ table, skip: `읽기 실패 — ${e.message.slice(0, 60)}` });
      continue;
    }
    const pMap = new Map(pRows.map((r) => [keyOf(r, pk), r]));
    const dMap = new Map(dRows.map((r) => [keyOf(r, pk), r]));

    // 연락처와 updated_at 은 비교·반영에서 뺀다. 마스킹 유지 + 갱신시각 차이로 인한 전량 오탐 방지.
    const masked = CONTACT_COLUMNS.filter((c) => cols.includes(c));
    const compare = cols.filter((c) => !masked.includes(c) && c !== 'updated_at');

    const insert = pRows.filter((r) => !dMap.has(keyOf(r, pk)));
    const update = pRows
      .filter((r) => {
        const d = dMap.get(keyOf(r, pk));
        return d && differs(r, d, compare);
      })
      // 기존 행은 개발 DB 의 마스킹된 연락처를 그대로 살린다.
      .map((r) => {
        const d = dMap.get(keyOf(r, pk));
        const out = { ...r };
        for (const c of masked) out[c] = d[c];
        return out;
      });
    const remove = dRows.filter((r) => !pMap.has(keyOf(r, pk)));

    plan.push({
      table,
      pk,
      cols,
      masked,
      insert: insert.map((r) => (masked.length ? maskRow(r, masked) : r)),
      update,
      remove,
      prod: pRows.length,
      dev: dRows.length
    });
  }

  // ---- 보고 ----
  let touched = 0;
  for (const p of plan) {
    if (p.skip) {
      console.log(`- ${p.table.padEnd(34)} ${p.skip}`);
      continue;
    }
    const n = p.insert.length + p.update.length + p.remove.length;
    if (n === 0) continue;
    touched++;
    console.log(
      `* ${p.table.padEnd(34)} 운영 ${String(p.prod).padStart(5)} / 개발 ${String(p.dev).padStart(5)}` +
        `  →  추가 ${p.insert.length} · 수정 ${p.update.length} · 삭제 ${p.remove.length}` +
        (p.masked.length ? `   [연락처 유지: ${p.masked.join(',')}]` : '')
    );
  }
  if (touched === 0) {
    console.log('\n차이 없음 — 개발 DB 가 운영과 일치한다.');
    return;
  }

  if (!APPLY) {
    console.log('\n실제로 맞추려면 --apply 를 붙여 다시 실행한다.');
    return;
  }

  // ---- 반영: 삭제는 자식부터, 추가·수정은 부모부터 ----
  console.log('\n반영 시작');
  for (const p of [...plan].reverse()) {
    if (p.skip || p.remove.length === 0) continue;
    for (const row of p.remove) {
      const q = p.pk.map((c) => `${c}=eq.${encodeURIComponent(row[c])}`).join('&');
      const res = await dev(`${p.table}?${q}`, { method: 'DELETE' });
      if (!res.ok) console.log(`  ! 삭제 실패 ${p.table}: ${res.status} ${(await res.text()).slice(0, 120)}`);
    }
    console.log(`  삭제 ${p.table} ${p.remove.length}건`);
  }
  for (const p of plan) {
    if (p.skip) continue;
    const rows = [...p.insert, ...p.update];
    if (rows.length === 0) continue;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const res = await dev(`${p.table}?on_conflict=${p.pk.join(',')}`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(chunk)
      });
      if (!res.ok) console.log(`  ! 반영 실패 ${p.table}: ${res.status} ${(await res.text()).slice(0, 160)}`);
    }
    console.log(`  반영 ${p.table} ${rows.length}건`);
  }
  console.log('\n완료. 다시 실행해 "차이 없음" 이 나오는지 확인한다.');
}

main().catch((e) => {
  console.error('중단:', e.message);
  process.exit(1);
});
