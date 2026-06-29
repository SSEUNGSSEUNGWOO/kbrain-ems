"""Extract clean paragraph text from extracted docx XML, write to a target file."""
import xml.etree.ElementTree as ET
import sys

xml_path = sys.argv[1]
out_path = sys.argv[2]

tree = ET.parse(xml_path)
root = tree.getroot()
lines = []
for p in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
    parts = []
    for t in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'):
        if t.text:
            parts.append(t.text)
    text = ''.join(parts).strip()
    if text:
        lines.append(text)

with open(out_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))
print(f'{len(lines)} paragraphs -> {out_path}')
