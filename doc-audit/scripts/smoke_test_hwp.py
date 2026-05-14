"""pyhwpx smoke test — 한/글 자동 실행/쓰기/저장/재열기/읽기.

성공 조건: 작성한 텍스트가 재열기 후에도 그대로 읽힌다.
실패 시 출력에서 막힌 단계가 명확히 드러나게 한다.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path


EXPECTED = "doc-audit 스모크 테스트: 강사료 5,000,000원 / 2026-05-14 / 한국지능정보사회진흥원"


def main() -> int:
    try:
        from pyhwpx import Hwp
    except Exception as e:
        print(f"[FAIL] pyhwpx import: {e}")
        return 1

    tmpdir = Path(tempfile.mkdtemp(prefix="docaudit_smoke_"))
    hwp_path = tmpdir / "smoke.hwp"
    print(f"[INFO] 임시 경로: {hwp_path}")

    # 1) 새 문서 생성 + 텍스트 삽입 + 저장
    try:
        print("[1/4] 한/글 실행 + 텍스트 삽입 ...")
        hwp = Hwp(new=True, visible=True)
        hwp.insert_text(EXPECTED)
        hwp.save_as(str(hwp_path))
        hwp.quit()
        print(f"      저장 완료: {hwp_path.exists()=}")
    except Exception as e:
        print(f"[FAIL] 1단계 실패: {e!r}")
        return 1

    if not hwp_path.exists():
        print("[FAIL] 저장 파일이 생성되지 않았습니다.")
        return 1

    # 2) 재열기 + 본문 읽기
    try:
        print("[2/4] 재열기 + 본문 추출 ...")
        hwp = Hwp(new=False, visible=True)
        opened = hwp.open(str(hwp_path))
        print(f"      open() 반환: {opened!r}")
        body = hwp.GetTextFile("TEXT", "")
        hwp.quit()
        print(f"      추출 길이: {len(body)} 문자")
    except Exception as e:
        print(f"[FAIL] 2단계 실패: {e!r}")
        return 1

    # 3) 검증
    print("[3/4] 본문 검증 ...")
    body_norm = body.replace("\r", "").replace("\n", "")
    if EXPECTED not in body_norm:
        print("[FAIL] 기대 문구가 본문에 없습니다.")
        print(f"       기대: {EXPECTED!r}")
        print(f"       실제 앞 200자: {body_norm[:200]!r}")
        return 1

    # 4) 결과
    print("[4/4] PASS — pyhwpx 채택 가능. 한/글 COM 자동화 동작 확인.")
    print(f"       샘플 hwp 보관: {hwp_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
