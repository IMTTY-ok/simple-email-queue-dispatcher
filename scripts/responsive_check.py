"""Capture the dashboard at a few viewport sizes and check for layout problems.

Usage:
    python scripts/responsive_check.py [base_url]
"""

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
OUT = Path(__file__).resolve().parent.parent / "docs" / "screenshots" / "responsive"
OUT.mkdir(parents=True, exist_ok=True)

VIEWPORTS = [
    ("desktop", 1440, 900),
    ("laptop", 1280, 800),
    ("tablet", 834, 1112),
    ("mobile", 390, 844),
]

problems = []

with sync_playwright() as p:
    browser = p.chromium.launch()

    for name, width, height in VIEWPORTS:
        page = browser.new_page(viewport={"width": width, "height": height})
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on(
            "console",
            lambda m: errors.append(f"console {m.type}: {m.text}") if m.type == "error" else None,
        )

        page.goto(BASE, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_selector("h1", timeout=30_000)
        page.wait_for_timeout(2500)

        overflow = page.evaluate(
            "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"
        )

        # The sticky header must sit at the top of the viewport.
        header_top = page.evaluate(
            "() => { const h = document.querySelector('header');"
            " return h ? Math.round(h.getBoundingClientRect().top) : null; }"
        )

        # Every interactive control must be reachable and large enough to hit.
        small = page.evaluate(
            """() => {
              const bad = [];
              for (const el of document.querySelectorAll('button, a, input, textarea')) {
                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) continue;
                if (r.height < 24) bad.push((el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40));
              }
              return bad;
            }"""
        )

        page.screenshot(path=str(OUT / f"viewport-{name}.png"))

        status = "OK"
        if overflow > 1:
            status = f"h-overflow {overflow}px"
            problems.append(f"{name}: horizontal overflow {overflow}px")
        if header_top not in (0, None) and abs(header_top) > 1:
            status = f"header at {header_top}px"
            problems.append(f"{name}: sticky header is at {header_top}px instead of 0")
        if small:
            status = f"{len(small)} small controls"
            problems.append(f"{name}: {len(small)} controls under 24px tall: {small[:5]}")
        if errors:
            status = f"{len(errors)} console errors"
            problems.append(f"{name}: {errors[:3]}")

        print(f"  {name:8} {width}x{height}  overflow={overflow}px  header_top={header_top}  {status}")
        page.close()

    browser.close()

print()
if problems:
    print("PROBLEMS:")
    for x in problems:
        print(f"  - {x}")
    raise SystemExit(1)
print("No layout problems found.")
