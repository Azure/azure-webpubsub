#!/usr/bin/env python3
"""Root server launcher (thin wrapper).

Simply executes the inner `python_server/start_server.py` script which starts
only the Python server. This wrapper exists for convenience so users can run
`python start_server.py` from the repository root.
"""
from __future__ import annotations
import sys
import subprocess
from pathlib import Path


def main() -> int:
    root = Path(__file__).parent.resolve()
    inner = root / 'python_server' / 'start_server.py'
    if not inner.exists():
        print(f"❌ Cannot locate inner server script at {inner}")
        return 1
    print("� Launching server via python_server/start_server.py")
    try:
        return subprocess.call([sys.executable, str(inner)])
    except KeyboardInterrupt:
        return 0


if __name__ == '__main__':  # pragma: no cover
    raise SystemExit(main())