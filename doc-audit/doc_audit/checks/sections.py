"""⑥ 필수 섹션 누락 검산.

- SectionTemplate.required_titles 의 각 표준 제목이 추출된 sections에 있어야 한다.
- title_aliases 에 등록된 표기 변이도 허용한다.
- 매칭은 공백 무시 + 포함 관계 (제목이 더 길어도 표준이 포함되면 OK).
"""

from __future__ import annotations

from doc_audit.models import DocumentExtraction, Issue, Location, SectionTemplate


def check(extraction: DocumentExtraction, template: SectionTemplate | None = None) -> list[Issue]:
    if not template or not template.required_titles:
        return []

    present_titles = [_normalize(s.title) for s in extraction.sections]
    issues: list[Issue] = []

    for required in template.required_titles:
        candidates = [required, *template.title_aliases.get(required, [])]
        norm_candidates = [_normalize(c) for c in candidates]

        if not any(_match(found, norm_candidates) for found in present_titles):
            issues.append(
                Issue(
                    category="section",
                    severity="error",
                    message=f"필수 섹션 누락: '{required}'",
                    quote=None,
                    suggestion=None,
                    reason=(
                        "발주처 표준 체크리스트 미충족"
                        + (
                            f" (허용 변이: {', '.join(candidates[1:])})"
                            if len(candidates) > 1
                            else ""
                        )
                    ),
                    locations=[Location(section=None, context=None)],
                )
            )

    return issues


def _normalize(s: str) -> str:
    return "".join(s.split())


def _match(found: str, candidates: list[str]) -> bool:
    return any(c in found or found in c for c in candidates)
