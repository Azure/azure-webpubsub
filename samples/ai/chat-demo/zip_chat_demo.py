#!/usr/bin/env python3
"""
Zip the chat-demo project into a single archive containing a top-level folder named after
the chat-demo directory (so extracted archive will create a 'chat-demo/' folder).

This script archives tracked + untracked (but not ignored) files under the chat-demo folder
(using `git ls-files`).

Usage:
  python zip_chat_demo.py [output.zip]
"""
from pathlib import Path
import subprocess
import sys
import os
import argparse
import zipfile

CHAT_DIR = Path(__file__).parent.resolve()
DEFAULT_OUT = CHAT_DIR.parent / f"{CHAT_DIR.name}.zip"


def get_files_via_git(chat_dir):
    try:
        out = subprocess.check_output(
            ['git', 'ls-files', '--cached', '--others', '--exclude-standard'],
            cwd=str(chat_dir), text=True
        )
        files = [line.strip() for line in out.splitlines() if line.strip()]
        return files
    except Exception as e:
        print(f"git ls-files failed: {e}")
        return None


def get_files_fallback(chat_dir):
    skip_dirs = {'.git', '__pycache__'}
    files = []
    for dirpath, dirnames, filenames in os.walk(chat_dir):
        rel_dir = os.path.relpath(dirpath, chat_dir)
        if rel_dir == '.':
            parts = []
        else:
            parts = rel_dir.split(os.sep)
        if any(p in skip_dirs for p in parts):
            continue
        for fn in filenames:
            abs_path = Path(dirpath) / fn
            rel_path = abs_path.relative_to(chat_dir).as_posix()
            files.append(rel_path)
    return files


def create_zip(chat_dir, files, out_path):
    out_path = Path(out_path)
    print(f"Writing {len(files)} files to {out_path}")
    with zipfile.ZipFile(out_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            src = chat_dir / f
            if not src.exists():
                print(f"  Skipping missing file: {f}")
                continue
            # Store files under a top-level folder named after the chat-demo directory
            arcname = f"{CHAT_DIR.name}/{f}"
            zf.write(src, arcname=arcname)
    print(f"Archive created: {out_path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('output', nargs='?', help='Output zip path (default: parent/chat-demo.zip)')
    args = parser.parse_args()

    out = Path(args.output) if args.output else DEFAULT_OUT

    files = get_files_via_git(CHAT_DIR)
    if files is None:
        print('Falling back to filesystem walk (git not available).')
        files = get_files_fallback(CHAT_DIR)

    files = sorted(set(files))

    if not files:
        print('No files found to archive.')
        sys.exit(0)

    create_zip(CHAT_DIR, files, out)


if __name__ == '__main__':
    main()
