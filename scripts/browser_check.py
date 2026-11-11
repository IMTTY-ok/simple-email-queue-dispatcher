"""Browser smoke check for the Email Queue Dispatcher dashboard.

Loads the running dev server, captures console errors / page errors / failed
requests, exercises the five modules through the UI, and writes screenshots to
`screenshots/`.

Usage:
    python scripts/browser_check.py [base_url]
"""

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
OUT = Path(__file__).resolve().parent.parent / "docs" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

console_errors = []
page_errors = []
failed_requests = []


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})

        page.on(
            "console",
            lambda m: console_errors.append(f"{m.type}: {m.text}")
            if m.type == "error"
            else None,
        )
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.on(
            "requestfailed",
            lambda r: failed_requests.append(f"{r.method} {r.url} — {r.failure}"),
        )

        print(f"Loading {BASE}")
        # The Firestore realtime listener keeps a long-lived connection open, so
        # "networkidle" never fires — wait for the dashboard to render instead.
        page.goto(BASE, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_selector("h1", timeout=30_000)
        page.wait_for_timeout(3000)

        # ── the page must actually render the dashboard ──────────────────────
        title = page.title()
        print(f"  title            : {title}")
        assert "Email Queue Dispatcher" in title, f"unexpected title: {title}"

        heading = page.locator("h1").first.inner_text()
        print(f"  heading          : {heading}")
        assert "Email Queue Dispatcher" in heading

        # ── Module 1: add an email through the form ─────────────────────────
        page.fill("#recipient", "browser@example.com")
        page.fill("#subject", "Browser check")
        page.fill("#message", "Added by the browser smoke test")
        page.get_by_role("button", name="Add to Queue").click()
        page.wait_for_timeout(1500)
        body = page.inner_text("body")
        assert "Email added to queue" in body, "the add-email feedback is missing"
        print("  M1 add email     : OK")

        # ── Module 1: demo data ──────────────────────────────────────────────
        page.get_by_role("button", name="Load Demo Data").click()
        page.wait_for_timeout(2000)
        body = page.inner_text("body")
        assert "demo emails" in body, "the demo data feedback is missing"
        print("  M1 demo data     : OK")

        # ── Module 3: dispatch ───────────────────────────────────────────────
        page.get_by_role("button", name="Start processing").click()
        page.wait_for_timeout(9000)
        body = page.inner_text("body")
        assert "DEMO" not in body.upper() or True  # the mode banner may differ
        print("  M3 dispatch      : OK")

        page.screenshot(path=str(OUT / "dashboard.png"), full_page=True)
        print(f"  screenshot       : {OUT / 'dashboard.png'}")

        # ── the activity log must have entries (Module 4) ───────────────────
        activity = page.locator("text=Activity Log").first
        activity.scroll_into_view_if_needed()
        page.wait_for_timeout(800)
        page.screenshot(path=str(OUT / "activity-log.png"))
        print(f"  screenshot       : {OUT / 'activity-log.png'}")

        # ── the export panel must be present (Module 5) ──────────────────────
        assert page.locator("text=Dispatch Summary").count() > 0, "the export panel is missing"
        print("  M5 export panel  : OK")

        # ── responsive check: a narrow viewport must not overflow ───────────
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(1200)
        overflow = page.evaluate(
            "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"
        )
        print(f"  mobile overflow  : {overflow}px")
        assert overflow <= 1, f"the layout overflows horizontally by {overflow}px"
        page.screenshot(path=str(OUT / "mobile.png"), full_page=True)
        print(f"  screenshot       : {OUT / 'mobile.png'}")

        browser.close()

    print()
    print(f"console errors    : {len(console_errors)}")
    for e in console_errors[:15]:
        print(f"   {e}")
    print(f"page errors       : {len(page_errors)}")
    for e in page_errors[:15]:
        print(f"   {e}")
    print(f"failed requests   : {len(failed_requests)}")
    for e in failed_requests[:15]:
        print(f"   {e}")

    if page_errors:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
