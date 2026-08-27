#!/usr/bin/env python3
"""
Build the feature handbook from the user-facing section of every feature doc.

Emits two files, both generated, neither hand-edited:

  docs/features/HANDBOOK.md     this repo's features, for Code sessions and repo readers
  docs/features/HANDBOOK.html   this repo's features, as a page

And with --all, a cross-product handbook covering every product repo on this machine.
That one is deliberately NOT committed to any repo: it is an aggregate no single repo
owns, and committing it into `novara` would make `novara` look like the owner of the
host platform's documentation. It is built locally (only a machine with every checkout
can build it), published as an Artifact, and rebuilt by the weekly-repo-sweep routine.

  python3 scripts/eng/build_feature_handbook.py            this repo
  python3 scripts/eng/build_feature_handbook.py --check    CI: fail if stale
  python3 scripts/eng/build_feature_handbook.py --all [out.html]   every product repo

Feature docs are authored in the repo that owns the feature, next to the code, so the
surface map and the user-facing description are updated in one commit and cannot drift.
This script extracts only the "What it does" section from each and concatenates them into
one handbook: the readable, shareable, cross-product copy.

The handbook is GENERATED. Never hand-edit it. Edit the feature doc and re-run.

  python3 scripts/eng/build_feature_handbook.py            write the handbook
  python3 scripts/eng/build_feature_handbook.py --check    fail if it is out of date

--check is what CI runs, so an edited feature doc with a stale handbook is caught at the
PR rather than discovered months later.
"""

import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
FEATURES = os.path.join(ROOT, "docs", "features")
OUT = os.path.join(FEATURES, "HANDBOOK.md")
OUT_HTML = os.path.join(FEATURES, "HANDBOOK.html")
# Files in docs/features/ that are engineering docs rather than features. An
# ALL-CAPS basename is the convention: CONSUMERS.md, HANDBOOK.md, README.md are
# about the docs, not about a feature. A feature file is named for the feature.
SKIP_EXACT = {"README.md", "0000-template.md"}


def is_feature_file(name):
    if not name.endswith(".md") or name in SKIP_EXACT:
        return False
    stem = name[:-3]
    # HANDBOOK, CONSUMERS, and anything else shouted in caps is meta.
    if stem.upper() == stem:
        return False
    return True

# Product repos, in reading order.
#
# novara-matching is here despite being an engine rather than a screen, for two reasons.
# It has real users: an event host or concierge reads a rank spreadsheet through the
# Match Console. And it is the one repo whose changes propagate OUTWARD to every other
# product, so leaving it out of the shared handbook hides the dependency that matters
# most. Its docs carry the reverse index (who consumes the engine) that no downstream
# repo can hold on its own.
PRODUCT_REPOS = [
    ("Novara", "The consumer app: finding and joining runs.", "novara"),
    ("Host platform", "The coordination workspace event hosts use.", "novara-host"),
    ("Pulse", "The Pulse iOS app.", "novara-pulse"),
    ("Matching engine",
     "One engine behind every matched experience. Used directly through the Match "
     "Console, and indirectly by every product above.", "novara-matching"),
]

HEADER = """# Novara feature handbook

What every shipped feature does, in the user's language. Written for an end user, a new
hire, or a support answer. No file paths, no collection names.

> **Generated — do not edit.** Built from the "What it does" section of each doc in
> `docs/features/` by `scripts/eng/build_feature_handbook.py`. An edit here is destroyed
> the next time it runs. Change the feature doc instead.
>
> The engineering half of each feature (the surface map, the change protocol, the
> cross-product stakes) stays in `docs/features/` next to the code. Only the user-facing
> half is extracted here, so the two cannot drift: there is one author and one source.

"""


# Headings that begin the engineering half. Everything above the first of these
# is the user-facing region. Using structure rather than a required heading name
# means an author can write whatever h2s the feature actually needs.
ENGINEERING_HEADINGS = (
    "Surface map",
    "Change protocol",
    "Backward compatibility",
    "Cross-product",
    "History",
)


def user_section(text):
    """Everything from the first prose h2 up to the first engineering h2.

    Returns None when there is no prose h2 at all, which is a real gap and is
    reported rather than silently omitted.
    """
    headings = list(re.finditer(r"^##\s+(.+?)\s*$", text, re.M))
    start = end = None
    for h in headings:
        is_eng = h.group(1).strip() in ENGINEERING_HEADINGS
        if start is None and not is_eng:
            start = h.start()
        elif start is not None and is_eng:
            end = h.start()
            break
    if start is None:
        return None
    body = text[start:end] if end else text[start:]
    # Demote h2 to h3: the feature name is the handbook's h2.
    body = re.sub(r"^##\s+", "### ", body, flags=re.M)
    return body.strip()


def meta(text, label):
    m = re.search(rf"^-\s+\*\*{re.escape(label)}:\*\*\s*(.+)$", text, re.M)
    return m.group(1).strip() if m else None


def build(features_dir=None, header=True):
    features_dir = features_dir or FEATURES
    if not os.path.isdir(features_dir):
        return None

    parts, skipped = ([HEADER] if header else []), []
    for name in sorted(os.listdir(features_dir)):
        if not is_feature_file(name):
            continue
        text = open(os.path.join(features_dir, name), encoding="utf-8").read()
        title = re.search(r"^#\s+(.+)$", text, re.M)
        body = user_section(text)
        if not body:
            # Never silently omit. A feature missing from the handbook reads as
            # "we do not have that feature", which is worse than a loud gap.
            skipped.append(name)
            continue

        status = meta(text, "Status")
        released = meta(text, "Released in")
        parts.append(f"\n---\n\n## {title.group(1).strip() if title else name}\n")
        if status:
            note = f"**{status}**"
            if released and "unreleased" in released.lower():
                note += " — not in the released App Store build yet."
            parts.append(f"\n{note}\n")
        parts.append(f"\n{body}\n")

    if skipped:
        parts.append(
            "\n---\n\n## Not yet documented\n\n"
            "These features have a doc but no user-facing section written:\n\n"
            + "".join(f"- `{s}`\n" for s in skipped)
        )
    return "".join(parts), skipped


HTML_SHELL = """<title>Novara Feature Handbook</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zilla+Slab:wght@600;700&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
:root{
  --ground:#EFEEF3; --surface:#FFF; --sunk:#E4E3EC;
  --ink:#1A1826; --ink-2:#4A4760; --ink-3:#767391;
  --rule:#D6D4E2; --hair:#E7E5EF; --violet:#4F3BC9; --violet-soft:#EDEAFB;
  --f-display:"Zilla Slab",Georgia,serif;
  --f-body:"Instrument Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
  --f-mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --ground:#131220; --surface:#1C1A2B; --sunk:#232135;
  --ink:#E9E7F2; --ink-2:#B4B0C9; --ink-3:#847FA0;
  --rule:#332F49; --hair:#2A2740; --violet:#A695FF; --violet-soft:#282243;
}}
:root[data-theme="dark"]{
  --ground:#131220; --surface:#1C1A2B; --sunk:#232135;
  --ink:#E9E7F2; --ink-2:#B4B0C9; --ink-3:#847FA0;
  --rule:#332F49; --hair:#2A2740; --violet:#A695FF; --violet-soft:#282243;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--f-body);
  font-size:16.5px;line-height:1.65;-webkit-font-smoothing:antialiased;
  padding:0 24px 96px;}
.wrap{max-width:70ch;margin:0 auto;}
h1{font-family:var(--f-display);font-weight:700;font-size:clamp(32px,6vw,52px);
  line-height:1.04;letter-spacing:-.018em;margin:64px 0 0;text-wrap:balance;
  border-bottom:2px solid var(--ink);padding-bottom:24px;}
h2{font-family:var(--f-display);font-weight:600;font-size:clamp(22px,3.4vw,30px);
  line-height:1.16;margin:0 0 4px;letter-spacing:-.012em;text-wrap:balance;scroll-margin-top:20px;}
h3{font-family:var(--f-body);font-weight:600;font-size:16.5px;margin:30px 0 6px;
  color:var(--ink);letter-spacing:-.004em;}
p{margin:13px 0;text-wrap:pretty;}
hr{border:0;border-top:1px solid var(--rule);margin:56px 0 30px;}
a{color:var(--violet);text-underline-offset:2px;}
a:focus-visible{outline:2px solid var(--violet);outline-offset:3px;border-radius:2px;}
code{font-family:var(--f-mono);font-size:.85em;background:var(--sunk);
  padding:.1em .34em;border-radius:3px;}
ul{margin:13px 0;padding-left:1.15em;} li{margin:6px 0;} li::marker{color:var(--ink-3);}
blockquote{margin:22px 0;padding:16px 20px;background:var(--violet-soft);
  border-left:3px solid var(--violet);border-radius:0 4px 4px 0;color:var(--ink-2);}
blockquote p{margin:0;} blockquote p+p{margin-top:9px;}
blockquote strong{color:var(--ink);}
/* the status line that follows each feature h2 */
h2 + p > strong:first-child{font-family:var(--f-mono);font-size:11px;font-weight:500;
  letter-spacing:.1em;text-transform:uppercase;color:var(--violet);
  background:var(--violet-soft);padding:3px 8px;border-radius:3px;
  display:inline-block;}
h2 + p{margin-top:10px;color:var(--ink-2);font-size:14px;}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
html{scroll-behavior:smooth}
</style>
<div class="wrap">
{{BODY}}
</div>
"""


MD_INLINE = [
    (re.compile(r"\*\*(.+?)\*\*"), r"<strong>\1</strong>"),
    (re.compile(r"(?<!\*)\*([^*]+?)\*(?!\*)"), r"<em>\1</em>"),
    (re.compile(r"`([^`]+?)`"), r"<code>\1</code>"),
    (re.compile(r"\[([^\]]+?)\]\(([^)]+?)\)"), r'<a href="\2">\1</a>'),
]


def _inline(t):
    t = t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    for pat, rep in MD_INLINE:
        t = pat.sub(rep, t)
    return t


def to_html(md):
    """Render the handbook subset of Markdown. Not a general converter: it handles
    exactly what the feature docs use, and anything else becomes a paragraph rather
    than being silently dropped.

    Source markdown is hard-wrapped, so consecutive prose lines must be joined into
    one paragraph. Treating each line as its own paragraph is the obvious bug here
    and it renders as broken mid-sentence breaks."""
    out, buf, mode = [], [], None  # mode: None | "p" | "ul" | "quote"

    def flush():
        nonlocal buf, mode
        if not buf:
            mode = None
            return
        if mode == "p":
            out.append(f"<p>{_inline(' '.join(buf))}</p>")
        elif mode == "ul":
            out.append("<ul>" + "".join(f"<li>{_inline(i)}</li>" for i in buf) + "</ul>")
        elif mode == "quote":
            # Blank-separated groups inside a quote become separate paragraphs.
            paras, cur = [], []
            for ln in buf:
                if ln == "":
                    if cur: paras.append(" ".join(cur)); cur = []
                else:
                    cur.append(ln)
            if cur: paras.append(" ".join(cur))
            out.append("<blockquote>" + "".join(f"<p>{_inline(x)}</p>" for x in paras)
                       + "</blockquote>")
        buf, mode = [], None

    def slug(t):
        return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")

    for raw in md.split("\n"):
        line = raw.rstrip()
        stripped = line.strip()

        if not stripped:
            if mode == "quote":
                buf.append("")   # paragraph break inside the quote
            else:
                flush()
            continue

        if stripped.startswith("### "):
            flush(); out.append(f"<h3>{_inline(stripped[4:])}</h3>")
        elif stripped.startswith("## "):
            flush()
            t = stripped[3:]
            out.append(f'<h2 id="{slug(t)}">{_inline(t)}</h2>')
        elif stripped.startswith("# "):
            flush(); out.append(f"<h1>{_inline(stripped[2:])}</h1>")
        elif stripped == "---":
            flush(); out.append("<hr>")
        elif stripped.startswith("> "):
            if mode != "quote":
                flush(); mode = "quote"
            buf.append(stripped[2:].strip())
        elif stripped.startswith(("- ", "* ")):
            if mode != "ul":
                flush(); mode = "ul"
            buf.append(stripped[2:].strip())
        elif mode in ("ul", "quote") and raw.startswith(("  ", "\t")):
            # continuation of the previous list item or quote line
            if buf: buf[-1] = (buf[-1] + " " + stripped).strip()
        else:
            if mode != "p":
                flush(); mode = "p"
            buf.append(stripped)
    flush()

    return HTML_SHELL.replace("{{BODY}}", "\n".join(out))


ALL_HEADER = """# Novara product handbook

What every feature does across all three Novara products, in the user's language.
Written for an end user, a new hire, or a support answer. No file paths, no collection
names.

> **Generated — do not edit.** Built from `docs/features/` in each product repo by
> `scripts/eng/build_feature_handbook.py --all`. It is not committed to any repo, because
> it is an aggregate none of them owns. Change the feature doc in the repo that owns the
> feature.
>
> Only a machine holding every checkout can build this, so it is rebuilt by the
> `weekly-repo-sweep` routine rather than by CI.

"""


def build_all():
    """Concatenate every product repo's feature docs, grouped by product."""
    home = os.path.expanduser("~")
    parts, missing, empty = [ALL_HEADER], [], []

    for label, blurb, repo in PRODUCT_REPOS:
        d = os.path.join(home, repo, "docs", "features")
        if not os.path.isdir(os.path.join(home, repo)):
            missing.append(repo)
            continue
        built = build(features_dir=d, header=False)
        parts.append(f"\n---\n\n# {label}\n\n*{blurb}*\n")
        if built is None or not built[0].strip():
            # Never render an absent product as though it had no features. "No docs
            # yet" and "no features" are different facts and must not look alike.
            empty.append(repo)
            parts.append(f"\nNo feature docs written yet in `{repo}`.\n")
            continue
        parts.append(built[0])

    if missing:
        parts.append("\n---\n\n## Repos not found on this machine\n\n"
                     + "".join(f"- `{m}`\n" for m in missing)
                     + "\nTheir features are **absent from this handbook**, not absent "
                       "from the products.\n")
    return "".join(parts), missing, empty


def main_all(argv):
    content, missing, empty = build_all()
    out = next((a for a in argv if a.endswith(".html")), None) or os.path.join(
        FEATURES, "HANDBOOK-ALL.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(to_html(content).replace(
            "<title>Novara Feature Handbook</title>",
            "<title>Novara Product Handbook</title>"))
    print(f"Wrote {out}")
    for repo in empty:
        print(f"  no feature docs yet: {repo}")
    for repo in missing:
        print(f"  REPO NOT FOUND: {repo} — its features are missing from this handbook")
    return 0


def main():
    if "--all" in sys.argv:
        return main_all(sys.argv)
    built = build()
    if built is None:
        return 1
    content, skipped = built

    check = "--check" in sys.argv
    current = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else None

    if check:
        html_ok = (os.path.exists(OUT_HTML)
                   and open(OUT_HTML, encoding="utf-8").read() == to_html(content))
        if current == content and html_ok:
            print("HANDBOOK.md is up to date.")
            return 0
        print("HANDBOOK.md is out of date. Run:", file=sys.stderr)
        print("  python3 scripts/eng/build_feature_handbook.py", file=sys.stderr)
        return 1

    with open(OUT, "w", encoding="utf-8") as f:
        f.write(content)
    with open(OUT_HTML, "w", encoding="utf-8") as f:
        f.write(to_html(content))
    n = content.count("\n## ") - (1 if skipped else 0)
    print(f"Wrote {OUT} and {OUT_HTML} ({n} feature section(s)).")
    if skipped:
        print(f"No user-facing section in: {', '.join(skipped)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
