#!/usr/bin/env python3
"""Build a self-contained HTML game using only the Python standard library."""
from pathlib import Path
ROOT = Path(__file__).resolve().parent
html = (ROOT / 'src/shell.html').read_text(encoding='utf-8')
css = (ROOT / 'src/style.css').read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="src/style.css">', '<style>\n' + css + '\n</style>')
for name in ('engine', 'network', 'render', 'app'):
    js = (ROOT / f'src/{name}.js').read_text(encoding='utf-8')
    if '</script' in js.lower():
        raise ValueError(f'Unsafe inline script terminator in {name}.js')
    html = html.replace(f'<script src="src/{name}.js"></script>', '<script>\n' + js + '\n</script>')
(ROOT / 'index.html').write_text(html, encoding='utf-8')
print(f'Built {ROOT / "index.html"} ({len(html.encode("utf-8")):,} bytes)')
