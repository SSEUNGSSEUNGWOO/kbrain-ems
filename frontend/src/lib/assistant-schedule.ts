// 회차별 보조강사 필요 여부 및 시간대 산출.
//
// PDF 가이드:
//   - 대면 / 비대면 / 비대면 실시간: 모든 회차 09:00~18:00 풀타임 필요
//   - 과제형 (B유형 하이브리드): 1번째 회차 불필요 (자기주도), 2·3번째 회차 09:00~11:00 (강사 라이브)
//   - 블렌디드: 기본 09:00~18:00 (운영자 수동 조정 권장)

export type AssistantNeed = {
  needed: boolean;
  timeRange: string; // '09:00~18:00' | '09:00~11:00' | '—'
  reason: string; // 운영자 안내 (예: '강사 라이브 시간만', '학습자 자기주도')
};

type SessionLike = { id: string; session_date: string };

/**
 * 한 cohort의 회차별 보조강사 필요도 산출.
 * sessions는 session_date 오름차순으로 받아도 되고 아니어도 됨 (내부에서 정렬).
 */
export function computeAssistantSchedule<S extends SessionLike>(
  deliveryMethod: string | null,
  sessions: S[]
): Map<string, AssistantNeed> {
  const sorted = [...sessions].sort((a, b) => a.session_date.localeCompare(b.session_date));
  const result = new Map<string, AssistantNeed>();

  // 과제형: 1번째 X, 2·3번째 강사 라이브 2H
  if (deliveryMethod === '과제형') {
    sorted.forEach((s, idx) => {
      if (idx === 0) {
        result.set(s.id, {
          needed: false,
          timeRange: '—',
          reason: '1일차 학습자 자기주도 (이러닝·셀프과제)'
        });
      } else {
        result.set(s.id, {
          needed: true,
          timeRange: '09:00~11:00',
          reason: '강사 라이브 시간 (Q&A·브레이크아웃 보조)'
        });
      }
    });
    return result;
  }

  // 대면 / 비대면 / 비대면 실시간: 모든 회차 풀타임
  if (deliveryMethod === '대면' || deliveryMethod === '비대면') {
    sorted.forEach((s) => {
      result.set(s.id, {
        needed: true,
        timeRange: '09:00~18:00',
        reason: deliveryMethod === '대면' ? '대면 종일 수업' : '비대면 종일 수업'
      });
    });
    return result;
  }

  // 블렌디드: 기본 풀타임 (운영자 검토 권장)
  if (deliveryMethod === '블렌디드') {
    sorted.forEach((s) => {
      result.set(s.id, {
        needed: true,
        timeRange: '09:00~18:00',
        reason: '블렌디드 — 운영자 검토 권장'
      });
    });
    return result;
  }

  // 미지정 / 알 수 없는 값: 운영자 확인 필요
  sorted.forEach((s) => {
    result.set(s.id, {
      needed: false,
      timeRange: '—',
      reason: '운영방식 미지정 — 운영자 확인 필요'
    });
  });
  return result;
}

/** 단일 회차에 대한 산출 (cohort의 전체 sessions가 필요 — 회차 순번 의존). */
export function assistantNeedFor<S extends SessionLike>(
  deliveryMethod: string | null,
  cohortSessions: S[],
  sessionId: string
): AssistantNeed {
  const map = computeAssistantSchedule(deliveryMethod, cohortSessions);
  return (
    map.get(sessionId) ?? {
      needed: false,
      timeRange: '—',
      reason: '회차를 찾을 수 없습니다.'
    }
  );
}
