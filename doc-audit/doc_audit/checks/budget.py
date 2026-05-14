"""⑤ 강사료 한도 + 산식 검산.

- BudgetLine.total 이 있으면 unit_price * quantity 와 일치
- BudgetRules.instructors 에 강사가 있으면 단가가 한도 이하
- 없으면 default_max_hourly_rate 적용 (시간 단위 한정)
"""

from __future__ import annotations

import math

from doc_audit.models import BudgetLine, BudgetRules, DocumentExtraction, Issue


# 산식 비교 허용 오차 (반올림 처리 흔함)
_FORMULA_TOLERANCE = 1.0  # 원


def check(extraction: DocumentExtraction, rules: BudgetRules | None = None) -> list[Issue]:
    issues: list[Issue] = []
    rules = rules or BudgetRules()
    instructor_map = {ins.name: ins for ins in rules.instructors}

    for line in extraction.budget_lines:
        # 산식 검증
        if line.total is not None:
            expected = line.unit_price * line.quantity
            if not math.isclose(expected, line.total, abs_tol=_FORMULA_TOLERANCE):
                issues.append(
                    Issue(
                        category="budget",
                        severity="error",
                        message=(
                            f"'{line.label}' 산식 불일치: "
                            f"{line.unit_price:,.0f} × {line.quantity:g} = {expected:,.0f}, "
                            f"기재값 {line.total:,.0f}"
                        ),
                        quote=line.raw,
                        suggestion=f"{expected:,.0f}",
                        reason="단가 × 수량 ≠ 합계",
                        locations=[line.location],
                    )
                )

        # 한도 검증
        rate_issue = _check_rate_limit(line, rules, instructor_map)
        if rate_issue:
            issues.append(rate_issue)

    return issues


def _check_rate_limit(line: BudgetLine, rules: BudgetRules, instructor_map: dict) -> Issue | None:
    if line.unit_quantity not in ("시간", "시", "h"):
        return None

    limit: float | None = None
    source: str

    if line.instructor_name and line.instructor_name in instructor_map:
        limit = instructor_map[line.instructor_name].max_hourly_rate
        source = f"마스터: {line.instructor_name}"
    elif rules.default_max_hourly_rate is not None:
        limit = rules.default_max_hourly_rate
        source = "기본 한도"
    else:
        return None

    if limit is None or line.unit_price <= limit:
        return None

    return Issue(
        category="budget",
        severity="error",
        message=(
            f"'{line.label}' 시간당 단가 {line.unit_price:,.0f}원이 한도 {limit:,.0f}원 초과 ({source})"
        ),
        quote=line.raw,
        suggestion=f"{limit:,.0f}",
        reason=f"한도 위반 ({source})",
        locations=[line.location],
    )
