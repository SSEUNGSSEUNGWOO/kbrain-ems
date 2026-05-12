// 일회성 — 1·2기 1회차 과제의 description / due_date 채우기.
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

const COHORT_IDS = [
  '2b265ae5-814d-404b-83e8-e1c810a62825', // 1기
  '256c5c6f-ef95-4073-8a27-a9b5fbc44316'  // 2기
];

const DESCRIPTION = `실습과제 · AI 전문인재 과정 클릭
GitHub 계정 생성 · github.com에서 Sign up
Repository 생성 · 이름은 slm-model-report-소속-이름 형식 권장 · Public 설정
우측 「보고서 템플릿 다운로드」 버튼으로 HTML 양식 받기
브라우저에서 템플릿 열기 → EDIT 버튼 클릭 → 9개 섹션 작성 (EDIT하지 않고 동일한 양식으로 생성형 AI에게 요청해 채워도 무방)
Ctrl+S 또는 「HTML 저장」 버튼으로 소속_이름_slm_report.html 자동 다운로드
저장된 HTML을 GitHub Repository에 업로드
최종 제출 시 GitHub Repository 주소 운영진에게 공유


★ GitHub Repository 주소 제출 위치

(구글드라이브)
3. 과제 제출 → 기술교육 1회차(5. 7) → ★ GitHub Repository 주소 제출 시트에 기입

(링크)
https://docs.google.com/spreadsheets/d/1QdKliVBvCgefvUKwU4ADxiDJq4i6ZhbZ5Ezn8lROWIk/edit?usp=sharing`;

const DUE_DATE = '2026-05-13';

async function main() {
  const { data, error } = await supabase
    .from('assignments')
    .update({ description: DESCRIPTION, due_date: DUE_DATE })
    .in('cohort_id', COHORT_IDS)
    .like('title', '1회차%')
    .select('id, cohort_id, title, due_date');
  if (error) throw new Error(error.message);
  console.log(data);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
