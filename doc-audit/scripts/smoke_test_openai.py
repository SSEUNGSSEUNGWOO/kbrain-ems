"""OpenAI Structured Outputs 스모크 테스트.

목적: doc-audit가 채택할 핵심 패턴을 한 번에 검증한다.
- Pydantic 스키마를 response_format으로 넘기는 strict 모드
- 한국어 문서 컨텍스트에서의 정확한 JSON 추출
- 결정론 검산이 받을 입력 형태(위치·증거·종류) 그대로 생성되는지

성공 조건: 의도적으로 박은 오타·표기 변이를 LLM이 스키마 형태로 정확히 잡아낸다.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel, Field


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

# doc-audit/.env 우선, 없으면 daeasy/ai-service/.env fallback (회사 키 재사용 편의)
load_dotenv(ROOT / ".env")
load_dotenv(Path(r"C:\Dev\kbrain\daeasy\ai-service\.env"), override=False)


# --- 검수 결과 스키마 (실제 doc-audit가 쓸 형태의 미니 버전) -------------------

class Issue(BaseModel):
    category: Literal["terminology", "name_typo", "number", "date", "budget", "section"]
    severity: Literal["error", "warning"]
    quote: str = Field(..., description="문서에서 그대로 인용한 문제 부분")
    suggestion: str = Field(..., description="제안 수정문")
    reason: str = Field(..., description="왜 오류인지 한 문장")


class AuditResult(BaseModel):
    issues: list[Issue]
    summary: str = Field(..., description="검수 1줄 요약")


# --- 토이 입력 ---------------------------------------------------------------

SYSTEM = """너는 NIA 산출물 검수 보조다. 주어진 문장에서 다음을 찾아 JSON으로만 답한다:
- terminology: 같은 대상을 부르는 표기 불일치 (예: NIA / 한국지능정보사회진흥원)
- name_typo: 인명·기관명 오타 (예: 진흥원 → 진흥워)
- number: 같은 수치가 본문 안에서 어긋남
- date: 날짜·요일 모순

확실히 오류인 것만 기록한다. 모호한 건 빼라."""

USER = """다음 본문에서 오류를 찾아라:

본문:
이번 사업의 주관기관은 한국지능정보사회진흥원이며, NIA가 5,000,000원의 강사료를 지급한다.
지급일은 2026년 5월 14일(수)이며, 한국지능정보사회진흥워의 승인이 필요하다.
강사료 합계는 4,500,000원이다."""


def main() -> int:
    if not os.environ.get("OPENAI_API_KEY"):
        print("[FAIL] OPENAI_API_KEY 가 .env 에 없습니다.")
        print(f"       채울 위치: {ROOT / '.env'}")
        return 1

    model = os.environ.get("OPENAI_MODEL", "gpt-4o-2024-08-06")
    client = OpenAI()

    print(f"[1/3] OpenAI 호출 ({model}) ...")
    try:
        completion = client.beta.chat.completions.parse(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": USER},
            ],
            response_format=AuditResult,
        )
    except Exception as e:
        print(f"[FAIL] OpenAI 호출 실패: {e!r}")
        return 1

    result = completion.choices[0].message.parsed
    if result is None:
        refusal = completion.choices[0].message.refusal
        print(f"[FAIL] 파싱된 응답이 None. refusal={refusal!r}")
        return 1

    print(f"[2/3] 응답 {len(result.issues)}건 ─ 요약: {result.summary}")
    for i, issue in enumerate(result.issues, 1):
        print(f"  ({i}) [{issue.category}/{issue.severity}] {issue.quote!r}")
        print(f"      → {issue.suggestion}")
        print(f"      ∵ {issue.reason}")

    # --- 최소 검증: 오타·표기·숫자 셋 다 잡았는지 ----------------------------
    cats = {i.category for i in result.issues}
    must_have = {"terminology", "name_typo", "number"}
    missing = must_have - cats
    if missing:
        print(f"[3/3] PARTIAL — 다음 카테고리 누락: {missing}")
        print("       (LLM 환각/누락 영역. 프롬프트 튜닝 또는 모델 상향 필요)")
        return 2

    print("[3/3] PASS — Structured Outputs 동작 + 3종 오류 모두 검출")
    return 0


if __name__ == "__main__":
    sys.exit(main())
