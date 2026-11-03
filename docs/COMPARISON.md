# Comparing spliceosome structures

Select up to five atlas rows, then choose **Compare selected**. Selection is retained
when filtering. The compact atlas basket shows selected PDB IDs, individual remove
buttons and Clear all. Remove individual entries or clear the set in the comparison
workspace. **Proteins** opens first and highlights component presence and copy-count
differences. Chain-ID changes alone are not differences. Component colours match
the structure viewer; colours are not used to establish identity.

**RNA & substrate** compares annotated RNA, construct assignments and feature
coverage. Missing annotation does not establish biological absence. Deposited
residue numbers are labels, not aligned positions. **Overview** compares state,
species, resolution, publication year and chain/entity counts. **Evidence & links**
keeps confidence, validation context and source links available without ranking
structures by a single quality score.

## Aligned 3D

Opening Aligned 3D automatically loads all selected structures side by side (up
to five). Each model is fitted to the chosen reference; changing the reference or
view reloads the comparison. Cameras synchronize from any viewer, with an option
to disable synchronization. The blue reload button also allows retrying failures.
Overlay compares two selected entries. Shared-protein isolation applies across all
active structures and preserves component colours. Columns defaults to Auto, which wraps on smaller screens; choose 1–5 to
control the grid. Changing columns preserves loaded models, selections and views. A missing supported fit identifies the affected structure; choose another
reference or remove that structure before retrying. Changing tabs releases models.

Fits use sequence-aligned, modelled Cα atoms from a unique PRPF8 anchor, with SF3B1
as a fallback. They do not use author residue numbers as homology evidence. The
current acceptance criteria require at least 100 matched atoms, 35% sequence
identity, 60% sequence coverage, 25% modelled coverage, 60% retained fit positions,
core RMSD at most 3 Å. All-matched RMSD above 12 Å is reported as a warning about
displacement outside the fitted core, rather than rejecting an otherwise sound
core alignment. Existing accepted fits are preserved. If the initial monotone-trimmed fit is rejected, refinement retries and re-evaluates
all matched residues so positions displaced by the initial fit can rejoin the core.
The 60% retained fraction is checked after convergence, not during intermediate
fits in this retry. Retry refinement stops after at most 30 iterations; non-convergent fits are rejected.
Reported fit/core counts,
identity and both RMSDs make trimmed fits visible. The fitted anchor does not imply
that every other protein or domain shares the same conformation.

Sampled raw-coordinate probes check the downloaded model against the fitted
coordinate frame before displaying it. A mismatch, insufficient coverage or a
missing shared anchor leaves the alignment unavailable with a reason. Probes are
not an atom-for-atom model checksum. Rebuild fits after updating coordinate sources.
Use ChimeraX for custom anchors, local-domain fits, map inspection and advanced
representation control.

## Focused viewing and proximity

**Open viewer** gives the selected structure its own tab with RNA/protein controls.
Protein search accepts canonical names and aliases. Check several protein boxes to
build a display selection, then use Hide selection or Show only selection. Filtering
the protein list retains the checked set. Clicking a protein name replaces that set
and focuses the named protein; Clear selection removes the group. Feature labels are clickable;
when several chains match, choose a chain explicitly. A residue information strip updates immediately on hover, keyboard focus or touch.
It distinguishes deposited author numbers, sequence positions and alignment columns,
and labels feature membership as aligned reference annotations.
Selection outlines preserve
the component colours. Display options can hide or isolate a selection, restore all
components and toggle depth cue. Ordinary scrolling over the embedded atlas viewer
moves the page; Alt-scroll or the zoom buttons zoom the structure. The focused
viewer retains ordinary wheel zoom.

Proximity search offers **Whole protein** or a required integer residue range.
Only indexed modelled heavy-atom coordinates are searched. Unresolved regions and
unindexed structures are excluded. Ranges use deposited author numbering, which
can differ between species. Grouped results show the closest contact and retain all
associated PDB IDs in CSV. Distances are geometric observations; clashes can produce
very short distances and do not imply strong interactions.

The visible **ChimeraX: copy model** action loads coordinates only. Options include
a primary map, systematic chain IDs and official usage links. Large maps take longer
to load. The ChimeraX selection browser applies thin **Detail** ribbons when focusing
features; **Overview** restores thick ribbons, and **Reset view** restores Overview,
clears that model's selection and fits it. These controls preserve component colours
and leave unrelated models and maps unchanged.

Each aligned model has a searchable **Proteins / RNA elements** panel. Click a
name to focus its deposited chains or annotated residues; tick multiple entries
and choose **Show only selected** to isolate them in that model. **Show all / clear**
restores the model. Camera synchronization also applies when focusing selections.
In overlay mode, panels are labelled by PDB ID and act on that model only.
