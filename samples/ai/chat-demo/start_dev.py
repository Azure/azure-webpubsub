#!/usr/bin/env python3
"""Root development launcher (simplified).

Directly runs the backend launcher at `python_server/start_dev.py`.
"""
from __future__ import annotations

import sys
import subprocess
from pathlib import Path


def main() -> int:
    root = Path(__file__).parent.resolve()
    inner = root / "python_server" / "start_dev.py"
    if not inner.exists():
        print(f"❌ Expected backend launcher not found: {inner}")
        return 1
    print("🚀 Launching development environment via python_server/start_dev.py")
    try:
        return subprocess.call([sys.executable, str(inner)])
    except KeyboardInterrupt:
        return 0


if __name__ == '__main__':  # pragma: no cover
    raise SystemExit(main())
