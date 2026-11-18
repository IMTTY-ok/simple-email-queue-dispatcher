"""Capture dashboard screenshots module by module.

Signs in against the Auth emulator, then screenshots the whole dashboard and
each module panel individually.
"""

import json
import sys
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
AUTH_BASE = "http://127.0.0.1:9099"
TEST_EMAIL = "admin@example.com"
TEST_PASSWORD = "integration-admin-password"
OUT = Path(__file__).resolve().parent.parent / "docs" / "screenshots"


def auth_post(path: str, body: dict) -> int:
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
    body = {"email": email, "password": password, "returnSecureToken": True}
    if auth_post("signUp", body) == 200:
        return
    auth_post("signInWithPassword", body)


def sign_in(page) -> None:
    if not page.locator("#auth-email").count():
        return
    page.fill("#auth-email", TEST_EMAIL)
    page.fill("#auth-password", TEST_PASSWORD)
    page.locator("form").get_by_role("button", name="Sign in").click()
    page.wait_for_timeout(4000)


def shot_panel(page, title_substr: str, filename: str) -> bool:
    """Screenshot the card that contains the given title text."""
    loc = page.locator(f"text={title_substr}").first
    if not loc.count():
        print(f"  skip (not found): {title_substr}")
        return False
    # walk up to the nearest .card ancestor
    card = loc.locator("xpath=ancestor::div[contains(@class,'card')][1]")
    if not card.count():
        card = loc
    card.screenshot(path=str(OUT / filename))
    print(f"  saved: {filename}")
    return True


def main() -> int:
    auth_account(TEST_EMAIL, TEST_PASSWORD)
    OUT.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})

        page.goto(BASE, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_selector("h1", timeout=30_000)
        sign_in(page)
        page.wait_for_timeout(3000)

        # ── full dashboard ───────────────────────────────────────────────────
        page.screenshot(path=str(OUT / "dashboard.png"), full_page=True)
        print("  saved: dashboard.png")

        # ── module by module ─────────────────────────────────────────────────
        shot_panel(page, "MODULE 1 | EMAIL QUEUE CREATOR", "module-1-email-queue-creator.png")
        shot_panel(page, "MODULE 2 + 3 | SIMULATION & RETRY SETTINGS", "module-2-3-simulation-retry.png")
        shot_panel(page, "MODULE 4 | PROCESSING & ACTIVITY", "module-4-processing-activity.png")
        shot_panel(page, "MODULE 5 | SUMMARY EXPORTER", "module-5-summary-exporter.png")

        # the admin panel (only present for administrators)
        admin = page.locator("text=Accounts & Roles").first
        if admin.count():
            card = admin.locator("xpath=ancestor::div[contains(@class,'card')][1]")
            if card.count():
                card.screenshot(path=str(OUT / "module-admin-accounts-roles.png"))
                print("  saved: module-admin-accounts-roles.png")

        # ── scheduled emails tab ─────────────────────────────────────────────
        page.get_by_role("tab", name="Scheduled Emails").click()
        page.wait_for_timeout(2000)
        page.screenshot(path=str(OUT / "scheduled-emails.png"), full_page=True)
        print("  saved: scheduled-emails.png")

        browser.close()

    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
