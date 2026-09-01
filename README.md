# Spliceosome Cryo-EM ChimeraX Scripts

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.21168651.svg)](https://doi.org/10.5281/zenodo.21168651)

Lightweight static dashboard for copying ChimeraX scripts for spliceosome cryo-EM PDB entries.

- 146 deposited PDB entries.
- Original deposited chain identifiers by default, with optional in-session systematic chain renaming.
- Thumbnail PNGs and RNA 2D preview panels are included.
- No mmCIF files, local CIF models, or large map binaries are included.
- ChimeraX scripts use `open <pdb_id>` so ChimeraX downloads structures directly from the PDB.
- Primary-map script variants use `open emdb:<id>` so ChimeraX can download deposited primary EMDB maps on demand.
- Systematic-chain script variants use model-scoped two-step `changechains` commands through temporary safe-harbor IDs; no renamed CIF files are bundled.
- GUI ChimeraX scripts fetch a small named-selection browser from GitHub for search, select, zoom, and RNA-label toggle actions.

The **Refine** control beside the main search adds state, species, pre-mRNA substrate-family, RNA-feature, and sort filters without permanently occupying the atlas workspace. Recurrent substrates are assigned conservatively from deposited construct names, manual curation, exact sequence or intron matches, and high-identity alignment to named references. Ambiguous substrate-like RNAs remain explicitly review-required. The RNA Annotations panel provides an annotated GenBank reference, family alignment, and projected feature table where supported. These exports summarize and audit existing feature calls; reference-feature projection is not yet used as an independent feature-assignment rule.

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

Open `index.html` locally, or use the GitHub Pages dashboard:
https://plaschka-lab.github.io/SpliceVis/

Internal local CIF-only examples are intentionally excluded.
