"""6개 surveyStatisticsStepUserListExcel 파일에서 이름·소속·전화 추출 후 헤더/통계 출력."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
import importlib.util
spec = importlib.util.spec_from_file_location('parser', os.path.join(os.path.dirname(__file__), '_parse-survey-xls.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
parse = mod.parse

files = [
    'surveyStatisticsStepUserListExcel.xls',
    'surveyStatisticsStepUserListExcel (1).xls',
    'surveyStatisticsStepUserListExcel (2).xls',
    'surveyStatisticsStepUserListExcel (3).xls',
    'surveyStatisticsStepUserListExcel (4).xls',
    'surveyStatisticsStepUserListExcel (5).xls'
]
DOWNLOADS = r'C:\Users\USER\Downloads'

output = {}
for fname in files:
    path = os.path.join(DOWNLOADS, fname)
    rows = parse(path)
    header = rows[0] if rows else []
    data = rows[1:] if len(rows) > 1 else []
    # 헤더 식별: NO/이름/전화번호/소속기관명/소속기관/응시일/응시일자 등
    print(f"\n=== {fname} === rows={len(rows)} cols={len(header)}")
    print(f"헤더: {' | '.join(header[:13])}")
    # 컬럼 인덱스 찾기
    idx = {}
    for i, h in enumerate(header):
        if h.strip() == '이름': idx['name'] = i
        elif '소속기관' in h and idx.get('org') is None: idx['org'] = i
        elif '전화' in h: idx['phone'] = i
        elif h.strip() == '이메일': idx['email'] = i
        elif h.strip() == 'NO': idx['no'] = i
    print(f"  인덱스: {idx}")
    # 학생 추출
    students = []
    for r in data:
        if len(r) <= max(idx.values(), default=0):
            continue
        students.append({
            'name': r[idx.get('name', 2)].strip(),
            'org': r[idx.get('org', 6)].strip(),
            'phone': r[idx.get('phone', 3)].strip(),
            'email': r[idx.get('email', 4)].strip() if 'email' in idx else ''
        })
    print(f"  학생 수: {len(students)}명")
    if students:
        print(f"  첫 3명: {students[:3]}")
    output[fname] = {'header': header, 'students': students}

# JSON으로 저장 — TS에서 사용
with open('/tmp/survey-files.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False)
print(f"\nJSON 저장: /tmp/survey-files.json")
