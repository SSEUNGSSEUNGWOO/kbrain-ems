"""그린 자기주도형 1회차 xls 파일을 JSON으로 파싱."""
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import pandas as pd
import math

XLS = r'C:/Users/USER/Desktop/(260703_1800) 2026년 AI 챔피언 그린(초급) 수행평가 1회차 (7월 28일, 자기주도형).xls'
OUT = r'C:/Dev/kbrain/kbrain-ems/frontend/scripts/_green-sd1-applicants.json'

df = pd.read_excel(XLS, engine='xlrd', header=0)
print(f'행수: {len(df)}, 컬럼수: {len(df.columns)}')

def norm(v):
    if v is None: return None
    if isinstance(v, float) and math.isnan(v): return None
    s = str(v).strip()
    if s in ('', 'nan', 'None'): return None
    return s

survey_cols = [c for c in df.columns if str(c).startswith('설문항목')]
print(f'사전설문 컬럼 수: {len(survey_cols)}')

records = []
for _, row in df.iterrows():
    name = norm(row.get('이름'))
    email = norm(row.get('이메일'))
    phone = norm(row.get('전화번호'))
    if not name or not email or not phone:
        continue
    survey = {}
    for c in survey_cols:
        v = norm(row.get(c))
        if v is not None:
            survey[str(c)] = v
    records.append({
        'name': name,
        'email': email.lower(),
        'phone': phone,
        'organization': norm(row.get('소속기관')),
        'organization_category': norm(row.get('소속기관구분')),
        'login_id': norm(row.get('아이디')),
        'survey': survey
    })

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(records, f, ensure_ascii=False, indent=2)
print(f'저장: {OUT}  {len(records)}건')
