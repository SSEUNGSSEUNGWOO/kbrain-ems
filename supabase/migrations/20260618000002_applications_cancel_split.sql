-- 취소 상태 분리:
-- 기존 pre_cancel('사전취소') 한 칸을 운영 워크플로우에 맞춰 3종으로 확장.
-- 새 enum: cancel_notice(취소통보, 학생 통보 단계) / cancel_confirmed(취소확정, 운영자 처리 완료) / same_day_cancel(당일취소, 그대로).
-- 기존 pre_cancel 데이터는 운영자 검토를 거친 것으로 간주해 모두 cancel_confirmed 로 이관.

UPDATE applications
SET status = 'cancel_confirmed'
WHERE status = 'pre_cancel';
