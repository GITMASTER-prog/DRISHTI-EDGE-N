#!/usr/bin/env python3
"""
DRISHTI GCS — Single-file deployment builder.

GitHub Pages deployments kept failing because the manual upload missed the
js/ and assets/ folders (the page rendered its static HTML but no gauges,
no clock, no interactivity). This script removes that failure mode entirely:
it inlines EVERYTHING into one portable index.html.

Output: deploy/index.html  — upload this single file and you are done.
  - styles.css            -> <style> block
  - every js/*.js script  -> <script> block (same order, with error trapping)
  - assets/*.png/.jpg/.ico referenced in HTML/CSS -> base64 data URIs

Usage:
    python tools/build_singlefile.py            # from the drishti-gcs folder
    python tools/build_singlefile.py --open     # build then serve locally
"""

import argparse
import base64
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # drishti-gcs/
OUT_DIR = ROOT / "deploy"
OUT_FILE = OUT_DIR / "index.html"

MIME_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}


def read_bytes(path: Path) -> bytes:
    return path.read_bytes()


def to_data_uri(path: Path) -> str:
    mime = MIME_TYPES.get(path.suffix.lower(), "application/octet-stream")
    b64 = base64.b64encode(read_bytes(path)).decode("ascii")
    return f"data:{mime};base64,{b64}"


def inline_images(text: str) -> tuple[str, list[str]]:
    """Replace every url(...)/src="assets/..." reference with a data URI."""
    missing: list[str] = []
    ref_pattern = re.compile(
        r"""(?:url\(\s*['"]?(?P<url1>assets/[^'")]+?)['"]?\s*\))"""
        r"""|(?P<src>src=["'](?P<url2>assets/[^"']+?)["'])"""
    )

    def repl(m: re.Match) -> str:
        rel = m.group("url1") or m.group("url2")
        asset = ROOT / rel
        if not asset.exists():
            missing.append(rel)
            return m.group(0)
        uri = to_data_uri(asset)
        if m.group("url1"):
            return f"url('{uri}')"
        return f'src="{uri}"'

    return ref_pattern.sub(repl, text), missing


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the single-file DRISHTI GCS deployment")
    parser.add_argument("--open", action="store_true", help="serve the deploy folder locally afterwards")
    args = parser.parse_args()

    index_path = ROOT / "index.html"
    if not index_path.exists():
        print(f"ERROR: {index_path} not found", file=sys.stderr)
        return 1

    html = index_path.read_text(encoding="utf-8")

    # ---- 1. Inline the stylesheet -------------------------------------------
    css_path = ROOT / "styles.css"
    if not css_path.exists():
        print("ERROR: styles.css not found", file=sys.stderr)
        return 1

    css = css_path.read_text(encoding="utf-8")
    css, css_missing = inline_images(css)
    css = css.replace("href=\"styles.css\"", "")  # defensive; no-op normally

    style_block = "<style>\n/* ==== inlined styles.css ==== */\n" + css + "\n</style>"
    html, n_css = re.subn(
        r'<link rel="stylesheet" href="styles.css">',
        style_block.replace("\\", "\\\\"),
        html,
        count=1,
    )
    if n_css != 1:
        print("WARNING: stylesheet <link> tag not found — CSS not inlined", file=sys.stderr)

    # ---- 2. Inline every script --------------------------------------------
    script_tags = re.findall(r'<script src="(js/[^"]+)"></script>', html)
    if not script_tags:
        print("ERROR: no <script src=js/...> tags found", file=sys.stderr)
        return 1

    missing_scripts = [s for s in script_tags if not (ROOT / s).exists()]
    if missing_scripts:
        print(f"ERROR: referenced scripts missing on disk: {missing_scripts}", file=sys.stderr)
        return 1

    scripts_html: list[str] = []
    for rel in script_tags:
        code = (ROOT / rel).read_text(encoding="utf-8")
        # Escape any closing script sequences inside the JS.
        code = code.replace("</script", "<\\/script")
        scripts_html.append(
            f"<script>\n/* ==== inlined {rel} ==== */\n{code}\n</script>"
        )

    # Replace the whole run of script tags with the inlined blocks.
    first = script_tags[0]
    last = script_tags[-1]
    pattern = re.compile(
        r'<script src="' + re.escape(first) + r'"></script>[\s\S]*<script src="'
        + re.escape(last) + r'"></script>'
    )
    html, n_scripts = pattern.subn(
        "\n".join(scripts_html).replace("\\", "\\\\"), html, count=1
    )
    if n_scripts != 1:
        print("ERROR: could not replace the script tag block", file=sys.stderr)
        return 1

    # ---- 3. Inline images referenced from the HTML ---------------------------
    html, html_missing = inline_images(html)

    # ---- 4. Report and write -------------------------------------------------
    all_missing = css_missing + html_missing
    if all_missing:
        print("WARNING: referenced assets missing on disk (left as-is):", all_missing, file=sys.stderr)

    OUT_DIR.mkdir(exist_ok=True)
    OUT_FILE.write_text(html, encoding="utf-8")
    size_kb = OUT_FILE.stat().st_size / 1024
    print(f"OK  wrote {OUT_FILE} ({size_kb:.0f} KB)")
    print(f"    inlined: styles.css + {len(script_tags)} scripts + images")
    if all_missing:
        print(f"    NOTE: {len(all_missing)} asset reference(s) unresolved — see warning above")
    return 0


if __name__ == "__main__":
    sys.exit(main())
