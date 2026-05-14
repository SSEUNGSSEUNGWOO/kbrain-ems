-- 집계 RPC 함수들 — Supabase JS는 GROUP BY 미지원이라 JS reduce 흉내내던 부분을 SQL 측에서 처리.
-- overview/cohorts/students 페이지의 풀스캔 부담 제거.

-- cohort별 학생·세션 카운트 (cohorts 페이지, overview 위젯에서 사용)
CREATE OR REPLACE FUNCTION cohort_summary()
RETURNS TABLE (cohort_id UUID, student_count BIGINT, session_count BIGINT)
LANGUAGE SQL STABLE
AS $$
  SELECT
    c.id AS cohort_id,
    COALESCE(s.cnt, 0) AS student_count,
    COALESCE(se.cnt, 0) AS session_count
  FROM cohorts c
  LEFT JOIN (SELECT cohort_id, COUNT(*) AS cnt FROM students GROUP BY cohort_id) s
    ON s.cohort_id = c.id
  LEFT JOIN (SELECT cohort_id, COUNT(*) AS cnt FROM sessions GROUP BY cohort_id) se
    ON se.cohort_id = c.id;
$$;

-- 한 cohort 내 학생별 출석 카운트 (students 페이지에서 사용)
CREATE OR REPLACE FUNCTION cohort_attendance_summary(p_cohort_id UUID)
RETURNS TABLE (student_id UUID, present_count BIGINT, total_count BIGINT)
LANGUAGE SQL STABLE
AS $$
  SELECT
    s.id AS student_id,
    COALESCE(SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END), 0) AS present_count,
    COUNT(ar.id) AS total_count
  FROM students s
  LEFT JOIN sessions se ON se.cohort_id = s.cohort_id
  LEFT JOIN attendance_records ar ON ar.session_id = se.id AND ar.student_id = s.id
  WHERE s.cohort_id = p_cohort_id
  GROUP BY s.id;
$$;
