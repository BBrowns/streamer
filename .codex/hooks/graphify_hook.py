#!/usr/bin/env python3
"""Run Graphify's optional hook without tying the project to one machine path."""

from pathlib import Path
import shutil
import subprocess
import sys


def resolve_graphify():
    command = shutil.which("graphify")
    if command:
        return command

    fallback = Path.home() / ".local" / "bin" / "graphify"
    return str(fallback) if fallback.is_file() else None


def main():
    command = resolve_graphify()
    if command is None:
        return 0
    return subprocess.run([command, *sys.argv[1:]], check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
