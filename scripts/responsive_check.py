"""Capture the dashboard at a few viewport sizes and check for layout problems.

Signs in against the Authentication emulator first, so the real dashboard is
measured rather than the sign-in screen.

Usage:
    python scripts/responsive_check.py [base_url]
"""

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
AUTH_BASE = "http://127.0.0.1:9099"
OUT = Path(__file__).resolve().parent.parent / "docs" / "screenshots" / "responsive"
OUT.mkdir(parents=True, exist_ok=True)

# The administrator account the integration check creates.
TEST_EMAIL = "admin@example.com"
TEST_PASSWORD = "integration-admin-password"

VIEWPORTS = [
    ("desktop", 1440, 900),
    ("laptop", 1280, 800),
    ("tablet", 834, 1112),
    ("mobile", 390, 844),
]

problems = []


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
    """Sign in if the sign-in screen is showing."""
    if not page.locator("#auth-email").count():
        return
    page.fill("#auth-email", TEST_EMAIL)
    page.fill("#auth-password", TEST_PASSWORD)
    page.locator("form").get_by_role("button", name="Sign in").click()
    page.wait_for_timeout(4000)


def main() -> int:
    auth_account(TEST_EMAIL, TEST_PASSWORD)

    with sync_playwright() as p:
        browser = p.chromium.launch()

        for name, width, height in VIEWPORTS:
            page = browser.new_page(viewport={"width": width, "height": height})
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on(
                "console",
                lambda m: errors.append(f"console {m.type}: {m.text}")
                if m.type == "error"
                else None,
            )

            page.goto(BASE, wait_until="domcontentloaded", timeout=60_000)
            page.wait_for_selector("h1", timeout=30_000)
            sign_in(page)
            page.wait_for_timeout(2500)

            overflow = page.evaluate(
                "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"
            )

            # The sticky header must sit at the top of the viewport.
            header_top = page.evaluate(
                "() => { const h = document.querySelector('header');"
                " return h ? Math.round(h.getBoundingClientRect().top) : null; }"
            )

            # Every interactive control must be large enough to hit.
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
        return 1
    print("No layout problems found.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
