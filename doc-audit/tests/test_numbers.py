"""② 숫자 일치 검산 더미 테스트."""

from __future__ import annotations

from doc_audit.checks import numbers
from doc_audit.models import DocumentExtraction, Location, NumberClaim


def _claim(label: str, value: float, section: str, raw: str | None = None) -> NumberClaim:
    return NumberClaim(
        label=label,
        value=value,
        unit="원",
        raw=raw or f"{value:,.0f}원",
        location=Location(section=section),
    )


def test_all_match_no_issue():
    extraction = DocumentExtraction(
        numbers=[
            _claim("강사료 합계", 5_000_000, "본문 p.5"),
            _claim("강사료 합계", 5_000_000, "표 4-2"),
            _claim("강사료 합계", 5_000_000, "예산 요약"),
        ]
    )
    issues = numbers.check(extraction)
    assert issues == []


def test_mismatch_creates_issue():
    extraction = DocumentExtraction(
        numbers=[
            _claim("강사료 합계", 5_000_000, "본문 p.5"),
            _claim("강사료 합계", 4_500_000, "표 4-2"),
        ]
    )
    issues = numbers.check(extraction)
    assert len(issues) == 1
    issue = issues[0]
    assert issue.category == "number"
    assert issue.severity == "error"
    assert {loc.section for loc in issue.locations} == {"본문 p.5", "표 4-2"}


def test_label_normalization_groups_with_whitespace():
    extraction = DocumentExtraction(
        numbers=[
            _claim("교육생 인원", 50, "본문"),
            _claim("교육생인원", 60, "표"),  # 공백 다름 — 같은 항목으로 묶여야 함
        ]
    )
    issues = numbers.check(extraction)
    assert len(issues) == 1
    assert "교육생" in issues[0].message


def test_single_claim_no_issue():
    extraction = DocumentExtraction(
        numbers=[_claim("총사업비", 100_000_000, "표 1")],
    )
    assert numbers.check(extraction) == []


def test_multiple_groups_independent():
    extraction = DocumentExtraction(
        numbers=[
            _claim("강사료 합계", 5_000_000, "본문"),
            _claim("강사료 합계", 5_000_000, "표"),  # 일치
            _claim("교육생 인원", 50, "본문"),
            _claim("교육생 인원", 60, "표"),  # 불일치
        ]
    )
    issues = numbers.check(extraction)
    assert len(issues) == 1
    assert "교육생" in issues[0].message
