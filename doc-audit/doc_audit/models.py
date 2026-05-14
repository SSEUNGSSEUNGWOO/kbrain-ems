"""검수 도메인 모델.

설계 원칙:
- LLM 추출 결과(`DocumentExtraction`)와 검수 결과(`Issue`)를 명확히 분리한다.
- 결정론 검산 4종은 모두 `DocumentExtraction → list[Issue]` 시그니처를 따른다.
- 위치 정보는 단순화: "어느 섹션·문맥에서 발견됐는지"만. 절대 좌표는 hwp 파서 도입 후.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


# =============================================================================
# 검수 결과
# =============================================================================

IssueCategory = Literal[
    "terminology",   # ① 표기 통일성
    "name_typo",     # ④ 인명/기관명 오타
    "number",        # ② 숫자 일치
    "date",          # ③ 날짜 정합성
    "budget",        # ⑤ 강사료 한도/산식
    "section",       # ⑥ 누락 섹션
]

Severity = Literal["error", "warning"]


class Location(BaseModel):
    section: str | None = None
    context: str | None = Field(default=None, description="발견 위치의 원본 문맥(짧게)")


class Issue(BaseModel):
    category: IssueCategory
    severity: Severity
    message: str = Field(..., description="사람이 읽을 한 줄 설명")
    quote: str | None = Field(default=None, description="문서에서 인용한 문제 부분")
    suggestion: str | None = Field(default=None, description="제안 수정문")
    reason: str = Field(..., description="왜 오류인지")
    locations: list[Location] = Field(default_factory=list)


# =============================================================================
# 문서 추출 모델 (파서 + LLM이 만들어 검산 엔진에 전달)
# =============================================================================


class NumberClaim(BaseModel):
    """문서 안에서 같은 대상에 대해 주장된 수치 하나.

    동일 `label`을 가진 claim들은 모두 일치해야 한다. 일치하지 않으면 ②번 오류.
    """

    label: str = Field(..., description="대상 이름. 예: '강사료 합계', '교육생 인원'")
    value: float = Field(..., description="정규화된 숫자값. 단위 제외.")
    unit: str | None = Field(default=None, description="원/명/회 등")
    raw: str = Field(..., description="원문 문자열. 예: '5,000,000원'")
    location: Location


class DateClaim(BaseModel):
    """문서 안 날짜 주장.

    `weekday_text`가 있으면 `value`의 실제 요일과 일치해야 한다.
    `value`는 1일 단위 절대 날짜.
    """

    value: date
    weekday_text: str | None = Field(default=None, description="원문에 적힌 요일. '수' 등")
    raw: str
    location: Location


class DateRangeClaim(BaseModel):
    """기간 주장. 시작·종료가 역전되어 있으면 오류."""

    start: date
    end: date
    raw: str
    location: Location


class BudgetLine(BaseModel):
    """강사료 등 단가 × 수량 항목.

    `total`이 명시되어 있으면 `unit_price * quantity`와 일치해야 한다.
    `instructor_name`이 마스터에 있으면 단가가 한도 안에 있어야 한다.
    """

    label: str
    instructor_name: str | None = None
    unit_price: float
    quantity: float
    unit_quantity: str | None = Field(default=None, description="시간/일/회")
    total: float | None = None
    raw: str
    location: Location


class SectionPresence(BaseModel):
    title: str
    location: Location


class DocumentExtraction(BaseModel):
    """LLM 추출 + hwp 파서가 합친 정규화된 문서 표상."""

    course_name: str | None = None
    period: DateRangeClaim | None = None

    numbers: list[NumberClaim] = Field(default_factory=list)
    dates: list[DateClaim] = Field(default_factory=list)
    date_ranges: list[DateRangeClaim] = Field(default_factory=list)
    budget_lines: list[BudgetLine] = Field(default_factory=list)
    sections: list[SectionPresence] = Field(default_factory=list)


# =============================================================================
# 검수 룰 (외부 입력)
# =============================================================================


class InstructorRate(BaseModel):
    """마스터에 등록된 강사의 한도."""

    name: str
    max_hourly_rate: float | None = None
    max_daily_rate: float | None = None


class BudgetRules(BaseModel):
    """예산·강사료 검산용 룰."""

    default_max_hourly_rate: float | None = Field(
        default=None, description="마스터에 없는 강사 적용 기본 한도"
    )
    instructors: list[InstructorRate] = Field(default_factory=list)


class SectionTemplate(BaseModel):
    """발주처 표준 섹션 체크리스트."""

    required_titles: list[str] = Field(
        default_factory=list, description="정확히 일치 또는 포함되어야 하는 섹션 제목"
    )
    title_aliases: dict[str, list[str]] = Field(
        default_factory=dict, description="허용되는 표기 변이. key는 표준 명칭"
    )
