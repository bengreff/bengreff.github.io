"""Turn a story Markdown file (verse lines + prose letters) into a page on the site.

Usage: python3 tools/build_story.py SOURCE.md OUT_DIR "Page title"
Sections are separated by two or more blank lines. A section that starts with "Dear" is a prose
letter: paragraphs split on blank lines, consecutive lines joined with <br>. Every other section is
verse: one line per line, leading spaces dropped (the page centres each line itself).
Afterwards it checks that the page text matches the source word for word.
"""
import html
import re
import sys
from pathlib import Path

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · Ben Greff</title>
<meta name="description" content="{title}, a story in verse with two letters, by Ben Greff.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Schibsted+Grotesk:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body class="plain">
<header class="top">
  <a class="name" href="/">Ben Greff</a>
  <nav><a href="/">Projects</a><a href="/fiction/" aria-current="page">Fiction &amp; art</a></nav>
</header>

<main class="read">
<article class="paper">
<h1>{title}</h1>
{body}
</article>
</main>

<footer><a href="https://github.com/bengreff">github.com/bengreff</a></footer>
<script>
  // The verse's shape is its line lengths, so on narrow screens shrink every verse block to one
  // common size at which the longest line fits, instead of wrapping lines.
  function fitVerse() {{
    const vs = [...document.querySelectorAll('.verse')];
    if (!vs.length) return;
    vs.forEach(v => v.style.fontSize = '');
    const avail = vs[0].parentElement.clientWidth;
    const widest = Math.max(...vs.map(v => v.scrollWidth));
    if (widest > avail) {{
      const base = parseFloat(getComputedStyle(vs[0]).fontSize);
      const size = Math.max(6, base * avail / widest * 0.98);
      vs.forEach(v => v.style.fontSize = size + 'px');
    }}
  }}
  fitVerse();
  window.addEventListener('resize', fitVerse);
  if (document.fonts) document.fonts.ready.then(fitVerse);
</script>
</body>
</html>
"""


def build(src: Path, title: str) -> tuple[str, str]:
    text = src.read_text()
    lines = text.splitlines()
    if lines and lines[0].startswith('# '):
        lines = lines[1:]
    body = '\n'.join(lines).strip('\n')
    sections = re.split(r'\n[ \t]*\n(?:[ \t]*\n)+', body)
    out = []
    for sec in sections:
        sec = sec.strip('\n')
        if not sec.strip():
            continue
        if sec.lstrip().startswith('Dear'):
            paras = re.split(r'\n[ \t]*\n', sec)
            ps = ['<br>'.join(html.escape(l.strip()) for l in p.splitlines()) for p in paras if p.strip()]
            out.append('<div class="letter">\n' + '\n'.join(f'<p>{p}</p>' for p in ps) + '\n</div>')
        else:
            vl = [html.escape(l.strip()) for l in sec.splitlines()]
            out.append('<div class="verse-wrap"><div class="verse">' + '\n'.join(vl) + '</div></div>')
    return text, '\n'.join(out)


def words(s: str) -> list[str]:
    return s.split()


def main() -> None:
    src, out_dir, title = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    text, body = build(src, title)
    page = PAGE.format(title=html.escape(title), body=body)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / 'index.html').write_text(page)

    # Word-for-word check: source (minus its "# Title" line) against the article body text.
    src_words = words('\n'.join(l for l in text.splitlines() if not l.startswith('# ')))
    page_words = words(html.unescape(re.sub(r'<[^>]+>', ' ', body.replace('<br>', ' '))))
    if src_words != page_words:
        for i, (a, b) in enumerate(zip(src_words, page_words)):
            if a != b:
                sys.exit(f'MISMATCH at word {i}: source {a!r} page {b!r}')
        sys.exit(f'MISMATCH in length: source {len(src_words)} page {len(page_words)}')
    print(f'ok: {len(src_words)} words match; {body.count("class=\"verse\"")} verse blocks, '
          f'{body.count("class=\"letter\"")} letters')


if __name__ == '__main__':
    main()
