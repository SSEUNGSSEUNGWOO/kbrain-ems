---
description: 회차(수업) 결과보고서 마크다운 초안 생성
argument-hint: <sessionId>
allowed-tools: Bash, Read, Write, Edit
---

당신은 한 회 수업에 대한 **회차별 결과보고서 초안**을 작성합니다.

## 입력

사용자 인자: `$ARGUMENTS`

- 빈 문자열이면 "sessionId(UUID)를 알려주세요" 라고 묻고 멈춥니다.
- 회차는 이름이 모호하므로 **UUID 입력만 허용**합니다. 사용자가 "전문인재 26-1기 3회차" 같은 자연어로 부탁하면, 일회용 스크립트로 `cohort_name + 회차번호`로 `sessions`를 조회해 후보 UUID를 보여주고 멈춥니다.

## 워크플로우

### 1) 데이터 수집

```bash
cd frontend && bun run scripts/session-report-data.ts <UUID> --out ../reports/<slug>-data.json
```

`<slug>` 규칙: `session-{cohort_name}-{NN}회차` (NN은 2자리 패딩)
- 예: `session-전문인재-26-1기-03회차`
- 파일명 안전화: 공백 → `-`, `/`·`\`·`:`·`*`·`?`·`"`·`<`·`>`·`|` 제거.

### 2) 마크다운 작성

`reports/<slug>-data.json`을 읽고 아래 구조로 `reports/<slug>.md` 작성.
**모든 수치는 JSON 그대로 사용 — 추측·재계산 금지.**

#### 표준 섹션

```
# {session.no}회차 결과보고서 — {cohort_name}

## 1. 회차 개요
- **소속 기수**: {cohort_name} ({cohort_category})
- **회차**: {session.no}회차
- **일자**: {session.date}
- **시간**: {start_time} ~ {end_time} (휴식 {break_minutes}분)
- **계획 총 시간**: {total_hours_planned}시간 (없으면 생략)
- **주제**: {session.title}
- **장소**: {session.location ?? "미지정"}

## 2. 강사 운영 및 강사료 산정

| 강사 | 역할 | 등급 | 시간 | 시급 | 산정액 | 승인액 | 상태 |
|---|---|---|---|---|---|---|---|

- 시급 우선순위: `fee.hourly_rate` → `grade_hourly_rate` → `-`
- 시간 우선순위: `fee.hours` → `hours` → `-`
- 금액은 천단위 콤마 포맷 (`1,200,000원`). null이면 `-`.
- 상태: `fee.status` 값 그대로 (예: pending / approved / paid). null이면 `미산정`.

강사료 데이터가 모두 비어 있으면 표 아래에 한 줄:
> 본 회차 강사료는 아직 산정되지 않았습니다.

## 3. 출결

- **참석률**: {attendance.rate}% ({present}/{total})
- **미참석자**: {absent}명

미참석자 명단 (있을 때만):
| 이름 | 소속 | 상태 | 비고 |

`status`가 `present`가 아닌 모든 학생. `note`는 있으면 표시, 없으면 `-`.
출결 데이터(`total`)가 0이면 `> 출결 미입력` 한 줄.

## 4. 만족도 설문 결과

`surveys` 배열이 비어 있으면 이 섹션 전체 생략 (회차 매핑 설문이 없는 경우).
있으면 설문별로:

### 4-{i}. {survey.title}
- **응답**: {n} / {denominator}명 ({response_rate}%)
- **섹션별 평균** (척도 1~5):

| 섹션 | 평균 | 응답수 |
|---|---|---|

섹션 평균 = 같은 `section_no` 안의 likert5 문항만 평균.

- **강사별 만족도** (instructor_id가 매핑된 likert5 문항만):

| 강사 | 평균 | 응답수 |

- **주관식 응답** (text 문항 중 `text_responses` 있는 것):
  - 문항별로 묶어 표시:
    **{question.text}**
    > {각 응답을 한 줄 인용}

  - 한 문항에 응답 10개 초과 시: 대표 8개 인용 + 마지막에 `_그 외 N건_` 표기.
  - 개인 비방·인신공격성 표현은 `[비방성 의견]`으로 마스킹.
  - 이름·소속이 보이면 `[학습자]`로 치환.

## 5. 회차 총평
2~3문장. 다음을 종합:
- 출석률·응답률 수치
- 만족도 평균과 분포의 특징 (특정 강사 만족도가 두드러지면 그 점만 사실 진술)
- 주관식에서 반복된 개선 의견 1~2개 (요약, 인용 X)

**톤**: "...로 나타났다", "...로 보인다". 단정·평가·추측 금지.

---
*초안 자동생성: {generated_at}*
```

### 3) 결과 안내

작성 완료 후:

```
✓ 회차 보고서 초안 생성됨
  데이터: reports/<slug>-data.json
  마크다운: reports/<slug>.md

검수 후 PDF로 변환:
  bunx md-to-pdf reports/<slug>.md
```

## 주의

- **응답률 분모(`denominator`)**: 보통 `surveys.respondent_total`가 들어있는데 실제 회차 참석자(`attendance.total`)와 불일치할 수 있음. 보고서에는 JSON 값 그대로 표기, 의문이 들면 운영자에게 검수 요청 한 줄 추가.
- 회차 보고서는 운영자(내부)용이므로 미참석자 명단을 실명 표기. 외부 발주처 제출용으로 마스킹이 필요하면 그건 운영자가 직접 처리.
- 강사 만족도 텍스트 응답 중 비방성 의견이 보이면 마스킹 (`[비방성 의견]`). 의견 자체는 삭제하지 말고 마스킹 처리만.
