"""⑥ 누락 섹션 검산 더미 테스트."""

from __future__ import annotations

from doc_audit.checks import sections
from doc_audit.models import (
    DocumentExtraction,
    Location,
    SectionPresence,
    SectionTemplate,
)


def _section(title: str) -> SectionPresence:
    return SectionPresence(title=title, location=Location(section=title))


def test_all_required_present():
    template = SectionTemplate(
        required_titles=["사업개요", "추진체계", "예산 산정"],
    )
    extraction = DocumentExtraction(
        sections=[_section(t) for t in ["사업개요", "추진체계", "예산 산정"]]
    )
    assert sections.check(extraction, template) == []


def test_missing_required_creates_issue():
    template = SectionTemplate(required_titles=["사업개요", "예산 산정"])
    extraction = DocumentExtraction(sections=[_section("사업개요")])
    issues = sections.check(extraction, template)
    assert len(issues) == 1
    assert "예산 산정" in issues[0].message


def test_alias_matches():
    template = SectionTemplate(
        required_titles=["사업비 산정 내역"],
        title_aliases={"사업비 산정 내역": ["예산 산정", "사업비 내역"]},
    )
    extraction = DocumentExtraction(sections=[_section("예산 산정")])
    assert sections.check(extraction, template) == []


def test_containment_matches():
    template = SectionTemplate(required_titles=["예산"])
    extraction = DocumentExtraction(sections=[_section("Ⅷ. 예산 산정 내역")])
    assert sections.check(extraction, template) == []


def test_no_template_no_check():
    extraction = DocumentExtraction()
    assert sections.check(extraction, None) == []
    assert sections.check(extraction, SectionTemplate()) == []
