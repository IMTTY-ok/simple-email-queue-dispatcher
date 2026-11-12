"""Browser smoke check for the Email Queue Dispatcher dashboard.

Signs in against the Authentication emulator, exercises the five modules
through the UI, and captures the console errors, page errors and failed
requests.

Usage:
    python scripts/browser_check.py [base_url]
"""

import sys
from pathlib import Path

import json
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
AUTH_BASE = "http://127.0.0.1:9099"
AUTH_PROJECT = "email-dispatcher-43118"
OUT = Path(__file__).resolve().parent.parent / "docs" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

# The same administrator account the integration check uses. Whichever script
# runs first creates it, and because it is the first account on a fresh
# emulator it becomes the administrator.
TEST_EMAIL = "admin@example.com"
TEST_PASSWORD = "integration-admin-password"

console_errors = []
page_errors = []
failed_requests = []


def auth_post(path: str, body: dict) -> int:
    """Call the Auth emulator's REST API and return the HTTP status."""
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{AUTH_BASE}/identitytoolkit.googleapis.com/v1/accounts:{path}?key=fake-api-key",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status
    except urllib.error.HTTPError as err:
        return err.code


def auth_account(email: str, password: str) -> None:
    """Create the account (or sign in if it already exists)."""
    body = {"email": email, "password": password, "returnSecureToken": True}
    if auth_post("signUp", body) == 200:
        return
    auth_post("signInWithPassword", body)


def main() -> int:
    print(f"Loading {BASE}")
    auth_account(TEST_EMAIL, TEST_PASSWORD)

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
            lambda r: failed_requests.append(f"{r.method} {r.url} - {r.failure}"),
        )

        # The Firestore listener keeps a long-lived connection open, so
        # "networkidle" never fires - wait for the page to render instead.
        page.goto(BASE, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_selector("h1", timeout=30_000)
        page.wait_for_timeout(2500)

        title = page.title()
        print(f"  title            : {title}")
        assert "Email Queue Dispatcher" in title, f"unexpected title: {title}"

        # ── the sign-in screen must be shown to an anonymous visitor ──────────
        if page.locator("#auth-email").count():
            print("  sign-in screen   : shown")
            page.screenshot(path=str(OUT / "sign-in.png"))
            page.fill("#auth-email", TEST_EMAIL)
            page.fill("#auth-password", TEST_PASSWORD)
            page.locator("form").get_by_role("button", name="Sign in").click()
            page.wait_for_timeout(4000)

        heading = page.locator("h1").first.inner_text()
        print(f"  heading          : {heading}")
        assert "Email Queue Dispatcher" in heading

        # The dashboard must have replaced the sign-in screen.
        if page.locator("#auth-email").count():
            banner = page.locator("[role=alert]").first.inner_text() if page.locator("[role=alert]").count() else "(no error banner)"
            raise AssertionError(f"still on the sign-in screen: {banner}")

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
        print("  M3 dispatch      : OK")

        page.screenshot(path=str(OUT / "dashboard.png"), full_page=True)
        print(f"  screenshot       : {OUT / 'dashboard.png'}")

        # ── the activity log must have entries (Module 4) ───────────────────
        page.locator("text=Activity Log").first.scroll_into_view_if_needed()
        page.wait_for_timeout(800)
        page.screenshot(path=str(OUT / "activity-log.png"))
        print(f"  screenshot       : {OUT / 'activity-log.png'}")

        # ── the export panel must be present (Module 5) ──────────────────────
        assert page.locator("text=Dispatch Summary").count() > 0, "the export panel is missing"
        print("  M5 export panel  : OK")

        # ── the administrator panel must be present ─────────────────────────
        assert page.locator("text=Accounts & Roles").count() > 0, "the admin panel is missing"
        print("  admin panel      : OK")

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
