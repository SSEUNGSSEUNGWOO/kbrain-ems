-- 취하 status 를 사전취소/당일취소로 분리.
-- 기존 'withdrawn' 데이터는 사전취소로 일괄 이관 (운영자가 당일취소 케이스는 수동 변경).
update applications
set status = 'pre_cancel'
where status = 'withdrawn';
