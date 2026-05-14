"""⑤ 강사료 한도/산식 검산 더미 테스트."""

from __future__ import annotations

from doc_audit.checks import budget
from doc_audit.models import (
    BudgetLine,
    BudgetRules,
    DocumentExtraction,
    InstructorRate,
    Location,
)


def _line(**overrides) -> BudgetLine:
    defaults = dict(
        label="강사료",
        instructor_name=None,
        unit_price=200_000.0,
        quantity=2.0,
        unit_quantity="시간",
        total=400_000.0,
        raw="강사료 200,000원 × 2시간 = 400,000원",
        location=Location(section="예산표"),
    )
    defaults.update(overrides)
    return BudgetLine(**defaults)


def test_formula_match_no_issue():
    extraction = DocumentExtraction(budget_lines=[_line()])
    assert budget.check(extraction) == []


def test_formula_mismatch_creates_issue():
    extraction = DocumentExtraction(budget_lines=[_line(total=500_000.0)])
    issues = budget.check(extraction)
    assert len(issues) == 1
    assert "산식 불일치" in issues[0].message


def test_rate_limit_per_instructor_master():
    rules = BudgetRules(
        instructors=[InstructorRate(name="김강사", max_hourly_rate=150_000)]
    )
    extraction = DocumentExtraction(
        budget_lines=[_line(instructor_name="김강사", unit_price=200_000, total=400_000)]
    )
    issues = budget.check(extraction, rules)
    assert any("한도" in i.message for i in issues)


def test_rate_limit_default_when_no_master():
    rules = BudgetRules(default_max_hourly_rate=150_000)
    extraction = DocumentExtraction(
        budget_lines=[_line(unit_price=200_000, total=400_000)]
    )
    issues = budget.check(extraction, rules)
    assert any("한도" in i.message and "기본 한도" in i.reason for i in issues)


def test_rate_limit_skipped_for_non_hourly_unit():
    rules = BudgetRules(default_max_hourly_rate=150_000)
    extraction = DocumentExtraction(
        budget_lines=[
            _line(unit_quantity="일", unit_price=500_000, quantity=2, total=1_000_000)
        ]
    )
    # 일당 단가에는 시간당 한도 적용 안 됨
    issues = budget.check(extraction, rules)
    assert issues == []


def test_no_rules_no_rate_check():
    extraction = DocumentExtraction(
        budget_lines=[_line(unit_price=999_999_999, total=1_999_999_998)]
    )
    assert budget.check(extraction) == []  # rules 없으면 한도 검증 안 함


def test_rounding_tolerance():
    # 단가 × 수량이 반올림으로 1원 어긋나면 허용
    extraction = DocumentExtraction(
        budget_lines=[_line(unit_price=333_333.0, quantity=3.0, total=999_999.0)]
    )
    issues = budget.check(extraction)
    assert issues == []
