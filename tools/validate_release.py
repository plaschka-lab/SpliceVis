#!/usr/bin/env python3
"""Fail a public release on biological contradictions or missing bundled assets.

These are invariants and curated regression controls, not proof of correctness.
Intervals use inclusive author numbering; insertions remain distinct residues.
"""
import argparse
import json
import hashlib
from html.parser import HTMLParser
from pathlib import Path
import re


def residue_set(value):
    result = set()
    for part in re.split(r'[;,]', value or ''):
        part = part.strip()
        if not part:
            continue
        match = re.fullmatch(r'(-?\d+)(?:-(-?\d+))?', part)
        if match:
            start, end = int(match[1]), int(match[2] or match[1])
            if end < start or end - start > 100000:
                raise ValueError(f'Invalid residue interval: {part}')
            result.update(str(i) for i in range(start, end + 1))
        elif re.fullmatch(r'-?\d+[A-Za-z]', part):
            result.add(part)
        else:
            raise ValueError(f'Unsupported author residue interval: {part}')
    return result


def biological_errors(records):
    errors = []
    seen = set()
    for record in records:
        pdb = record['pdb_id']
        if pdb in seen or not re.fullmatch(r'[0-9][A-Za-z0-9]{3}', pdb):
            errors.append(f'{pdb}: duplicate or non-public accession')
        seen.add(pdb)
        features = record.get('substrate_features', [])
        for i, feature in enumerate(features):
            chain = feature['original_chain_id']
            positions = residue_set(feature['auth_residue_ranges'])
            for other in features[i+1:]:
                if chain != other['original_chain_id']:
                    continue
                overlap = positions & residue_set(other['auth_residue_ranges'])
                kinds = {feature['feature'], other['feature']}
                if overlap and (kinds & {'exon_5', 'exon_3', 'exon_defined_exon'}) and (kinds & {'intron', 'intron_lariat', 'branch_point_adenosine'}):
                    errors.append(f'{pdb}/{chain}: incompatible {sorted(kinds)} at {sorted(overlap)}')
                if overlap and feature['feature'] == other['feature']:
                    errors.append(f'{pdb}/{chain}: duplicate overlapping {feature["feature"]}')
            if feature['feature'] == 'branch_point_adenosine':
                regions = [residue_set(f['auth_residue_ranges']) for f in features
                           if f['original_chain_id'] == chain and f['feature'] == 'branch_point_region']
                if regions and not positions <= set().union(*regions):
                    errors.append(f'{pdb}/{chain}: branch A outside its branch region')
        # Independently curated controls, in deposited sequence coordinates.
        controls = {'6ah0': (53, 55), '8qxd': (23, 25), '5mps': (59, 61)}
        if pdb in controls:
            triads = [f for f in record.get('snrna_features', []) if f['feature'] == 'U6_AGC_catalytic_triad']
            if len(triads) != 1 or (int(triads[0]['seq_start']), int(triads[0]['seq_end'])) != controls[pdb]:
                errors.append(f'{pdb}: U6 catalytic triad differs from curated control {controls[pdb]}')
        if 'local/non-PDB model' in record.get('curation', {}).get('flags', []):
            errors.append(f'{pdb}: stale local-model provenance in public record')
    return errors


def asset_paths(value):
    roots = {'web','data','scripts','scripts_systematic','scripts_with_primary_maps',
             'scripts_systematic_with_primary_maps','rna_references','rna_2d','thumbnails','assets'}
    if isinstance(value, dict):
        for item in value.values():
            yield from asset_paths(item)
    elif isinstance(value, list):
        for item in value:
            yield from asset_paths(item)
    elif isinstance(value, str) and value.split('/')[0] in roots:
        yield value


class AlignmentDataParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = False
        self.payload = ""

    def handle_starttag(self, tag, attrs):
        if tag == 'script' and dict(attrs).get('id') == 'alignmentData':
            self.active = True

    def handle_endtag(self, tag):
        if tag == 'script':
            self.active = False

    def handle_data(self, value):
        if self.active:
            self.payload += value


def alignment_privacy_errors(root, public_ids):
    errors = []
    for path in (root / 'rna_references').glob('*.html'):
        parser = AlignmentDataParser()
        parser.feed(path.read_text())
        if not parser.payload:
            continue
        for record in json.loads(parser.payload)['records']:
            if not record['reference'] and record['pdb_id'].lower() not in public_ids:
                errors.append(f'{path.name}: alignment contains non-public member {record["id"]}')
    return errors


def validate(root):
    payload = json.loads((root/'data/structures.json').read_text())
    errors = biological_errors(payload['records'])
    errors.extend(alignment_privacy_errors(root, {r['pdb_id'].lower() for r in payload['records']}))
    for path in sorted(set(asset_paths(payload))):
        if not (root/path).is_file():
            errors.append(f'Missing asset: {path}')
    for name in ('index.html', 'dashboard.js', 'dashboard.css', 'viewer-loader.js', 'script-actions.js'):
        if not (root / 'web' / name).is_file():
            errors.append(f'Missing UI source: {name}')
    manifest = root / 'web/vendor/manifest.json'
    if not manifest.exists():
        errors.append('Missing viewer dependency manifest')
    else:
        for name, expected in json.loads(manifest.read_text())['sha256'].items():
            path = manifest.parent / name
            if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                errors.append(f'Bundled viewer checksum mismatch: {name}')
    if payload.get('offline'):
        for record in payload['records']:
            path = root / 'pdb' / (record['pdb_id'].lower() + '.cif')
            if not path.is_file() or not path.stat().st_size:
                errors.append(f'Missing offline coordinate: {path.name}')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', nargs='?', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    errors = validate(args.root)
    for error in errors:
        print(error)
    print(f'Release invariant errors: {len(errors)}')
    return bool(errors)


if __name__ == '__main__':
    raise SystemExit(main())
