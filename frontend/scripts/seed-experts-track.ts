// 일회성 — 2026 NIA 전문인재 트랙 23회차를 1·2기 양쪽 cohort에 시드.
// (기술교육 1회차는 이미 있어 제외)
//
// 동작:
//   1) 누락 강사(현중균·김용재·이중균) instructors에 추가
//   2) 각 cohort에:
//      - 학생 list fetch
//      - 23개 sessions insert
//      - 강사 매핑 session_instructors
//      - 학생 × session attendance_records (status=none)
//      - 기술교육 2~8회차에 assignment 자동 생성
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const COHORTS = [
  { name: '1기', id: '2b265ae5-814d-404b-83e8-e1c810a62825' },
  { name: '2기', id: '256c5c6f-ef95-4073-8a27-a9b5fbc44316' }
];

// PDF 기준 회차 (기술교육 1회차 제외)
type SessionDef = {
  title: string;
  date: string;
  instructors: string[];
  hasAssignment: boolean;
};

const SESSIONS: SessionDef[] = [
  // 기술교육 2~8회차 (과제 포함)
  { title: '[기술교육] 2회차', date: '2026-05-14', instructors: ['김태유', '신성진'], hasAssignment: true },
  { title: '[기술교육] 3회차', date: '2026-05-21', instructors: ['현중균'], hasAssignment: true },
  { title: '[기술교육] 4회차', date: '2026-05-28', instructors: ['김태유'], hasAssignment: true },
  { title: '[기술교육] 5회차', date: '2026-06-18', instructors: ['현중균'], hasAssignment: true },
  { title: '[기술교육] 6회차', date: '2026-06-25', instructors: ['김태유'], hasAssignment: true },
  { title: '[기술교육] 7회차', date: '2026-07-02', instructors: ['김용재'], hasAssignment: true },
  { title: '[기술교육] 8회차', date: '2026-07-09', instructors: ['김용재'], hasAssignment: true },

  // AI리더특강
  { title: '[AI리더특강] 1회차', date: '2026-07-16', instructors: ['신성진'], hasAssignment: false },

  // 특별교육
  { title: '[특별교육] 1회차', date: '2026-06-04', instructors: [], hasAssignment: false },
  { title: '[특별교육] 2회차', date: '2026-07-23', instructors: ['이중균'], hasAssignment: false },

  // 개인프로젝트 (신성진 외 4 — 메인 강사만)
  { title: '[개인프로젝트] 1회차', date: '2026-08-06', instructors: ['신성진'], hasAssignment: false },
  { title: '[개인프로젝트] 2회차', date: '2026-08-13', instructors: ['신성진'], hasAssignment: false },
  { title: '[개인프로젝트] 3회차', date: '2026-08-20', instructors: ['신성진'], hasAssignment: false },
  { title: '[개인프로젝트] 4회차', date: '2026-09-03', instructors: ['신성진'], hasAssignment: false },

  // 보수교육
  { title: '[보수교육] 1회차', date: '2026-06-09', instructors: ['김용재', '김태유'], hasAssignment: false },
  { title: '[보수교육] 2회차', date: '2026-09-08', instructors: ['김용재', '이중균'], hasAssignment: false },

  // 팀프로젝트 (신성진 외 3/4 — 메인 강사만)
  { title: '[팀프로젝트] 1회차', date: '2026-09-17', instructors: ['신성진'], hasAssignment: false },
  { title: '[팀프로젝트] 2회차', date: '2026-10-01', instructors: ['신성진'], hasAssignment: false },
  { title: '[팀프로젝트] 3회차', date: '2026-10-15', instructors: ['신성진'], hasAssignment: false },
  { title: '[팀프로젝트] 4회차', date: '2026-10-22', instructors: ['신성진'], hasAssignment: false },

  // 인증평가·인증식
  { title: '[인증평가] 1회차', date: '2026-11-02', instructors: ['신성진'], hasAssignment: false },
  { title: '[인증평가] 2회차', date: '2026-11-05', instructors: [], hasAssignment: false },
  { title: '[인증식] 1회차', date: '2026-12-09', instructors: [], hasAssignment: false }
];

const DEFAULT_AFFILIATION = '한국데이터사이언티스트협회';

async function ensureInstructor(name: string): Promise<string> {
  const { data: existing } = await supabase
    .from('instructors')
    .select('id')
    .eq('name', name)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await supabase
    .from('instructors')
    .insert({ name, affiliation: DEFAULT_AFFILIATION })
    .select('id')
    .single();
  if (error || !created) throw new Error(`instructor insert failed for ${name}: ${error?.message}`);
  console.log(`  + 강사 추가: ${name} (${DEFAULT_AFFILIATION}) → ${created.id}`);
  return created.id;
}

async function main() {
  console.log('=== 1) 강사 마스터 확보 ===');
  const allNames = Array.from(new Set(SESSIONS.flatMap((s) => s.instructors)));
  const idByName = new Map<string, string>();
  for (const n of allNames) {
    idByName.set(n, await ensureInstructor(n));
  }
  console.log(`  강사 ${idByName.size}명 매핑 완료`);

  for (const cohort of COHORTS) {
    console.log(`\n=== 2) ${cohort.name} (${cohort.id}) 시드 ===`);

    const { data: students } = await supabase
      .from('students')
      .select('id')
      .eq('cohort_id', cohort.id);
    const studentIds = (students ?? []).map((s) => s.id);
    console.log(`  학생 ${studentIds.length}명`);

    let createdSessions = 0;
    let createdAtt = 0;
    let createdAssignments = 0;

    for (const def of SESSIONS) {
      const { data: sess, error: sErr } = await supabase
        .from('sessions')
        .insert({
          cohort_id: cohort.id,
          session_date: def.date,
          title: def.title
        })
        .select('id')
        .single();
      if (sErr || !sess) {
        console.error(`  [ERR ] ${def.title}: ${sErr?.message}`);
        continue;
      }
      createdSessions++;

      // session_instructors
      if (def.instructors.length > 0) {
        const rows = def.instructors
          .map((n) => idByName.get(n))
          .filter((id): id is string => !!id)
          .map((id) => ({ session_id: sess.id, instructor_id: id, role: 'main' }));
        if (rows.length > 0) {
          const { error: siErr } = await supabase.from('session_instructors').insert(rows);
          if (siErr) console.error(`    session_instructors: ${siErr.message}`);
        }
      }

      // attendance_records (학생 × session, status=none)
      if (studentIds.length > 0) {
        const attRows = studentIds.map((sid) => ({
          session_id: sess.id,
          student_id: sid,
          status: 'none'
        }));
        const { error: attErr } = await supabase.from('attendance_records').insert(attRows);
        if (attErr) console.error(`    attendance_records: ${attErr.message}`);
        else createdAtt += attRows.length;
      }

      // assignment (기술교육 회차만)
      if (def.hasAssignment) {
        const { error: aErr } = await supabase.from('assignments').insert({
          cohort_id: cohort.id,
          session_id: sess.id,
          title: `${def.title} 과제`
        });
        if (aErr) console.error(`    assignment: ${aErr.message}`);
        else createdAssignments++;
      }
    }

    console.log(`  ${cohort.name} 결과 — sessions ${createdSessions}, attendance ${createdAtt}, assignments ${createdAssignments}`);
  }

  console.log('\n=== 완료 ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
