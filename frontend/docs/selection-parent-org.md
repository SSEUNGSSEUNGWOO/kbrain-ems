# 자동선발 상위부처(parent org) 그룹핑

## 기본 동작

자동선발의 "상위부처 cap"은 같은 상위부처에서 너무 많은 인원이 뽑히지 않도록
인원수 상한을 거는 hard limit이다. 그룹핑 키는 기관명의 **첫 공백 앞 토큰**.

| 기관명 | 상위부처 키 |
|---|---|
| 경찰청 서울특별시경찰청 | 경찰청 |
| 경찰청 경기도남부경찰청 | 경찰청 |
| 행정안전부 국립과학수사연구원 | 행정안전부 |
| 한국전력공사 | 한국전력공사 |
| 한전KDN(주) | 한전KDN(주) |

이렇게만 해도 시도경찰청 27곳·부처 산하 기관들이 잘 묶인다.

## 수동 매핑 (PARENT_ORG_OVERRIDES)

문제는 **단독 명칭이지만 같은 부처 산하인 위원회·기관들**. 예:

- 한국문화예술위원회, 영화진흥위원회, 영상물등급위원회 — 모두 문체부 산하지만
  이름에 부처 prefix가 없어 각각 자기 자신이 parent로 잡힘
- 결과: 문체부 관련 위원회 사람들이 cap을 우회해 한 cohort에 몰릴 수 있음

이를 막기 위해 `src/app/dashboard/cohorts/[cohortId]/applications/_selection-logic.ts`
파일 상단의 `PARENT_ORG_OVERRIDES` dict에 **정확한 기관명 → 상위부처 키**
매핑을 추가한다.

```ts
const PARENT_ORG_OVERRIDES: Record<string, string> = {
  '한국문화예술위원회': '문화체육관광부',
  '영화진흥위원회': '문화체육관광부',
  '영상물등급위원회': '문화체육관광부',
  '가축위생방역지원본부': '농림축산식품부'
  // 새 매핑이 필요하면 여기에 추가
};
```

`parentOrgKey()`는 매핑이 있으면 그 값을 우선 반환, 없으면 기본 공백 prefix 규칙
적용. 자동선발 sheet에서 상위부처 cap을 7로 두고 위 매핑이 있으면 한국문화예술
위원회 3명 + 영화진흥위원회 2명 + 영상물등급위원회 2명 = **합산 7명까지만** 통과.

## 새 매핑을 추가해야 할 신호

신청자 명단에 다음 패턴이 보이면 추가 검토:

1. **위원회·재단·진흥원** 단독 명칭 — 첫 공백이 없어 자기 자신이 parent
2. 신청자 본인 답안이 `④ 공공기관`이지만 실질적으로 특정 부처 산하인 경우
3. 같은 부처 산하 기관들이 우연히 한 cohort에 몰려서 의도와 다른 분포가 나올 때

이 dict는 작업량이 가벼운 hardcoded mapping. 매핑 누적이 50건 넘어서 운영자가
직접 관리하고 싶어지면 `organizations` 테이블에 `parent_org` 컬럼을 추가하는
방식(옵션 B)으로 마이그레이션.

## 관련 코드

- `frontend/src/app/dashboard/cohorts/[cohortId]/applications/_selection-logic.ts`
  - `PARENT_ORG_OVERRIDES` dict
  - `parentOrgKey()` 함수
  - `recommendByQuotas()` 내 `tryAdd`에서 parent cap 적용

## 결정 출처

운영진(승우님) 검토 — 자동선발 시 같은 상위부처 산하 위원회들이 따로 잡혀서
실효성 없는 cap이 되는 문제 발견 후 hardcoded mapping으로 우선 처리하기로 결정.
