-- 개인 단위 발송 이력.
--
-- 기존 notifications 는 recipient_type='cohort' 로 "이 기수의 이 단계를 보냈다" 체크리스트였다.
-- 자동 발송은 배치(타스온 1회 100건)로 쪼개지므로 일부만 성공하는 상태가 생긴다.
-- 누가 받았는지를 행 단위로 남겨야 재호출 때 미발송자만 골라낼 수 있다.
--
-- 부분 UNIQUE 인덱스로 중복을 DB 가 막는다. 애플리케이션이 "이력 조회 → 없으면 발송" 을
-- 하더라도 Cron 이 동시에 두 번 불리면 그 사이에 둘 다 통과한다. 마지막 방어선이 필요하다.
-- WHERE 절로 student 행에만 걸어 기존 cohort 체크리스트 행에는 영향을 주지 않는다.

CREATE UNIQUE INDEX IF NOT EXISTS notifications_student_stage_unique
  ON public.notifications (cohort_id, recipient_id, template_code)
  WHERE recipient_type = 'student';

COMMENT ON INDEX public.notifications_student_stage_unique IS
  '개인 단위 발송 중복 방지. recipient_type=student 행에만 적용 — cohort 단위 체크리스트 행은 제외.';
