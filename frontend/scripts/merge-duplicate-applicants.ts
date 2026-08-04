// 동일인 중복 applicants 병합.
//
// 그룹 키: 이름 + (전화 digits || 이메일 lower). 그룹마다 승자 1행을 남기고
// applications·students FK 를 승자로 재연결한 뒤 패자 행을 삭제한다.
// (선례: scripts/archive/_merge_jo_yongtak.ts 의 1인용 절차를 일반화)
//
// - 승자: applications 많은 행 → 동률이면 created_at 오래된 행
// - 승자의 빈 필드는 패자 값으로 백필, prior_certs 는 cert_no 기준 union
// - applications partial unique (applicant,cohort,track) 충돌 시 상태 우선순위
//   selected > same_day_cancel > applied > rejected > pre_cancel 로 1행만 유지
// - students unique (applicant,cohort) 충돌 시 출결 기록 많은 행 유지
// - 실행 전 관련 행 전체를 scripts/archive/backups/ 에 JSON 스냅샷
//
// 사용법: bun run scripts/merge-duplicate-applicants.ts [--dry-run]

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const DRY = process.argv.includes('--dry-run');

const N = (v: unknown) => String(v ?? '').trim();
const P = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const E = (v: unknown) => String(v ?? '').trim().toLowerCase();
const STATUS_PRIORITY: Record<string, number> = {
  selected: 5, same_day_cancel: 4, applied: 3, rejected: 2, pre_cancel: 1
};

type Applicant = Record<string, unknown> & { id: string; name: string; created_at: string; prior_certs: unknown };
type AppRow = { id: string; applicant_id: string; cohort_id: string; status: string; track_id: string | null };
type StudentRow = { id: string; applicant_id: string; cohort_id: string };

async function all<T>(b: (f: number, t: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  let a: T[] = []; let f = 0;
  for (;;) {
    const { data, error } = await b(f, f + 999);
    if (error) throw new Error(String((error as { message?: string }).message ?? error));
    if (!data || !data.length) break;
    a = a.concat(data);
    if (data.length < 1000) break;
    f += 1000;
  }
  return a;
}

async function run() {
  console.log(DRY ? '[--dry-run] DB 쓰기 없음\n' : '');
  const applicants = await all<Applicant>((f, t) => sb.from('applicants').select('*').range(f, t));
  const apps = await all<AppRow>((f, t) => sb.from('applications').select('id, applicant_id, cohort_id, status, track_id').range(f, t));
  const students = await all<StudentRow>((f, t) => sb.from('students').select('id, applicant_id, cohort_id').range(f, t));
  const { data: cohorts } = await sb.from('cohorts').select('id, name');
  const cn = new Map((cohorts ?? []).map((c) => [c.id, c.name]));

  const appsBy = new Map<string, AppRow[]>();
  for (const a of apps) appsBy.set(a.applicant_id, [...(appsBy.get(a.applicant_id) ?? []), a]);
  const studentsBy = new Map<string, StudentRow[]>();
  for (const s of students) studentsBy.set(s.applicant_id, [...(studentsBy.get(s.applicant_id) ?? []), s]);

  // 그룹 탐지
  const groups = new Map<string, Applicant[]>();
  for (const a of applicants) {
    const k = N(a.name) + '|' + (P(a.phone) || E(a.email));
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  const dupGroups = [...groups.entries()].filter(([, v]) => v.length > 1);
  console.log(`중복 그룹 ${dupGroups.length}개 / 여분 행 ${dupGroups.reduce((s, [, v]) => s + v.length - 1, 0)}개\n`);

  const backup: Record<string, unknown>[] = [];
  const stats = { merged: 0, appsMoved: 0, appsDeleted: 0, studentsMoved: 0, studentsDeleted: 0, backfilled: 0, certsUnioned: 0 };

  for (const [key, group] of dupGroups) {
    // 승자: applications 많은 순 → created_at 오래된 순
    const sorted = group.toSorted((a, b) => {
      const na = (appsBy.get(a.id) ?? []).length;
      const nb = (appsBy.get(b.id) ?? []).length;
      if (na !== nb) return nb - na;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    const winner = sorted[0];
    const losers = sorted.slice(1);
    console.log(`■ ${key.split('|')[0]} — ${group.length}행 → 승자 ${winner.id.slice(0, 8)} (신청 ${(appsBy.get(winner.id) ?? []).length}건)`);

    backup.push({ kind: 'group', key, winner, losers, apps: group.flatMap((g) => appsBy.get(g.id) ?? []), students: group.flatMap((g) => studentsBy.get(g.id) ?? []) });

    // 1) 승자 빈 필드 백필 + prior_certs union
    const FIELDS = ['email', 'phone', 'personal_email', 'organization_id', 'department', 'job_title', 'job_role', 'birth_date', 'notes', 'category'];
    const patch: Record<string, unknown> = {};
    for (const f of FIELDS) {
      if (winner[f]) continue;
      const donor = losers.find((l) => l[f]);
      if (donor) { patch[f] = donor[f]; stats.backfilled++; }
    }
    const winnerCerts = Array.isArray(winner.prior_certs) ? (winner.prior_certs as { cert_no?: string }[]) : [];
    const seen = new Set(winnerCerts.map((c) => c.cert_no));
    const merged = [...winnerCerts];
    for (const l of losers) {
      for (const c of (Array.isArray(l.prior_certs) ? (l.prior_certs as { cert_no?: string }[]) : [])) {
        if (c.cert_no && !seen.has(c.cert_no)) { merged.push(c); seen.add(c.cert_no); stats.certsUnioned++; }
      }
    }
    if (merged.length > winnerCerts.length) patch.prior_certs = merged;
    if (Object.keys(patch).length > 0) {
      console.log(`   백필: ${Object.keys(patch).join(', ')}`);
      if (!DRY) {
        const { error } = await sb.from('applicants').update(patch as never).eq('id', winner.id);
        if (error) throw new Error(error.message);
      }
    }

    // 2) applications 재연결 — (cohort, track) 충돌 시 상태 우선순위로 1행 유지
    const winnerApps = new Map<string, AppRow>(); // `${cohort}|${track}` -> row
    for (const a of appsBy.get(winner.id) ?? []) winnerApps.set(`${a.cohort_id}|${a.track_id ?? ''}`, a);
    for (const l of losers) {
      for (const a of appsBy.get(l.id) ?? []) {
        const slot = `${a.cohort_id}|${a.track_id ?? ''}`;
        const held = winnerApps.get(slot);
        if (!held) {
          console.log(`   신청 이동: ${cn.get(a.cohort_id)} (${a.status})`);
          if (!DRY) {
            const { error } = await sb.from('applications').update({ applicant_id: winner.id }).eq('id', a.id);
            if (error) throw new Error(error.message);
          }
          winnerApps.set(slot, { ...a, applicant_id: winner.id });
          stats.appsMoved++;
        } else {
          // 충돌: 우선순위 높은 쪽 유지
          const keepLoser = (STATUS_PRIORITY[a.status] ?? 0) > (STATUS_PRIORITY[held.status] ?? 0);
          const drop = keepLoser ? held : a;
          const keep = keepLoser ? a : held;
          console.log(`   신청 충돌 ${cn.get(a.cohort_id)}: ${held.status} vs ${a.status} → ${keep.status} 유지`);
          if (!DRY) {
            const { error: dErr } = await sb.from('applications').delete().eq('id', drop.id);
            if (dErr) throw new Error(dErr.message);
            if (keepLoser) {
              const { error } = await sb.from('applications').update({ applicant_id: winner.id }).eq('id', a.id);
              if (error) throw new Error(error.message);
            }
          }
          if (keepLoser) winnerApps.set(slot, { ...a, applicant_id: winner.id });
          stats.appsDeleted++;
        }
      }
    }

    // 3) students 재연결 — (cohort) 충돌 시 출결 기록 많은 행 유지
    const winnerStudents = new Map<string, StudentRow>();
    for (const s of studentsBy.get(winner.id) ?? []) winnerStudents.set(s.cohort_id, s);
    for (const l of losers) {
      for (const s of studentsBy.get(l.id) ?? []) {
        const held = winnerStudents.get(s.cohort_id);
        if (!held) {
          console.log(`   학생 이동: ${cn.get(s.cohort_id)}`);
          if (!DRY) {
            const { error } = await sb.from('students').update({ applicant_id: winner.id }).eq('id', s.id);
            if (error) throw new Error(error.message);
          }
          winnerStudents.set(s.cohort_id, { ...s, applicant_id: winner.id });
          stats.studentsMoved++;
        } else {
          const { count: ca } = await sb.from('attendance_records').select('id', { count: 'exact', head: true }).eq('student_id', held.id);
          const { count: cb } = await sb.from('attendance_records').select('id', { count: 'exact', head: true }).eq('student_id', s.id);
          const keepLoser = (cb ?? 0) > (ca ?? 0);
          const drop = keepLoser ? held : s;
          console.log(`   학생 충돌 ${cn.get(s.cohort_id)}: 출결 ${ca ?? 0} vs ${cb ?? 0} → ${keepLoser ? '패자측' : '승자측'} 유지, ${drop.id.slice(0, 8)} 삭제`);
          if (!DRY) {
            const { error: dErr } = await sb.from('students').delete().eq('id', drop.id);
            if (dErr) throw new Error(dErr.message);
            if (keepLoser) {
              const { error } = await sb.from('students').update({ applicant_id: winner.id }).eq('id', s.id);
              if (error) throw new Error(error.message);
            }
          }
          if (keepLoser) winnerStudents.set(s.cohort_id, { ...s, applicant_id: winner.id });
          stats.studentsDeleted++;
        }
      }
    }

    // 4) 패자 삭제
    for (const l of losers) {
      if (!DRY) {
        const { error } = await sb.from('applicants').delete().eq('id', l.id);
        if (error) throw new Error(error.message);
      }
    }
    stats.merged += losers.length;
  }

  if (!DRY && backup.length > 0) {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '').slice(0, 14);
    const out = path.resolve(__dirname, `archive/backups/_backup_applicant_merge_${stamp}.json`);
    fs.writeFileSync(out, JSON.stringify(backup, null, 1), 'utf8');
    console.log(`\n백업 저장: ${out}`);
  }
  console.log(`\n${DRY ? '[dry-run] ' : ''}요약: 병합 삭제 ${stats.merged}행 · 신청 이동 ${stats.appsMoved}/충돌삭제 ${stats.appsDeleted} · 학생 이동 ${stats.studentsMoved}/충돌삭제 ${stats.studentsDeleted} · 백필 ${stats.backfilled}필드 · 인증이력 합침 ${stats.certsUnioned}건`);

  // 사후 검증
  if (!DRY) {
    const after = await all<Applicant>((f, t) => sb.from('applicants').select('id, name, phone, email').range(f, t));
    const g2 = new Map<string, number>();
    for (const a of after) { const k = N(a.name) + '|' + (P(a.phone) || E(a.email)); g2.set(k, (g2.get(k) ?? 0) + 1); }
    const remain = [...g2.values()].filter((v) => v > 1).length;
    console.log(`검증: 남은 중복 그룹 ${remain}개 (0이어야 정상)`);
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
