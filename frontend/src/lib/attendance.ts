/**
 * 체크포인트 label에서 attendance_role을 추론.
 * 폼에서 role 선택을 안 하고 만든 체크포인트가 attendance_records로 동기화 안 되던 버그(2026-06)를
 * 막기 위한 안전망. createAttendanceCheck / checkinByShareCode 양쪽에서 사용.
 */
export function inferAttendanceRole(
  label: string | null | undefined
): 'arrival' | 'departure' | null {
  if (!label) return null;
  if (/퇴실/.test(label)) return 'departure';
  if (/입실|출석/.test(label)) return 'arrival';
  return null;
}
