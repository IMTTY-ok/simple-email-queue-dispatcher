"""Browser smoke check for the Email Queue Dispatcher dashboard.

Signs in against the Authentication emulator, exercises the five modules plus
the scheduled delivery through the UI, and captures the console errors, page
errors and failed requests.

Usage:
    python scripts/browser_check.py [base_url]
"""

import sys
from pathlib import Path

import json
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

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


def wait_for_text(page, needle: str, timeout: int = 20000) -> str:
    """Wait until the page shows a piece of text, then return the body."""
    page.wait_for_function(
        "needle => document.body.innerText.includes(needle)",
        arg=needle,
        timeout=timeout,
    )
    return page.inner_text("body")


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
        assert "EMAIL QUEUE DISPATCHER" in heading.upper()

        # The dashboard must have replaced the sign-in screen.
        if page.locator("#auth-email").count():
            banner = page.locator("[role=alert]").first.inner_text() if page.locator("[role=alert]").count() else "(no error banner)"
            raise AssertionError(f"still on the sign-in screen: {banner}")

        # ── the header must show the real state ───────────────────────────────
        header_text = page.locator("header").first.inner_text()
        assert "SERVER: ONLINE" in header_text.upper(), f"the server indicator is missing: {header_text}"
        assert "MODE:" in header_text.upper(), f"the mode indicator is missing: {header_text}"
        print(f"  header state     : {header_text.strip().splitlines()[0][:80]}")

        # ── the five module cards must be there ───────────────────────────────
        for title_text in (
            "MODULE 1 | EMAIL QUEUE CREATOR",
            "MODULE 2 + 3 | SIMULATION & RETRY SETTINGS",
            "MODULE 4 | PROCESSING & ACTIVITY",
            "MODULE 5 | SUMMARY EXPORTER",
        ):
            assert page.locator(f"text={title_text}").count() > 0, f"the card '{title_text}' is missing"
        print("  module cards     : OK")

        # ── the control toolbar ───────────────────────────────────────────────
        for control in ("Start Dispatch", "Pause", "Stop", "Reset Queue"):
            assert page.get_by_role("button", name=control).count() > 0, f"the '{control}' control is missing"
        print("  control toolbar  : OK")

        # ── Module 1: add an email through the form ─────────────────────────
        page.fill("#recipient", "browser@example.com")
        page.fill("#subject", "Browser check")
        page.fill("#message", "Added by the browser smoke test")
        page.get_by_role("button", name="Add to Queue").click()
        body = wait_for_text(page, "Email added to the queue")
        assert "Email added to the queue" in body, "the add-email feedback is missing"
        print("  M1 add email     : OK")

        # ── Module 1: demo data ──────────────────────────────────────────────
        page.get_by_role("button", name="Load Demo Data").click()
        body = wait_for_text(page, "demo emails")
        assert "demo emails" in body, "the demo data feedback is missing"
        print("  M1 demo data     : OK")

        # ── Module 6: schedule an email for later ─────────────────────────────
        page.fill("#recipient", "student@example.com")
        page.fill("#subject", "Project Update")
        page.fill("#message", "Please check the latest project status.")
        page.get_by_role("button", name="Schedule for Later").click()
        page.wait_for_timeout(800)
        assert page.locator("#schedule-date").count() > 0, "the scheduling panel did not open"

        # The wall-clock time is interpreted in the chosen zone, so the
        # browser has to hand over the local time of that zone — not UTC.
        moment = datetime.now(timezone.utc) + timedelta(hours=3) + timedelta(hours=5, minutes=30)
        page.fill("#schedule-date", moment.strftime("%Y-%m-%d"))
        page.fill("#schedule-time", moment.strftime("%H:%M"))
        page.select_option("#schedule-timezone", "Asia/Kolkata")
        page.wait_for_timeout(400)
        page.get_by_role("button", name="Schedule Email").click()
        body = wait_for_text(page, "Confirm the scheduled delivery")
        assert "Confirm the scheduled delivery" in body, "the confirmation panel did not appear"
        assert "Asia/Kolkata" in body, "the confirmation does not name the timezone"
        print("  M6 confirmation  : OK")
        page.screenshot(path=str(OUT / "schedule-confirmation.png"))

        page.get_by_role("button", name="Confirm schedule").click()
        body = wait_for_text(page, "saved.")
        assert "Scheduled email" in body, "the schedule confirmation is missing"
        print("  M6 schedule      : OK")

        # ── Module 3: dispatch ───────────────────────────────────────────────
        page.get_by_role("button", name="Start Dispatch").click()
        page.wait_for_timeout(12000)
        print("  M3 dispatch      : OK")

        page.screenshot(path=str(OUT / "dashboard.png"), full_page=True)
        print(f"  screenshot       : {OUT / 'dashboard.png'}")

        # ── the activity log must have entries (Module 4) ───────────────────
        page.locator("text=Processing events").first.scroll_into_view_if_needed()
        page.wait_for_timeout(800)
        page.screenshot(path=str(OUT / "activity-log.png"))
        print(f"  screenshot       : {OUT / 'activity-log.png'}")

        # ── the export panel must be present (Module 5) ──────────────────────
        assert page.locator("text=SUMMARY EXPORTER").count() > 0, "the export panel is missing"
        print("  M5 export panel  : OK")

        # ── the administrator panel must be present ─────────────────────────
        assert page.locator("text=Accounts & Roles").count() > 0, "the admin panel is missing"
        print("  admin panel      : OK")

        # ── Module 6: the scheduled emails table ─────────────────────────────
        page.get_by_role("tab", name="Scheduled Emails").click()
        page.wait_for_timeout(1500)
        table = page.locator("table").first
        assert table.count() > 0, "the scheduled emails table is missing"
        assert "SCHEDULED EMAILS" in page.inner_text("body"), "the scheduled emails card is missing"
        assert "Asia/Kolkata" in page.inner_text("body"), "the scheduled row does not show its timezone"
        print("  M6 table         : OK")
        page.screenshot(path=str(OUT / "scheduled-emails.png"), full_page=True)
        print(f"  screenshot       : {OUT / 'scheduled-emails.png'}")

        # ── responsive check: a narrow viewport must not overflow ───────────
        page.get_by_role("tab", name="Dashboard").click()
        page.wait_for_timeout(600)
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
