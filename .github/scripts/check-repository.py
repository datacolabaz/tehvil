"""Conservative source-export checks. Never print matching credential content."""
import pathlib
import re
import subprocess
import sys

paths = subprocess.check_output(["git", "ls-files", "-z"]).decode().split("\0")
secret_patterns = [
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\bAKIA[A-Z0-9]{16}\b"),
    re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b"),
    re.compile(r"\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b"),
    re.compile(r"postgres(?:ql)?://[^:\s\"']+:[^@\s\"']+@"),
]
failures = []
for name in filter(None, paths):
    path = pathlib.Path(name)
    if not path.is_file():
        continue
    if path.name.startswith(".env") and path.name != ".env.example":
        failures.append(f"{name}: environment file must not be committed")
    if any(part in {"uploads", "media", "user_uploads", "attached_assets"} for part in path.parts):
        failures.append(f"{name}: uploaded user assets must not be committed")
    if path.stat().st_size > 2 * 1024 * 1024:
        failures.append(f"{name}: file exceeds the 2 MiB source limit")
        continue
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        continue
    if path.name == ".env.example":
        for line in text.splitlines():
            if line.strip() and not line.lstrip().startswith("#") and ("=" not in line or line.split("=", 1)[1].strip()):
                failures.append(f"{name}: example values must be blank")
    if any(pattern.search(text) for pattern in secret_patterns):
        failures.append(f"{name}: likely credential pattern; inspect locally")
if failures:
    print("\n".join(failures))
    sys.exit(1)
print("Repository checks passed: no env credentials, uploaded assets or oversized files.")