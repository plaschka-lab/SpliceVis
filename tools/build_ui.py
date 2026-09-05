#!/usr/bin/env python3
"""Build the public entry point from the single maintained web/index.html source."""
import argparse
from pathlib import Path


def build(root, check=False):
    source = (root / 'web/index.html').read_bytes()
    target = root / 'index.html'
    if check:
        return target.exists() and target.read_bytes() == source
    temporary = target.with_suffix('.html.tmp')
    temporary.write_bytes(source)
    temporary.replace(target)
    return True


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    raise SystemExit(not build(Path(__file__).resolve().parents[1], args.check))
