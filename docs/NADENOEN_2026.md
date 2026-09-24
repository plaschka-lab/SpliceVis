# Leishmania SL trans-spliceosome curation

Added 9IF7 (trans-C*, 2.7 Å, EMD-52843) and 9IF8 (trans-P, 2.8 Å,
EMD-52844) from [Nadenoen et al., Nature Communications 17, 9450
(2026)](https://doi.org/10.1038/s41467-026-77480-6).
The related PRP22 regional structures 9IBC/EMD-52808 and 9IBD/EMD-52809
are documented here rather than counted as additional complete spliceosomes.
Focused, consensus and half-map links are retained; large maps are on demand.

## Evidence reviewed

The curation archive contains the article, all nine supplementary/source
attachments, SHA-256 checksums, extracted text, spreadsheet cells, PyMOL
session labels, sequence searches and coordinate metadata. Materials include:

- Supplementary Information: Table 2 was visually checked because *italics*
  distinguish functional analogs from orthologs. Tables 4–5 and Figs. 8,
  10–18 and 21 supply sequences, chains, structural comparisons and boundaries.
- Supplementary Data 1: curated mass-spectrometry protein names and accessions.
- Source Data: Fig. 1h accession inventory and Needle identity results;
  Fig. 6 interaction predictions; ATPase measurements.
- Supplementary Data 2–3: PyMOL object labels, extracted without executing
  the serialized sessions. Supplementary Movies 1–2 were visually checked.
- Reporting Summary and the transparent peer-review file. The latter is
  particularly important for the withdrawn DDX41 assignment.

The existing `paper_homolog_text_mining.py` produced 37 candidate co-mentions
from the article, supplement and peer review. Co-mentions are candidates,
not automatic homology assignments. Local BLASTP against the atlas's human
spliceosomal protein reference set found significant hits for 34 of the 53
distinct protein entities in 9IF7 (E ≤ 0.001). Lack of a hit does not refute a
divergent protein assignment supported by the structure.

## Annotation decisions

There are 53 protein entities in 9IF7 and 49 in 9IF8, with 68 and 64 protein
chains respectively. Each entry has six RNA polymer chains. Conserved protein
families use established atlas colors and chain identities. Author names,
deposited locus identifiers, UniProt cross-references and evidence are retained.
See [protein assignments](curation/nadenoen_2026/protein_assignments.csv) and
[sequence audit](curation/nadenoen_2026/sequence_audit.csv).

| Factor | Treatment |
|---|---|
| PRC3 / PRC5 | Distinct identities; functional analogs of SYF2 / CCDC12 (yeast Syf2 / Ntc20), not asserted orthologs. |
| CWC21 | Distinct from full-length human SRRM2; Table 2 explicitly labels SRRM2 a functional analog. |
| RBP1 | RRM-domain functional replacement for PPIE; no whole-protein PPIE orthology asserted. |
| SDE2-like | Qualified author assignment retained, supported by processing motif and structural placement; no claim of demonstrated 3′-site selection function. |
| LtaPh_1601800 | FAM192A/Fyv6 positional and proposed functional analog. Fig. 4's `1601860` spelling conflicts with the deposition, Table 2 and Source Data; the latter agree on `1601800`. |
| Zn-knuckle | EJC factor occupying the CASC3 position; no CASC3 homology asserted. |
| LtaP16.0490 | Noncanonical SF2 ATPase. Peer review explicitly retreats from DDX41 orthology/equivalence. |
| Sm15K / Sm16.5K | Distinct U2-specific Sm variants. Do not map the misleading Lsm5p label of Sm15K onto U6 LSM5. Sm16.5K's SmD3 similarity is recorded without collapsing its identity. |
| PPIL1 | Author structural assignment retained. BLAST detects several cyclophilin paralogs and ranks PPIH/CYP20 slightly above PPIL1; best-hit ranking alone is not decisive. |
| UNK / UX | Unidentified 21-residue peptide, explicitly unresolved. PDBe incorrectly labels this entity as RNA in 9IF8; peptide backbone atoms and the publication support protein classification. |

The publication citation overrides the stale PDB “to be published” citation.
The EJC core is absent from the deposited trans-P model, while destabilized
factors with remaining coordinates are retained; mass-spectrometry presence is
not treated as proof of a modelled chain.

## RNA and colors

These are endogenous substrates purified through CDC5L. N-coded nucleotides
remain unspecified; they are not assigned to a named synthetic transcript.
Fig. 2 and deposited connectivity distinguish SL exon 1–39, SL outron author
40–96, and recipient acceptor AG at RN 43–44. After ligation, LE contains the
SL exon followed by recipient exon sequence positions 40–63. Before ligation,
the recipient exon is RN 45–68. Selectors include only modelled residues.

At the user's request, the SL outron uses the cis-intron color `#303030`,
the SL 5′ exon uses `#FF9D00`, and the recipient 3′ exon uses `#C65D00`.
This applies to the interactive viewer, ChimeraX scripts, and RNA panels.
U2, U5 and SL Sm rings remain distinct. No U1 ring is inferred from deposited
protein chain names `U1`, `U2`, or `U3`.

R2DT layouts are available for all six RNA chains in each structure. R2DT omits
N-coded bases, so affected substrate panels explicitly use linear sequence
schematics retaining modelled N residues. Unknown base identity is distinct
from missing coordinates. Other chains retain R2DT/RNApuzzler layouts.

The private curation workspace provides `curate_nadenoen_2026.py` and
`curate_nadenoen_rna.py` as repeatable inputs, plus manual-review tables.
The public repository intentionally does not include large coordinate/map
binaries or the complete supplementary archive.
