#!/usr/bin/env python3
"""Start the Python Flask server.

This script launches the Flask server component of the chat demo.
It can be used standalone for server-only mode, or called by start_dev.py
for full development environment with both server and client.
"""
from __future__ import annotations
import sys
import subprocess
from pathlib import Path
from dotenv import load_dotenv
import os


def main() -> int:
    # Load environment variables from .env file
    env_file = Path(__file__).parent / '.env'
    if env_file.exists():
        load_dotenv(env_file)
    
    # Get project root (one level up) and backend dir (this file's parent)
    backend_dir = Path(__file__).parent.resolve()
    root_dir = backend_dir.parent
    
    print("🐍 Starting Python server...")
    print(f"📁 Backend directory: {backend_dir}")
    if os.getenv("DEV") != "1":
        print("💡 For full development environment (server + client), use the outer start_dev.py")
    print()
    
    # Set up environment
    env = os.environ.copy()
    
    try:
        # Determine package name dynamically (directory name of backend)
        package_name = backend_dir.name
        server_module = f"{package_name}.application"
        
        # Launch server module from root directory
        return subprocess.call([
            sys.executable, "-m", server_module
        ], cwd=root_dir, env=env)
    except KeyboardInterrupt:
        print("\n🛑 Server stopped")
        return 0


if __name__ == '__main__':  # pragma: no cover
    raise SystemExit(main())
