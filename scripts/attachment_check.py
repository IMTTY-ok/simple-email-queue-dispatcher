"""End-to-end check of the Module 1 attachment feature.

Signs in against the Auth emulator, attaches a file to an email, adds it to
the queue, dispatches it and reports what happened.
"""

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
AUTH_BASE = "http://127.0.0.1:9099"
TEST_EMAIL = "admin@example.com"
TEST_PASSWORD = "integration-admin-password"
OUT = Path(__file__).resolve().parent.parent / "docs" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

console_errors: list[str] = []
page_errors: list[str] = []
failed_requests: list[str] = []


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


def make_pdf(path: Path, label: str) -> None:
    """A tiny, valid one-page PDF."""
    content = f"""%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length 62>>stream
BT /F1 14 Tf 20 80 Td ({label}) Tj ET
endstream
endobj
trailer<</Root 1 0 R>>
%%EOF
"""
    path.write_text(content, encoding="latin-1")


def storage_objects() -> list[str]:
    """The object names in the storage emulator."""
    try:
        req = urllib.request.Request(
            "http://127.0.0.1:9199/v0/b/email-dispatcher-43118.appspot.com/o",
            headers={"Authorization": "Bearer owner"},
        )
        with urllib.request.urlopen(req, timeout=20) as res:
            data = json.loads(res.read().decode("utf-8"))
            return [item.get("name", "") for item in data.get("items", [])]
    except Exception as exc:  # noqa: BLE001
        print("  could not read the bucket:", exc)
        return []


def remove_row(page, needle: str) -> None:
    """Remove the attachment row whose text contains `needle`."""
    rows = page.locator(".attachment-row")
    for i in range(rows.count()):
        if needle in rows.nth(i).inner_text():
            rows.nth(i).get_by_role("button").click()
            return
    raise AssertionError(f"no row containing {needle!r}")


def main() -> int:
    tmp = Path.home() / ".cache"
    tmp.mkdir(parents=True, exist_ok=True)
    pdf = tmp / "dispatcher-attachment-check.pdf"
    make_pdf(pdf, "Attachment check")
    print(f"test file: {pdf} ({pdf.stat().st_size} bytes)")

    auth_account(TEST_EMAIL, TEST_PASSWORD)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})

        page.on(
            "console",
            lambda m: console_errors.append(f"{m.type}: {m.text}") if m.type == "error" else None,
        )
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.on(
            "requestfailed",
            lambda r: failed_requests.append(f"{r.method} {r.url} - {r.failure}"),
        )

        page.goto(BASE, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_selector("h1", timeout=30_000)
        page.wait_for_timeout(2000)

        if page.locator("#auth-email").count():
            page.fill("#auth-email", TEST_EMAIL)
            page.fill("#auth-password", TEST_PASSWORD)
            page.locator("form").get_by_role("button", name="Sign in").click()
            page.wait_for_timeout(4000)

        page.wait_for_selector("#attachment-input", state="attached", timeout=20_000)
        page.wait_for_function(
            "() => { const el = document.querySelector('#attachment-input');"
            " return el && (el.getAttribute('accept') || '').length > 0; }",
            timeout=20_000,
        )
        accept = page.locator("#attachment-input").get_attribute("accept") or ""
        print("accept       :", accept[:120])
        assert ".pdf" in accept and ".mp4" in accept and ".docx" in accept, accept

        # ── uploading a file stores it and shows an "uploaded" row ──────────
        page.set_input_files("#attachment-input", str(pdf))
        page.wait_for_timeout(2500)
        row = page.locator(".attachment-row").first
        row.wait_for(timeout=20_000)
        row_text = row.inner_text()
        print("file row     :", " | ".join(row_text.splitlines()))
        assert "uploaded" in row_text, row_text
        page.screenshot(path=str(OUT / "attachments-picker.png"))

        # ── removing a file takes its bytes with it ────────────────────────
        remove_row(page, "dispatcher-attachment-check.pdf")
        page.wait_for_timeout(2500)
        assert page.locator(".attachment-row").count() == 0, "the removed file should leave the list"
        print("after remove : the file left the list")

        # ── a refused file type is refused before it is uploaded ───────────
        bad = tmp / "installer.exe"
        bad.write_bytes(b"MZ not really an executable")
        page.set_input_files("#attachment-input", str(bad))
        page.wait_for_timeout(1200)
        rows_text = page.locator(".attachment-list").inner_text()
        print("after .exe   :", " | ".join(rows_text.splitlines()))
        assert "not a file type" in rows_text, rows_text
        remove_row(page, "installer.exe")
        page.wait_for_timeout(1000)
        assert page.locator(".attachment-row").count() == 0

        # ── attach the file again and create the email ──────────────────────
        page.set_input_files("#attachment-input", str(pdf))
        page.wait_for_timeout(2500)
        page.fill("#recipient", "attachment-check@example.com")
        page.fill("#subject", "Files attached")
        page.fill("#message", "This email carries a file.")
        page.get_by_role("button", name="Add to Queue").click()
        page.wait_for_timeout(3000)

        body = page.inner_text("body")
        assert "Email added to the queue" in body, body[:600]
        print("queue        : added")
        page.screenshot(path=str(OUT / "attachments-queue.png"), full_page=True)

        queue_text = page.locator(".queue-row").last.inner_text()
        print("queue row    :", " | ".join(queue_text.splitlines()))
        assert "dispatcher-attachment-check.pdf" in queue_text, queue_text

        objects = storage_objects()
        print("bucket       :", objects)
        assert any("dispatcher-attachment-check.pdf" in o for o in objects), objects

        # ── dispatch it ─────────────────────────────────────────────────────
        page.get_by_role("button", name="Start Dispatch").click()
        page.wait_for_timeout(12000)

        activity = page.inner_text("body")
        assert "DELIVERED" in activity, activity[:800]
        print("delivery     : delivered")

        page.screenshot(path=str(OUT / "attachments-delivered.png"), full_page=True)
        browser.close()

    print()
    print("console errors  :", len(console_errors))
    for e in console_errors[:10]:
        print("  ", e)
    print("page errors     :", len(page_errors))
    for e in page_errors[:10]:
        print("  ", e)
    print("failed requests :", len(failed_requests))
    for e in failed_requests[:10]:
        print("  ", e)

    return 1 if page_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
