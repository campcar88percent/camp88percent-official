import subprocess, html, re

result = subprocess.run(['textutil', '-convert', 'txt', '-stdout', 'ex.yakkan.doc'], capture_output=True, text=True)
raw = result.stdout.strip()

lines = raw.splitlines()
out = []
for line in lines:
    s = line.strip()
    if not s:
        continue
    escaped = html.escape(s)
    if re.match(r'^第\d+章', s):
        out.append(f'<h3 class="yakkan-chapter">{escaped}</h3>')
    elif re.match(r'^第[０-９\d]+条（', s) or re.match(r'^第[０-９\d]+条\s*（', s):
        out.append(f'<h4 class="yakkan-article">{escaped}</h4>')
    elif s == '貸　渡　約　款':
        out.append(f'<h2 class="yakkan-title">{escaped}</h2>')
    elif s == '附　　則':
        out.append(f'<h3 class="yakkan-chapter">{escaped}</h3>')
    else:
        out.append(f'<p class="yakkan-p">{escaped}</p>')

content = '\n'.join(out)

with open('yakkan-content.html', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'Generated yakkan-content.html: {len(content)} chars, {len(out)} elements')
