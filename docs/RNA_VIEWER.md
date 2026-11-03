# Interactive RNA secondary-structure viewer

Open **RNA secondary-structure rendering** under a structure's RNA annotations.
The embedded SVG viewer supports choosing an individual RNA, zoom buttons,
**Read bases**, **Fit selected RNA**, drag-to-pan, and Alt+wheel zoom. Arrow keys
pan the focused diagram; +/− zoom and 0 fits the selected layout. Ordinary wheel
scrolling continues to move the surrounding page. A link opens a separate tab.
PNG and source SVG downloads remain available.

Read bases targets 14-pixel nucleotide text. Dense layouts get smaller SVG glyphs
and feature dots based on local nucleotide spacing, so magnifying the drawing does
not simply magnify overlapping letters. The nucleotide coordinates, identities,
features and interactions are unchanged. RNA panels in the source drawing were
scaled independently: relative sizes and distances between panels are schematic.
This viewer navigates the existing layouts; it does not predict new RNA folds.

## Lines

- Grey backbone: deposited sequence; dashed backbone: unresolved intervals.
- Thin black lines: base pairs.
- Dashed curves between RNAs: clustered FR3D interactions. Thickness increases
  with reported interaction count, capped at 4.5 SVG units (1.1 + 0.22 × count).
  Thickness is not interaction strength, binding energy or confidence.
- Coloured circles/overlays: annotated features; feature dots are resized for
  readability in the interactive view without changing their colours or opacity.
- For fallback sequence schematics, thin arcs are intrachain base pairs and dashed
  links are annotation-derived feature relationships; width does not encode strength.

Existing SVG interaction titles remain available on hover. The standalone viewer
accepts only same-origin SVG assets inside the release's rna_2d directory and strips
executable elements and external references before displaying the SVG.
