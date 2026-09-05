#!/usr/bin/env python3
"""Create a model-only offline copy of the Spliceosome Structure Vis dashboard.

The public GitHub dashboard intentionally stays small: ChimeraX scripts open PDB
entries and helper scripts over the network. This installer creates a local
working copy with dashboard assets, helper scripts, thumbnails/RNA panels, and
uncompressed mmCIF coordinate files. EM maps are optional because they are large.
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
import shutil
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit, unquote
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DEST = Path.home() / "Documents" / "SpliceVis"
RAW_GITHUB_PREFIX = "https://raw.githubusercontent.com/plaschka-lab/SpliceVis/main/"
PDB_CIF_URL = "https://files.rcsb.org/download/{pdb}.cif"
EMDB_MAP_URL = "https://ftp.ebi.ac.uk/pub/databases/emdb/structures/EMD-{emd}/map/emd_{emd_lower}.map.gz"

COPIED_DIRS = [
    "data",
    "scripts",
    "scripts_with_primary_maps",
    "scripts_systematic",
    "scripts_systematic_with_primary_maps",
    "rna_2d",
    "thumbnails",
    "tools",
    "web",
    "rna_references",
    "assets",
]
COPIED_FILES = ["index.html", "README.md", "CITATION.cff", ".nojekyll"]
SCRIPT_DIRS = [
    "scripts",
    "scripts_with_primary_maps",
    "scripts_systematic",
    "scripts_systematic_with_primary_maps",
]

PDB_OPEN_RE = re.compile(r"(?m)^(open\s+)([0-9][A-Za-z0-9]{3})(\s+id\s+)")
EMDB_OPEN_RE = re.compile(r"(?m)^(open\s+)emdb:(\d+)(\s+id\s+)")


def posix_path(path: Path) -> str:
    return path.resolve().as_posix()


def chimerax_quote(path: Path) -> str:
    escaped = posix_path(path).replace('"', '\\"')
    return f'"{escaped}"'


def copy_public_assets(dest: Path, force: bool) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    for rel in COPIED_DIRS:
        source = REPO_ROOT / rel
        if not source.exists():
            continue
        target = dest / rel
        if target.exists() and force:
            shutil.rmtree(target)
        shutil.copytree(
            source,
            target,
            dirs_exist_ok=True,
            ignore=shutil.ignore_patterns(".DS_Store", "__pycache__", "*.pyc"),
        )
    for rel in COPIED_FILES:
        source = REPO_ROOT / rel
        if source.exists():
            shutil.copy2(source, dest / rel)
    remove_junk_files(dest)


def remove_junk_files(root: Path) -> None:
    for path in root.rglob(".DS_Store"):
        path.unlink(missing_ok=True)
    for path in root.rglob("__pycache__"):
        if path.is_dir():
            shutil.rmtree(path)


def load_payload(root: Path) -> dict:
    path = root / "data" / "structures.json"
    if not path.exists():
        raise FileNotFoundError(f"Missing dashboard payload: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def script_paths(root: Path) -> list[Path]:
    paths: list[Path] = []
    for rel in SCRIPT_DIRS:
        folder = root / rel
        if folder.exists():
            paths.extend(sorted(folder.rglob("*.cxc")))
    return paths


def pdb_ids_from_scripts(root: Path, payload: dict) -> list[str]:
    ids = {str(record.get("pdb_id", "")).lower() for record in payload.get("records", [])}
    for script in script_paths(root):
        text = script.read_text(encoding="utf-8", errors="replace")
        ids.update(match.group(2).lower() for match in PDB_OPEN_RE.finditer(text))
    return sorted(item for item in ids if re.fullmatch(r"[0-9][a-z0-9]{3}", item))


def emdb_ids_from_scripts(root: Path) -> list[str]:
    ids: set[str] = set()
    for script in script_paths(root):
        text = script.read_text(encoding="utf-8", errors="replace")
        ids.update(match.group(2).lstrip("0") or "0" for match in EMDB_OPEN_RE.finditer(text))
    return sorted(ids, key=lambda value: int(value))


def download(url: str, target: Path, force: bool = False) -> None:
    if target.exists() and target.stat().st_size > 0 and not force:
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".tmp")
    with urllib.request.urlopen(url, timeout=90) as response, tmp.open("wb") as handle:
        shutil.copyfileobj(response, handle)
    tmp.replace(target)


def copy_or_download_cif(pdb_id: str, dest: Path, source_dir: Path | None, force: bool) -> tuple[bool, str]:
    target = dest / "pdb" / f"{pdb_id}.cif"
    if target.exists() and target.stat().st_size > 0 and not force:
        return True, "exists"
    target.parent.mkdir(parents=True, exist_ok=True)
    candidates: list[Path] = []
    if source_dir:
        for name in (pdb_id, pdb_id.upper()):
            candidates.extend([source_dir / f"{name}.cif", source_dir / f"{name}.cif.gz"])
    for candidate in candidates:
        if not candidate.exists():
            continue
        if candidate.suffix == ".gz":
            with gzip.open(candidate, "rb") as source, target.open("wb") as handle:
                shutil.copyfileobj(source, handle)
        else:
            shutil.copy2(candidate, target)
        return True, "copied"
    try:
        download(PDB_CIF_URL.format(pdb=pdb_id.upper()), target, force=force)
        return True, "downloaded"
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        if target.exists() and target.stat().st_size == 0:
            target.unlink()
        return False, str(exc)


def download_primary_map(emd_id: str, dest: Path, force: bool) -> tuple[bool, str]:
    emd_int = str(int(emd_id))
    emd_lower = emd_int.lower()
    target = dest / "maps" / f"EMD-{emd_int}" / f"emd_{emd_lower}.map"
    if target.exists() and target.stat().st_size > 0 and not force:
        return True, "exists"
    gz_target = target.with_suffix(target.suffix + ".gz")
    url = EMDB_MAP_URL.format(emd=emd_int, emd_lower=emd_lower)
    try:
        download(url, gz_target, force=force)
        with gzip.open(gz_target, "rb") as source, target.open("wb") as handle:
            shutil.copyfileobj(source, handle)
        return True, "downloaded"
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return False, str(exc)


def rewrite_script_text(text: str, dest: Path, with_primary_maps: bool) -> str:
    coordinate_dir = dest / "pdb"
    map_dir = dest / "maps"

    text = text.replace(
        "# Models are downloaded directly by ChimeraX from the PDB.",
        "# Models are opened from local offline mmCIF files.",
    )
    if with_primary_maps:
        text = text.replace(
            "# Primary maps, when requested, are downloaded directly from EMDB.",
            "# Primary maps are opened from local offline EMDB map files when present.",
        )
    else:
        text = text.replace(
            "# Primary maps, when requested, are downloaded directly from EMDB.",
            "# Primary-map variants still require network access unless setup_offline.py --with-primary-maps was used.",
        )
    def localize_open(match: re.Match[str]) -> str:
        url = match.group(2)
        prefix = RAW_GITHUB_PREFIX if url.startswith(RAW_GITHUB_PREFIX) else "https://plaschka-lab.github.io/SpliceVis/"
        parts = urlsplit(url[len(prefix):])
        path = dest / unquote(parts.path)
        # HTML viewers need URL query parameters; scripts need quoted file paths.
        target = path.resolve().as_uri() + ("?" + parts.query if parts.query else "") if parts.path.endswith(".html") else posix_path(path)
        return match.group(1) + '"' + target.replace('"', '\\"') + '"'

    text = re.sub(r'(?m)^(open\s+)(https://(?:raw\.githubusercontent\.com/plaschka-lab/SpliceVis/main/|plaschka-lab\.github\.io/SpliceVis/)[^\s]+)', localize_open, text)

    def replace_pdb(match: re.Match[str]) -> str:
        pdb_id = match.group(2).lower()
        return f"{match.group(1)}{chimerax_quote(coordinate_dir / f'{pdb_id}.cif')}{match.group(3)}"

    text = PDB_OPEN_RE.sub(replace_pdb, text)

    if with_primary_maps:
        def replace_emdb(match: re.Match[str]) -> str:
            emd_id = str(int(match.group(2)))
            return (
                f"{match.group(1)}"
                f"{chimerax_quote(map_dir / f'EMD-{emd_id}' / f'emd_{emd_id.lower()}.map')}"
                f"{match.group(3)}"
            )

        text = EMDB_OPEN_RE.sub(replace_emdb, text)

    return text


def rewrite_scripts(dest: Path, with_primary_maps: bool) -> None:
    for path in script_paths(dest):
        text = path.read_text(encoding="utf-8", errors="replace")
        path.write_text(rewrite_script_text(text, dest, with_primary_maps), encoding="utf-8")


def write_launchers(dest: Path) -> None:
    launcher = dest / "open_dashboard.command"
    launcher.write_text(
        "#!/bin/zsh\n"
        "cd \"${0:A:h}\"\n"
        "exec python3 tools/serve.py --open\n",
        encoding="utf-8",
    )
    launcher.chmod(0o755)
    (dest / "OFFLINE_README.md").write_text(
        "# Offline Spliceosome Structure Vis\n\n"
        "This folder contains a model-only offline copy of the public dashboard, "
        "helper scripts, thumbnails/RNA panels, and uncompressed mmCIF coordinate files.\n\n"
        "Open `open_dashboard.command` on macOS, or run:\n\n"
        "```bash\n"
        "python3 -m http.server 8765 --directory .\n"
        "```\n\n"
        "Then browse to `http://127.0.0.1:8765/`. The local HTTP server avoids "
        "browser restrictions on loading JSON files from `file://` URLs.\n\n"
        "EM maps are not included by default. Re-run `tools/setup_offline.py "
        "--with-primary-maps` from a cloned repository to add primary EMDB maps.\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dest", type=Path, default=DEFAULT_DEST, help=f"Offline install folder (default: {DEFAULT_DEST})")
    parser.add_argument(
        "--coordinate-source",
        type=Path,
        default=None,
        help="Optional folder containing existing <pdb>.cif or <pdb>.cif.gz files to copy before downloading.",
    )
    parser.add_argument("--with-primary-maps", action="store_true", help="Also download and localize primary EMDB maps.")
    parser.add_argument("--force", action="store_true", help="Overwrite existing copied assets and coordinate/map files.")
    parser.add_argument("--refresh-assets", action="store_true", help="Replace generated dashboard asset folders without re-downloading existing coordinates or maps.")
    args = parser.parse_args()

    dest = args.dest.expanduser().resolve()
    if dest == REPO_ROOT.resolve():
        parser.error("Choose a destination other than the source repository.")
    source_dir = args.coordinate_source.expanduser().resolve() if args.coordinate_source else None
    if source_dir and not source_dir.exists():
        print(f"Coordinate source does not exist: {source_dir}", file=sys.stderr)
        return 2

    copy_public_assets(dest, args.force or args.refresh_assets)
    payload = load_payload(dest)
    pdb_ids = pdb_ids_from_scripts(dest, payload)
    print(f"Installing {len(pdb_ids)} coordinate files into {dest / 'pdb'}")

    failures: list[tuple[str, str]] = []
    copied = downloaded = existing = 0
    for index, pdb_id in enumerate(pdb_ids, start=1):
        ok, status = copy_or_download_cif(pdb_id, dest, source_dir, args.force)
        if ok:
            existing += status == "exists"
            copied += status == "copied"
            downloaded += status == "downloaded"
        else:
            failures.append((pdb_id, status))
        if index % 25 == 0 or index == len(pdb_ids):
            print(f"  {index}/{len(pdb_ids)} coordinate files checked")

    map_failures: list[tuple[str, str]] = []
    if args.with_primary_maps:
        emdb_ids = emdb_ids_from_scripts(dest)
        print(f"Installing {len(emdb_ids)} primary EMDB maps into {dest / 'maps'}")
        for index, emd_id in enumerate(emdb_ids, start=1):
            ok, status = download_primary_map(emd_id, dest, args.force)
            if not ok:
                map_failures.append((emd_id, status))
            if index % 10 == 0 or index == len(emdb_ids):
                print(f"  {index}/{len(emdb_ids)} primary maps checked")

    rewrite_scripts(dest, args.with_primary_maps)
    payload["offline"] = True
    (dest / "data" / "structures.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    write_launchers(dest)
    remove_junk_files(dest)
    from validate_release import validate
    validation_errors = validate(dest)
    for error in validation_errors:
        print(error, file=sys.stderr)

    print(f"Offline dashboard: {dest / 'index.html'}")
    print(f"Coordinate summary: {existing} existing, {copied} copied, {downloaded} downloaded")
    if failures:
        print("Coordinate failures:", file=sys.stderr)
        for pdb_id, reason in failures:
            print(f"  {pdb_id}: {reason}", file=sys.stderr)
    if map_failures:
        print("Map failures:", file=sys.stderr)
        for emd_id, reason in map_failures:
            print(f"  EMD-{emd_id}: {reason}", file=sys.stderr)
    return 1 if failures or map_failures or validation_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
