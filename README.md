# SpliceVis

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.21168651.svg)](https://doi.org/10.5281/zenodo.21168651)

Static public atlas for exploring deposited spliceosome structures in an interactive, consistently colored 3D viewer and continuing the same visualization workflow in ChimeraX.

- 146 deposited PDB entries.
- Original deposited chain identifiers by default, with optional in-session systematic chain renaming.
- Thumbnail PNGs and RNA 2D preview panels are included.
- No mmCIF files, local CIF models, or large map binaries are included.
- ChimeraX scripts use `open <pdb_id>` so ChimeraX downloads structures directly from the PDB.
- Primary-map script variants use `open emdb:<id>` so ChimeraX can download deposited primary EMDB maps on demand.
- Systematic-chain script variants use model-scoped two-step `changechains` commands through temporary safe-harbor IDs; no renamed CIF files are bundled.
- GUI ChimeraX scripts fetch a small named-selection browser from GitHub for search, select, zoom, and RNA-label toggle actions.
- Mol* models use the SpliceVis protein and RNA-feature colors, with clickable controls linked to the reference-anchored RNA sequence viewer.

The **Refine** control beside the main search adds state, species, pre-mRNA substrate-family, RNA-feature, and sort filters without permanently occupying the atlas workspace. Recurrent substrates are assigned conservatively from deposited construct names, manual curation, exact sequence or intron matches, and high-identity alignment to literature-defined reference constructs. Ambiguous substrate-like RNAs remain explicitly review-required. The RNA Annotations panel provides an annotated GenBank reference, a reference-anchored multiple-sequence alignment showing which residues are modelled in each structure, and a table projecting each reference feature onto the deposited polymer sequences. These projections are exposed for audit and manual curation; they do not silently overwrite structure-level feature annotations.

## Fully local model-only copy

For offline work, clone the repository and run the setup helper. It copies the dashboard assets and downloads uncompressed mmCIF coordinate files into a local folder. EM maps are not included by default.

```bash
git clone https://github.com/plaschka-lab/SpliceVis.git
cd SpliceVis
python3 tools/setup_offline.py --dest ~/Documents/SpliceVis
```

Open the offline dashboard with:

```bash
cd ~/Documents/SpliceVis
./open_dashboard.command
```

Primary EMDB maps are optional because they are large:

```bash
python3 tools/setup_offline.py --dest ~/Documents/SpliceVis --with-primary-maps
```

Preview the public clone with `python3 tools/serve.py --open`, or use GitHub Pages:
https://plaschka-lab.github.io/SpliceVis/

Only released PDB entries are included in the public atlas.

UI source, dependency versions, evidence semantics, and release checks are
documented in [Development](docs/DEVELOPMENT.md).
