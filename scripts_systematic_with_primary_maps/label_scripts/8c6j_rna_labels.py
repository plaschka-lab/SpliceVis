#!/usr/bin/env python3
"""Create RNA feature labels as one ChimeraX model per label.

This helper is called from generated ChimeraX command scripts.  The standard
`label` command stores all residue labels for one structure in a single child
model, which prevents toggling individual labels in the Model Panel.
"""

from __future__ import annotations

import json
import sys

from chimerax.core.colors import Color
from chimerax.core.commands import ObjectsArg
from chimerax.core.models import Model
from chimerax.label.label3d import ObjectLabels, label_class


OUTLINE_OFFSETS = (
    (-0.085, 0, 0),
    (0.085, 0, 0),
    (0, -0.085, 0),
    (0, 0.085, 0),
    (-0.060, -0.060, 0),
    (-0.060, 0.060, 0),
    (0.060, -0.060, 0),
    (0.060, 0.060, 0),
    (-0.052, 0, 0),
    (0.052, 0, 0),
    (0, -0.052, 0),
    (0, 0.052, 0),
    (-0.037, -0.037, 0),
    (-0.037, 0.037, 0),
    (0.037, -0.037, 0),
    (0.037, 0.037, 0),
)


def _id_tuple(model_id: str) -> tuple[int, ...]:
    return tuple(int(part) for part in str(model_id).split(".") if part)


def _model_by_id(session, model_id: str):
    models = session.models.list(model_id=_id_tuple(model_id))
    return models[0] if models else None


def _parent_model_id(model_id: str) -> str | None:
    parts = str(model_id).split(".")
    return ".".join(parts[:-1]) if len(parts) > 1 else None


def _parse_residues(session, atomspec: str):
    objects, _used, rest = ObjectsArg.parse(atomspec, session)
    if rest.strip():
        raise ValueError(f"Could not parse complete atom specifier: {atomspec!r}")
    return list(objects.residues)


def _color_uint8(color_spec: str):
    return Color(color_spec).uint8x4()


def _category_key(label: dict) -> str:
    return label.get("category_key") or "other_RNA_features"


def _category_name(label: dict) -> str:
    return label.get("category_name") or _category_key(label).replace("_", " ")


def create_label_models(session, spec_path: str) -> None:
    with open(spec_path, "r", encoding="utf-8") as handle:
        spec = json.load(handle)

    structure_id = spec["structure_model_id"]
    structure = _model_by_id(session, structure_id)
    if structure is None:
        raise ValueError(f"Structure model #{structure_id} is not open")

    group_id = spec.get("label_group_model_id") or f"{structure_id}.{spec.get('label_group_child_id', 90)}"
    cleanup_ids = [group_id] + spec.get("cleanup_model_ids", [])
    for cleanup_id in cleanup_ids:
        old_group = _model_by_id(session, cleanup_id)
        if old_group is not None:
            session.models.close([old_group])

    group = Model(spec.get("label_group_name", "RNA_feature_labels"), session)
    group.id = _id_tuple(group_id)
    parent_id = _parent_model_id(group_id)
    parent = _model_by_id(session, parent_id) if parent_id else None
    if parent is None:
        parent = structure
    if parent is not structure:
        group.position = structure.position
    session.models.add([group], parent=parent)

    view = session.main_view
    height = spec.get("height", 3)
    size = spec.get("size", 96)
    background_spec = spec.get("background")
    background = None if background_spec in (None, "", "none") else _color_uint8(background_spec)
    outline_color = _color_uint8(spec.get("outline_color", "#ffffff"))
    outline_offsets = spec.get("outline_offsets", OUTLINE_OFFSETS)
    visible_category_keys = set(spec.get("default_visible_category_keys", []))
    visible_category_names = set(spec.get("default_visible_category_names", []))

    category_models = {}
    category_counts = {}
    created = 0
    for label in spec.get("labels", []):
        residues = _parse_residues(session, label["atomspec"])
        if not residues:
            session.logger.warning(f"No residues found for RNA label atom specifier {label['atomspec']!r}")
            continue

        category_key = _category_key(label)
        if category_key not in category_models:
            category_index = len(category_models) + 1
            category_name = _category_name(label)
            category_group = Model(category_name, session)
            category_group.id = _id_tuple(f"{group_id}.{category_index}")
            session.models.add([category_group], parent=group)
            if visible_category_keys or visible_category_names:
                category_group.display = category_key in visible_category_keys or category_name in visible_category_names
            category_models[category_key] = (category_group, category_index)
            category_counts[category_key] = 0

        category_group, category_index = category_models[category_key]
        category_counts[category_key] += 1
        feature_index = category_counts[category_key]
        feature_id = f"{group_id}.{category_index}.{feature_index}"

        feature_group = Model(label["model_name"], session)
        feature_group.id = _id_tuple(feature_id)
        session.models.add([feature_group], parent=category_group)

        for outline_index, offset in enumerate(outline_offsets, start=1):
            outline_model = ObjectLabels(session)
            outline_model.name = f"{label['model_name']}_outline_{outline_index:02d}"
            outline_model.id = _id_tuple(f"{feature_id}.{outline_index}")
            session.models.add([outline_model], parent=feature_group)
            outline_settings = {
                "text": label["text"],
                "color": outline_color,
                "background": None,
                "height": height,
                "size": size,
                "offset": tuple(offset),
                "position": "centroid",
            }
            outline_model.add_labels(residues, label_class(residues[0]), view, outline_settings, on_top=True)

        foreground_model = ObjectLabels(session)
        foreground_model.name = f"{label['model_name']}_text"
        foreground_model.id = _id_tuple(f"{feature_id}.{len(outline_offsets) + 1}")
        session.models.add([foreground_model], parent=feature_group)
        foreground_settings = {
            "text": label["text"],
            "color": _color_uint8(label["color"]),
            "background": background,
            "height": height,
            "size": size,
            "position": "centroid",
        }
        foreground_model.add_labels(residues, label_class(residues[0]), view, foreground_settings, on_top=True)
        created += 1

    session.logger.info(f"Created {created} independently togglable RNA feature label models under #{group_id}")

# Embedded label specification for remote execution from GitHub.
_EMBEDDED_SPEC_JSON = '{\n  "background": "none",\n  "cleanup_model_ids": [\n    "421.1.90"\n  ],\n  "default_visible_category_keys": [\n    "pre_mRNA_features",\n    "snRNA_pre_mRNA_regions"\n  ],\n  "default_visible_category_names": [\n    "pre-mRNA features",\n    "snRNA-pre-mRNA regions"\n  ],\n  "height": 3.35,\n  "label_group_model_id": "421.2",\n  "label_group_name": "RNA_feature_labels",\n  "labels": [\n    {\n      "atomspec": "#421.1/M:-12",\n      "category_key": "pre_mRNA_features",\n      "category_model_id": "421.2.1",\n      "category_name": "pre-mRNA features",\n      "color": "#FF8C00",\n      "default_visible": true,\n      "feature": "exon_5",\n      "index": 1,\n      "label_model_id": "421.2.1.1",\n      "model_name": "label_01_5_exon_res_24_1",\n      "selector_name": "Cstar_8C6J_5exon",\n      "text": "5\' exon (res. -24--1)"\n    },\n    {\n      "atomspec": "#421.1/I:4",\n      "category_key": "pre_mRNA_features",\n      "category_model_id": "421.2.1",\n      "category_name": "pre-mRNA features",\n      "color": "#303030",\n      "default_visible": true,\n      "feature": "five_prime_splice_site",\n      "index": 2,\n      "label_model_id": "421.2.1.2",\n      "model_name": "label_02_5_SS_res_1_6",\n      "selector_name": "Cstar_8C6J_5SS",\n      "text": "? 5\'SS (res. 1-6)"\n    },\n    {\n      "atomspec": "#421.1/I:162",\n      "category_key": "pre_mRNA_features",\n      "category_model_id": "421.2.1",\n      "category_name": "pre-mRNA features",\n      "color": "#303030",\n      "default_visible": true,\n      "feature": "intron",\n      "index": 3,\n      "label_model_id": "421.2.1.3",\n      "model_name": "label_03_intron_res_1_22_132_193",\n      "selector_name": "Cstar_8C6J_intron",\n      "text": "intron (res. 1-22;132-193)"\n    },\n    {\n      "atomspec": "#421.1/I:149",\n      "category_key": "pre_mRNA_features",\n      "category_model_id": "421.2.1",\n      "category_name": "pre-mRNA features",\n      "color": "#303030",\n      "default_visible": true,\n      "feature": "branch_point_region",\n      "index": 4,\n      "label_model_id": "421.2.1.4",\n      "model_name": "label_04_BP_region_res_147_151",\n      "selector_name": "Cstar_8C6J_branch_region",\n      "text": "BP region (res. 147-151)"\n    },\n    {\n      "atomspec": "#421.1/2:28",\n      "category_key": "snRNA_snRNA_regions",\n      "category_model_id": "421.2.2",\n      "category_name": "snRNA-snRNA interacting regions",\n      "color": "#047857",\n      "default_visible": false,\n      "feature": "U2_U6_helix_I_partner",\n      "index": 5,\n      "label_model_id": "421.2.2.1",\n      "model_name": "label_05_U2_U6_helix_I_res_26_30",\n      "selector_name": "Cstar_8C6J_U2_U6_helix_I_partner",\n      "text": "U2/U6 helix I (res. 26-30)"\n    },\n    {\n      "atomspec": "#421.1/2:36",\n      "category_key": "snRNA_pre_mRNA_regions",\n      "category_model_id": "421.2.3",\n      "category_name": "snRNA-pre-mRNA regions",\n      "color": "#0B6E2D",\n      "default_visible": true,\n      "feature": "U2_branchpoint_pairing_region",\n      "index": 6,\n      "label_model_id": "421.2.3.1",\n      "model_name": "label_06_U2_BP_pairing_res_32_41",\n      "selector_name": "Cstar_8C6J_U2_branchpoint_pairing_region",\n      "text": "U2 BP pairing (res. 32-41)"\n    },\n    {\n      "atomspec": "#421.1/2:53",\n      "category_key": "internal_stem_loops",\n      "category_model_id": "421.2.4",\n      "category_name": "internal stem loops",\n      "color": "#167A38",\n      "default_visible": false,\n      "feature": "U2_stem_IIa",\n      "index": 7,\n      "label_model_id": "421.2.4.1",\n      "model_name": "label_07_U2_stem_IIa_res_46_60",\n      "selector_name": "Cstar_8C6J_U2_stem_IIa",\n      "text": "U2 stem IIa (res. 46-60)"\n    },\n    {\n      "atomspec": "#421.1/5:40",\n      "category_key": "snRNA_pre_mRNA_regions",\n      "category_model_id": "421.2.3",\n      "category_name": "snRNA-pre-mRNA regions",\n      "color": "#1B3CD0",\n      "default_visible": true,\n      "feature": "U5_loop_I",\n      "index": 8,\n      "label_model_id": "421.2.3.2",\n      "model_name": "label_08_U5_loop_I_res_38_42",\n      "selector_name": "Cstar_8C6J_U5_loop_I",\n      "text": "U5 loop I (res. 38-42)"\n    },\n    {\n      "atomspec": "#421.1/6:16",\n      "category_key": "internal_stem_loops",\n      "category_model_id": "421.2.4",\n      "category_name": "internal stem loops",\n      "color": "#DC143C",\n      "default_visible": false,\n      "feature": "U6_5prime_terminal_stem_loop",\n      "index": 9,\n      "label_model_id": "421.2.4.2",\n      "model_name": "label_09_U6_5_terminal_SL_res_1_30",\n      "selector_name": "Cstar_8C6J_U6_5_terminal_stem_loop",\n      "text": "U6 5\' terminal SL (res. 1-30)"\n    },\n    {\n      "atomspec": "#421.1/6:48",\n      "category_key": "snRNA_snRNA_regions",\n      "category_model_id": "421.2.2",\n      "category_name": "snRNA-snRNA interacting regions",\n      "color": "#D0183C",\n      "default_visible": false,\n      "feature": "U6_U2_helix_I_partner",\n      "index": 10,\n      "label_model_id": "421.2.2.2",\n      "model_name": "label_10_U2_U6_helix_I_res_35_60",\n      "selector_name": "Cstar_8C6J_U6_U2_helix_I_partner",\n      "text": "U2/U6 helix I (res. 35-60)"\n    },\n    {\n      "atomspec": "#421.1/6:44",\n      "category_key": "snRNA_pre_mRNA_regions",\n      "category_model_id": "421.2.3",\n      "category_name": "snRNA-pre-mRNA regions",\n      "color": "#E01842",\n      "default_visible": true,\n      "feature": "U6_5SS_upstream_contact",\n      "index": 11,\n      "label_model_id": "421.2.3.3",\n      "model_name": "label_11_U6_5_SS_contact_res_38_49",\n      "selector_name": "Cstar_8C6J_U6_5SS_upstream_contact",\n      "text": "U6 5\'SS contact (res. 38-49)"\n    },\n    {\n      "atomspec": "#421.1/6:44",\n      "category_key": "other_snRNA_regions",\n      "category_model_id": "421.2.5",\n      "category_name": "other snRNA regions",\n      "color": "#DC143C",\n      "default_visible": false,\n      "feature": "U6_ACAGAGA_box",\n      "index": 12,\n      "label_model_id": "421.2.5.1",\n      "model_name": "label_12_U6_ACAGAGA_res_41_47",\n      "selector_name": "Cstar_8C6J_U6_ACAGAGA_box",\n      "text": "U6 ACAGAGA (res. 41-47)"\n    },\n    {\n      "atomspec": "#421.1/6:88",\n      "category_key": "internal_stem_loops",\n      "category_model_id": "421.2.4",\n      "category_name": "internal stem loops",\n      "color": "#D61A3D",\n      "default_visible": false,\n      "feature": "U6_ISL",\n      "index": 13,\n      "label_model_id": "421.2.4.3",\n      "model_name": "label_13_U6_ISL_res_79_97",\n      "selector_name": "Cstar_8C6J_U6_ISL",\n      "text": "U6 ISL (res. 79-97)"\n    },\n    {\n      "atomspec": "#421.1/6:93",\n      "category_key": "catalytic_core_regions",\n      "category_model_id": "421.2.6",\n      "category_name": "catalytic core regions",\n      "color": "#C91236",\n      "default_visible": false,\n      "feature": "U6_AGC_catalytic_triad",\n      "index": 14,\n      "label_model_id": "421.2.6.1",\n      "model_name": "label_14_U6_AGC_triad_res_92_94",\n      "selector_name": "Cstar_8C6J_U6_AGC_catalytic_triad",\n      "text": "U6 AGC triad (res. 92-94)"\n    }\n  ],\n  "outline_color": "#ffffff",\n  "outline_offsets": [\n    [\n      -0.085,\n      0,\n      0\n    ],\n    [\n      0.085,\n      0,\n      0\n    ],\n    [\n      0,\n      -0.085,\n      0\n    ],\n    [\n      0,\n      0.085,\n      0\n    ],\n    [\n      -0.06,\n      -0.06,\n      0\n    ],\n    [\n      -0.06,\n      0.06,\n      0\n    ],\n    [\n      0.06,\n      -0.06,\n      0\n    ],\n    [\n      0.06,\n      0.06,\n      0\n    ],\n    [\n      -0.052,\n      0,\n      0\n    ],\n    [\n      0.052,\n      0,\n      0\n    ],\n    [\n      0,\n      -0.052,\n      0\n    ],\n    [\n      0,\n      0.052,\n      0\n    ],\n    [\n      -0.037,\n      -0.037,\n      0\n    ],\n    [\n      -0.037,\n      0.037,\n      0\n    ],\n    [\n      0.037,\n      -0.037,\n      0\n    ],\n    [\n      0.037,\n      0.037,\n      0\n    ]\n  ],\n  "size": 144,\n  "structure_model_id": "421.1"\n}'
_EMBEDDED_SPEC = json.loads(_EMBEDDED_SPEC_JSON)

import os as _os
import tempfile as _tempfile
_fd, _spec_path = _tempfile.mkstemp(prefix='spliceosome_rna_labels_', suffix='.json')
try:
    with _os.fdopen(_fd, 'w', encoding='utf-8') as _handle:
        json.dump(_EMBEDDED_SPEC, _handle)
    create_label_models(session, _spec_path)
finally:
    try:
        _os.remove(_spec_path)
    except OSError:
        pass
