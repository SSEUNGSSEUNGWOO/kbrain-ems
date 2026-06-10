/**
 * 테스트 학생 식별 규칙 — 이름이 "테스트" 로 시작.
 * 출결·수료·명단·통계 등 운영 데이터에서는 항상 제외해야 한다.
 * (`attendance-checks-section.tsx` 등 일부 컴포넌트에는 동일 로컬 정의가 남아있을 수 있음)
 */
export function isTestStudent(name: string): boolean {
  return name.startsWith('테스트');
}
