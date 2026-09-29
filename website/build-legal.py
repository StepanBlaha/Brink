#!/usr/bin/env python3
"""Converts ../legal/*.md into privacy.html, terms.html, acknowledgements.html.
Usage: python3 website/build-legal.py   (tiny Markdown subset: headings, paragraphs, lists, tables, bold/italic/code/links)"""
import re, html, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
LEGAL = ROOT.parent / "legal"
BASE = "https://brink.example"  # replaced by apply-config.sh
PAGES = [
    ("PRIVACY.md", "privacy.html", "Privacy Policy", "Brink's privacy policy: your data stays between your Mac and Notion. No analytics, no tracking, no server."),
    ("TERMS.md", "terms.html", "Terms of Use", "The terms of use for Brink, an independent Mac app that works with Notion."),
    ("NOTICE.md", "acknowledgements.html", "Acknowledgements", "Third-party notices and acknowledgements for Brink."),
]

def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])[_*]([^_*]+)[_*](?![\w*])", r"<em>\1</em>", s)
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2" rel="noopener">\1</a>', s)
    return s

def convert(md):
    out, lines, i = [], md.splitlines(), 0
    while i < len(lines):
        l = lines[i]
        if not l.strip(): i += 1; continue
        m = re.match(r"(#{1,3}) (.+)", l)
        if m:
            n = len(m.group(1)); out.append(f"<h{n}>{inline(m.group(2))}</h{n}>"); i += 1; continue
        if l.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")]); i += 1
            head, body = rows[0], [r for r in rows[2:]]
            t = "<table><thead><tr>" + "".join(f"<th scope='col'>{inline(c)}</th>" for c in head) + "</tr></thead><tbody>"
            for r in body: t += "<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>"
            out.append(t + "</tbody></table>"); continue
        if re.match(r"(- |\d+\. )", l):
            tag = "ul" if l.startswith("- ") else "ol"
            items = []
            while i < len(lines) and re.match(r"(- |\d+\. )", lines[i]):
                items.append(re.sub(r"^(- |\d+\. )", "", lines[i])); i += 1
                while i < len(lines) and lines[i].startswith("  ") and lines[i].strip():
                    items[-1] += " " + lines[i].strip(); i += 1
            out.append(f"<{tag}>" + "".join(f"<li>{inline(x)}</li>" for x in items) + f"</{tag}>"); continue
        para = []
        while i < len(lines) and lines[i].strip() and not lines[i].startswith(("#", "|", "- ")):
            para.append(lines[i].strip()); i += 1
        out.append(f"<p>{inline(' '.join(para))}</p>")
    return "\n".join(out)

TEMPLATE = (ROOT / "tools" / "legal-template.html").read_text()
for src, dst, title, desc in PAGES:
    body = convert((LEGAL / src).read_text())
    body = re.sub(r"^<h1>.*?</h1>", "", body, count=1)  # template renders the h1
    page = (TEMPLATE.replace("{{TITLE}}", title).replace("{{DESC}}", html.escape(desc))
            .replace("{{FILE}}", dst).replace("{{BASE}}", BASE).replace("{{BODY}}", body))
    (ROOT / dst).write_text(page)
    print("wrote", dst)
