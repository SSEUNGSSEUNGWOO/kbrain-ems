"""각 .xls(HTML) 파일에서 학생 명단 추출 — 어느 cohort/과정인지 식별 + 이름·소속·연락처."""
import sys, os, re
from html.parser import HTMLParser

class XLSParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.current_row = None
        self.current_cell = None
        self.in_cell = False

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.current_row = []
        elif tag == 'td' or tag == 'th':
            self.current_cell = []
            self.in_cell = True

    def handle_endtag(self, tag):
        if tag == 'tr' and self.current_row is not None:
            if any(c.strip() for c in self.current_row):
                self.rows.append(self.current_row)
            self.current_row = None
        elif tag in ('td', 'th') and self.current_cell is not None and self.current_row is not None:
            text = ' '.join(''.join(self.current_cell).split())
            self.current_row.append(text)
            self.current_cell = None
            self.in_cell = False

    def handle_data(self, data):
        if self.in_cell and self.current_cell is not None:
            self.current_cell.append(data)

def parse(path):
    # try EUC-KR / CP949 first, fallback UTF-8
    for enc in ('cp949', 'euc-kr', 'utf-8'):
        try:
            with open(path, 'r', encoding=enc) as f:
                html = f.read()
            p = XLSParser()
            p.feed(html)
            return p.rows
        except UnicodeDecodeError:
            continue
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        html = f.read()
    p = XLSParser()
    p.feed(html)
    return p.rows

if __name__ == '__main__':
    path = sys.argv[1]
    rows = parse(path)
    base = os.path.basename(path)
    print(f"=== {base} === ({len(rows)} rows)")
    # 헤더 추정 — 가장 긴 짧은 row 찾기 (보통 첫 row가 헤더)
    for i, r in enumerate(rows[:5]):
        print(f"  row {i} ({len(r)}cols): {' | '.join(r[:10])}{' ...' if len(r) > 10 else ''}")
