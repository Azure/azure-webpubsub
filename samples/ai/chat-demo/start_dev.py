#!/usr/bin/env python3
"""Root development launcher.

Discovers the backend directory (default `python_server`) dynamically
by looking for a folder containing a `server.py` file,
then invokes that directory's `start_dev.py`. This avoids hardcoding the
directory name so it can be renamed later (e.g. to `backend`).
"""
from __future__ import annotations
import sys
import subprocess
from pathlib import Path


def _discover_backend_dir(root: Path) -> Path | None:
    candidates = []
    for child in root.iterdir():
        if child.is_dir() and (child / "server.py").exists():
            candidates.append(child)
    if not candidates:
        return None
    # Prefer existing python_server if present for backward compatibility
    for c in candidates:
        if c.name == "python_server":
            return c
    # Fallback to first candidate (sorted for determinism)
    return sorted(candidates)[0]

def main() -> int:
    root = Path(__file__).parent.resolve()
    backend = _discover_backend_dir(root)
    if backend is None:
        print("❌ Could not locate backend directory (no directory with server.py)")
        return 1
    inner = backend / 'start_dev.py'
    if not inner.exists():
        print(f"❌ Found backend '{backend.name}' but no start_dev.py at {inner}")
        return 1
    print(f"🚀 Launching development environment via {backend.name}/start_dev.py")
    try:
        return subprocess.call([sys.executable, str(inner)])
    except KeyboardInterrupt:
        return 0


if __name__ == '__main__':  # pragma: no cover
    raise SystemExit(main())
