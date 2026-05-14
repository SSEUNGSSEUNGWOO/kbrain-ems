"""③ 날짜 정합성 검산 더미 테스트."""

from __future__ import annotations

from datetime import date

from doc_audit.checks import dates
from doc_audit.models import (
    DateClaim,
    DateRangeClaim,
    DocumentExtraction,
    Location,
)


# 2026-05-14 는 목요일
# 2026-05-13 은 수요일
# 2026-05-15 은 금요일


def _date_claim(d: date, weekday_text: str | None, raw: str | None = None) -> DateClaim:
    return DateClaim(
        value=d,
        weekday_text=weekday_text,
        raw=raw or f"{d.isoformat()}({weekday_text})",
        location=Location(section="본문"),
    )


def test_weekday_matches_no_issue():
    extraction = DocumentExtraction(
        dates=[_date_claim(date(2026, 5, 14), "목")],
    )
    assert dates.check(extraction) == []


def test_weekday_mismatch_creates_issue():
    extraction = DocumentExtraction(
        dates=[_date_claim(date(2026, 5, 14), "수")],
    )
    issues = dates.check(extraction)
    assert len(issues) == 1
    assert "목" in issues[0].message and "수" in issues[0].message


def test_weekday_with_suffix_normalized():
    extraction = DocumentExtraction(
        dates=[_date_claim(date(2026, 5, 14), "목요일")],
    )
    assert dates.check(extraction) == []


def test_missing_weekday_no_check():
    extraction = DocumentExtraction(
        dates=[_date_claim(date(2026, 5, 14), None, raw="2026-05-14")],
    )
    assert dates.check(extraction) == []


def test_range_reversed_creates_issue():
    extraction = DocumentExtraction(
        date_ranges=[
            DateRangeClaim(
                start=date(2026, 6, 1),
                end=date(2026, 5, 1),
                raw="2026-06-01 ~ 2026-05-01",
                location=Location(section="개요"),
            )
        ]
    )
    issues = dates.check(extraction)
    assert len(issues) == 1
    assert issues[0].reason == "기간 역전"


def test_period_reversed_creates_issue():
    extraction = DocumentExtraction(
        period=DateRangeClaim(
            start=date(2026, 12, 31),
            end=date(2026, 1, 1),
            raw="사업기간: 2026-12-31~2026-01-01",
            location=Location(section="사업개요"),
        )
    )
    issues = dates.check(extraction)
    assert len(issues) == 1
    assert "사업기간 역전" in issues[0].message
