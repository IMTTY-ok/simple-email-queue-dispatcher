"""Repository privacy scan.

Looks for personal information and credentials in the tracked files and in
every blob that has ever been committed.

Run from the repository root:

    python scripts/privacy_scan.py

The report shows the *location* of a finding, never the value.
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# name -> (compiled pattern, severity, what to do about it)
PATTERNS = {
    "personal gmail address": (re.compile(r"imtiyaz4614c@gmail\.com"), "high", "rotate the git identity"),
    "any gmail address": (re.compile(r"[A-Za-z0-9._%+-]+@gmail\.com"), "info", "check it is a placeholder"),
    "google api key": (re.compile(r"AIza[0-9A-Za-z\-_]{35}"), "low", "restrict the key by HTTP referrer"),
    "aws access key": (re.compile(r"AKIA[0-9A-Z]{16}"), "critical", "revoke immediately"),
    "github token": (re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"), "critical", "revoke immediately"),
    "slack token": (re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"), "critical", "revoke immediately"),
    "private key": (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY"), "critical", "revoke immediately"),
    "jwt": (re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"), "high", "revoke immediately"),
    "openai style key": (re.compile(r"sk-[A-Za-z0-9]{20,}"), "critical", "revoke immediately"),
    "stripe key": (re.compile(r"[sr]k_(live|test)_[A-Za-z0-9]{20,}"), "critical", "revoke immediately"),
    "npm token": (re.compile(r"npm_[A-Za-z0-9]{30,}"), "critical", "revoke immediately"),
    "firebase service account": (re.compile(r'"type"\s*:\s*"service_account"'), "critical", "revoke immediately"),
    "password assignment": (
        re.compile(r"(?i)\b(password|passwd|secret|api[_-]?key|token)\b\s*[:=]\s*['\"][^'\"]{6,}['\"]"),
        "medium",
        "move it to an environment variable",
    ),
    "windows user path": (re.compile(r"[A-Za-z]:\\+Users\\+[A-Za-z0-9._-]+"), "medium", "use a relative path"),
    "phone number": (re.compile(r"(?<![\w.])\+?\d{1,3}[\s.-]?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w.])"), "info", "check it is a placeholder"),
    "student id": (re.compile(r"(?i)\b(student|roll|reg(istration)?)[ _-]?(no|number|id)\b\s*[:=]\s*\w+"), "medium", "remove it"),
}

SKIP_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".zip", ".pdf"}

# Values that look like credentials but are not secrets. They are listed here
# so the scan stays meaningful instead of crying wolf.
EXPECTED = {
    # The Firebase *web* configuration. It is compiled into the browser bundle
    # and is readable by anyone - it identifies the project, it does not grant
    # access. The real boundary is the Firestore rules.
    "AIzaSyB5K2NW97RQbeTELu7_c15RR-NUX8YO05c": "public Firebase web API key",
    # A placeholder in the example environment files.
    "you@gmail.com": "placeholder address",
    # A deliberately invalid token used to prove the API rejects bad tokens.
    "not-a-real-token": "deliberately invalid test token",
    # The local emulator test accounts. They exist only inside the emulator.
    "integration-admin-password": "local emulator test credential",
    "integration-operator-password": "local emulator test credential",
    "browser-check-password": "local emulator test credential",
}


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        capture_output=True,
        check=False,
        encoding="utf-8",
        errors="replace",
    ).stdout


def tracked_files() -> list[str]:
    return [f for f in git("ls-files").split("\n") if f]


def scan_text(text: str, label: str, findings: dict, expected: dict) -> None:
    for name, (pattern, severity, action) in PATTERNS.items():
        for match in pattern.finditer(text):
            value = match.group(0)
            line_no = text.count("\n", 0, match.start()) + 1
            for needle, reason in EXPECTED.items():
                if needle in value:
                    expected.setdefault(reason, []).append(f"{label}:{line_no}")
                    break
            else:
                findings.setdefault((name, severity, action), []).append(f"{label}:{line_no}")


def main() -> int:
    findings: dict = {}
    expected: dict = {}

    print("Scanning the working tree (tracked files)...")
    for rel in tracked_files():
        path = ROOT / rel
        if not path.is_file() or path.suffix.lower() in SKIP_SUFFIXES:
            continue
        try:
            scan_text(path.read_text(encoding="utf-8", errors="ignore"), rel, findings, expected)
        except OSError:
            continue

    print("Scanning every blob that has ever been committed...")
    objects = git("rev-list", "--all", "--objects").split("\n")
    for line in objects:
        sha = line.split(" ")[0]
        if not sha:
            continue
        kind = git("cat-file", "-t", sha).strip()
        if kind != "blob":
            continue
        content = git("cat-file", "-p", sha)
        if not content:
            continue
        scan_text(content, f"blob {sha[:9]}", findings, expected)

    print()
    if expected:
        print("Expected (not secrets):")
        for reason, locations in sorted(expected.items()):
            uniq = sorted(set(locations))
            print(f"  - {reason}: {len(uniq)} occurrence(s)")
        print()

    if not findings:
        print("No actionable findings.")
        return 0

    total = 0
    for (name, severity, action), locations in sorted(findings.items()):
        unique = sorted(set(locations))
        total += len(unique)
        print(f"[{severity.upper():8}] {name}  ({len(unique)} occurrence(s))")
        print(f"           action: {action}")
        for loc in unique[:6]:
            print(f"           {loc}")
        if len(unique) > 6:
            print(f"           ... and {len(unique) - 6} more")
        print()

    print(f"total findings: {total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
