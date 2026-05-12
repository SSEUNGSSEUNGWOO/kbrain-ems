-- 본부장·부본부장을 'head' 권한으로 분리.
-- 'head' role은 시스템 접근 권한은 있되, 운영자 풀(회차 배정 대상)에서는 제외된다.
UPDATE public.operators SET role = 'head' WHERE title IN ('본부장', '부본부장');
