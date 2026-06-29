import json, sys
p = r'C:\Dev\kbrain\kbrain-ems\frontend\scripts\data\application-questions-seed.json'
d = json.load(open(p, encoding='utf-8'))
print('common items:', len(d['common']))
for q in d['common']:
    print(f"  - {q['question_no']:<14} [{q.get('question_type')}] {q['question_text'][:60]}")
print()
print('courses:')
for c in d['courses']:
    label = c.get('cohort_name') or c.get('cohort_name_prefix')
    qs = c['questions']
    print(f"  code={c['code']:<3} {label} -> {len(qs)} q's")
    for q in qs:
        marker = ''
        if 'TODO' in q['question_text']:
            marker = ' [TODO]'
        print(f"     {q['question_no']:<8} [{q.get('question_type')}] correct={q.get('correct_choice','-')}{marker}")
