# Development and validation

## Public UI

The maintained UI source is `web/index.html`, `web/dashboard.css`, and
`web/dashboard.js`. Run `python3 tools/build_ui.py` after changing the HTML.
Do not edit the generated root `index.html`. No package installation is needed.
Run `python3 tools/serve.py --open` to preview on a loopback HTTP server.

PDBe Mol* is bundled at version 3.12.0 (Molstar 5.8.0). Its license and version
manifest are in `web/vendor`. Upgrades require testing the color, residue-focus,
representation, and load-completion adapters; do not replace it with `@latest`.
`viewer-loader.js` waits for the model-completion event, not render() completion.
It detaches old listeners on cancellation and exposes failures for retry.
Systematic chain IDs affect ChimeraX scripts only, not Mol* chain identities.

Run before a release:

```sh
python3 -m unittest discover -s tests -v
node --test tests/*.test.cjs
node --check web/dashboard.js
python3 tools/validate_release.py
```

Also inspect desktop and mobile layouts, select two structures in quick
succession, focus protein/RNA selections and alignment residues, toggle
systematic IDs without losing the model, sort the table, and test the offline
copy with external network requests blocked. Automated invariants do not
replace browser or scientific inspection.

## Data and evidence

`data/structures.json` is the public snapshot, not a primary annotation input.
Residue selectors use deposited author numbering; sequence feature intervals
are 1-based inclusive deposited-sequence positions. Missing modelled residues
are not equivalent to absent sequence features. Reference-alignment positions
are a third coordinate system and must be mapped explicitly.

Component completeness measures assignment coverage, not scientific validity.
Evidence badges summarize rule-based support, not calibrated probabilities.
RNA regions inferred by alignment remain distinguishable from manually curated
regions. Agreement between repeated sequences is not independent validation.
An alignment constrained by known exon boundaries cannot independently validate
those same boundaries. Acquisition metadata do not enter confidence scoring.

## Annotation pipeline

The curation workspace maintains deposited mmCIFs, metadata CSVs, annotated RNA
references, and explicit manual review/override tables. Its release pipeline is:
snRNA reference mapping; substrate annotation and overrides; splice-site and
consistency audits; substrate-type assignment; reference/alignment export;
curation audit; ChimeraX script generation; RNA 2D export; public build.
Manual decisions must be made in override/reference inputs, not generated JSON.
Record the reason and primary source with every scientific correction.

Generate public RNA exports separately with
`.venv/bin/python export_rna_feature_snapgene_files.py --public-only` before the
public build. Membership is filtered before consensus/reference construction,
not just before copying per-structure files. The builder checks the export
membership manifest; release validation checks all HTML alignment members.
Local-only entries must never be included in shared reference MSAs.

Unmodelled terminal MS2 tags are collapsed only in the alignment display, with
a Full reference toggle. Full sequences, features, alignments, and numbering
remain intact in exports. Internal tags and any tail with modelled coverage
are not truncated, even when its apparent coverage is a mismatch requiring
curation. Display cropping must not be used to hide alignment errors.

The public builder now stages outputs, checks biological invariants and asset
coverage, and installs only after validation, with rollback on installation
failure. Unrelated checkout files and Git history are preserved. The public
repository contains the resulting data snapshot and UI, not the complete
curation input archive; full annotation reproduction requires that archive.

Independent U6 regression controls include human AGC A53/G54/C55 and yeast
A59/G60/C61. The ISL annotation denotes a conserved core interval, not proof
that the helix is folded in every deposited state. Sources:

- Human catalytic triad: https://doi.org/10.1038/s41467-026-75109-2
- Yeast ISL core: https://pmc.ncbi.nlm.nih.gov/articles/PMC3124365/
- U4/U6 stem arrangement: https://pmc.ncbi.nlm.nih.gov/articles/PMC4948317/
- C* remodeling and docking distinction: https://pmc.ncbi.nlm.nih.gov/articles/PMC5808836/

## Offline use

Run `tools/setup_offline.py --dest /path/to/offline-copy` from the public clone.
It copies reference alignments, annotated sequences, the viewer distribution,
helper scripts, and coordinates. Maps remain opt-in (`--with-primary-maps`).
Start the copied `tools/serve.py`; opening `index.html` as a file is insufficient.
External paper/database links still require a network connection.
Use `--refresh-assets` to replace generated asset folders on an update without
re-downloading existing coordinates. Keep personal files outside these folders.

The reviewed curation environment used Biopython 1.88, NumPy 2.5.2, and MAFFT
7.526. The public UI and its validation tests require only Python 3's standard
library and Node.js for JavaScript tests; they do not rerun sequence alignment.
