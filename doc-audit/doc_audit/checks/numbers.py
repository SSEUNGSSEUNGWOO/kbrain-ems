"""② 숫자 일치 검산.

같은 `label`로 주장된 NumberClaim들의 `value`가 모두 일치해야 한다.
불일치하면 한 그룹당 Issue 1건 생성하고 모든 위치를 묶어 보고한다.
"""

from __future__ import annotations

from collections import defaultdict

from doc_audit.models import DocumentExtraction, Issue, NumberClaim


def check(extraction: DocumentExtraction) -> list[Issue]:
    groups: dict[str, list[NumberClaim]] = defaultdict(list)
    for claim in extraction.numbers:
        groups[_normalize_label(claim.label)].append(claim)

    issues: list[Issue] = []
    for label, claims in groups.items():
        if len(claims) < 2:
            continue
        distinct_values = {c.value for c in claims}
        if len(distinct_values) == 1:
            continue

        sorted_values = sorted(distinct_values)
        issues.append(
            Issue(
                category="number",
                severity="error",
                message=f"'{label}' 수치가 본문 내에서 어긋납니다 ({sorted_values})",
                quote=" / ".join(c.raw for c in claims),
                suggestion=None,
                reason=(
                    f"동일 항목의 값이 {len(distinct_values)}가지로 나타남: "
                    + ", ".join(f"{c.raw}@{_loc(c)}" for c in claims)
                ),
                locations=[c.location for c in claims],
            )
        )
    return issues


def _normalize_label(label: str) -> str:
    return "".join(label.split()).lower()


def _loc(claim: NumberClaim) -> str:
    section = claim.location.section or "?"
    return section
