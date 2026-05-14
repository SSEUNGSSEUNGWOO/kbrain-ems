"""③ 날짜 정합성 검산.

다음을 확인한다:
- DateClaim의 weekday_text가 있으면 실제 요일과 일치
- DateRangeClaim의 start ≤ end
"""

from __future__ import annotations

from doc_audit.models import DocumentExtraction, Issue, Location


_WEEKDAY_KO = "월화수목금토일"


def check(extraction: DocumentExtraction) -> list[Issue]:
    issues: list[Issue] = []

    # 요일 검증
    for claim in extraction.dates:
        if not claim.weekday_text:
            continue
        actual = _WEEKDAY_KO[claim.value.weekday()]
        stated = claim.weekday_text.strip().rstrip("요일")
        if stated and stated != actual:
            issues.append(
                Issue(
                    category="date",
                    severity="error",
                    message=f"{claim.value.isoformat()} 의 요일은 '{actual}'인데 '{stated}'로 표기됨",
                    quote=claim.raw,
                    suggestion=claim.raw.replace(stated, actual, 1),
                    reason=f"달력상 {claim.value.isoformat()} = {actual}요일",
                    locations=[claim.location],
                )
            )

    # 기간 역전 검증
    for rng in extraction.date_ranges:
        if rng.start > rng.end:
            issues.append(
                Issue(
                    category="date",
                    severity="error",
                    message=f"시작일({rng.start.isoformat()})이 종료일({rng.end.isoformat()})보다 늦습니다",
                    quote=rng.raw,
                    suggestion=None,
                    reason="기간 역전",
                    locations=[rng.location],
                )
            )

    # period(전체 사업기간)도 동일 룰
    if extraction.period and extraction.period.start > extraction.period.end:
        issues.append(
            Issue(
                category="date",
                severity="error",
                message=f"사업기간 역전: {extraction.period.start} → {extraction.period.end}",
                quote=extraction.period.raw,
                reason="기간 역전",
                locations=[extraction.period.location],
            )
        )

    return issues
