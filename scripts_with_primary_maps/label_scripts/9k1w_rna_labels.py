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
from chimerax.label.label3d import ObjectLabels, ResidueLabel


class OutlinedResidueLabel(ResidueLabel):
    """Paint a text halo into the label texture instead of copying 3D models."""

    def __init__(self, *args, outline_color=(255, 255, 255, 255), outline_width=3, **kwargs):
        super().__init__(*args, **kwargs)
        self.outline_color = outline_color
        self.outline_width = outline_width

    def _label_image(self):
        from math import ceil
        from Qt.QtCore import Qt
        from Qt.QtGui import QColor, QFont, QImage, QPainter, QPainterPath, QPen
        from chimerax.graphics import qimage_to_numpy

        font = QFont(self.font, self.size)
        path = QPainterPath()
        path.addText(0, 0, font, self.text)
        bounds = path.boundingRect()
        pad = max(1, ceil(self.outline_width)) + 2
        width = max(1, ceil(bounds.width()) + 2 * pad)
        height = max(1, ceil(bounds.height()) + 2 * pad)
        path.translate(pad - bounds.left(), pad - bounds.top())

        image = QImage(width, height, QImage.Format.Format_ARGB32)
        image.fill(QColor(0, 0, 0, 0))
        painter = QPainter(image)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.setPen(QPen(QColor(*self.outline_color), 2 * self.outline_width,
                            Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap,
                            Qt.PenJoinStyle.RoundJoin))
        painter.setBrush(QColor(*self.color))
        painter.drawPath(path)
        painter.end()
        self._label_size = width, height
        return qimage_to_numpy(image)


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
    outline_color = _color_uint8(spec.get("outline_color", "#ffffff"))
    outline_width = spec.get("outline_width", 3)
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

        foreground_model = ObjectLabels(session)
        foreground_model.name = label["model_name"]
        foreground_model.id = _id_tuple(feature_id)
        session.models.add([foreground_model], parent=category_group)
        foreground_settings = {
            "text": label["text"],
            "color": _color_uint8(label["color"]),
            "background": None,
            "height": height,
            "size": size,
            "position": "centroid",
            "outline_color": outline_color,
            "outline_width": outline_width,
        }
        foreground_model.add_labels(residues, OutlinedResidueLabel, view, foreground_settings, on_top=True)
        created += 1

    session.logger.info(f"Created {created} independently togglable RNA feature label models under #{group_id}")

# Embedded label specification for remote execution from GitHub.
_EMBEDDED_SPEC_JSON = '{\n  "background": "none",\n  "cleanup_model_ids": [\n    "320.1.90"\n  ],\n  "default_visible_category_keys": [\n    "pre_mRNA_features",\n    "snRNA_pre_mRNA_regions"\n  ],\n  "default_visible_category_names": [\n    "pre-mRNA features",\n    "snRNA-pre-mRNA regions"\n  ],\n  "height": 3.35,\n  "label_group_model_id": "320.2",\n  "label_group_name": "RNA_feature_labels",\n  "labels": [\n    {\n      "atomspec": "#320.1/G:33",\n      "category_key": "pre_mRNA_features",\n      "category_model_id": "320.2.1",\n      "category_name": "pre-mRNA features",\n      "color": "#303030",\n      "default_visible": true,\n      "feature": "branch_point_region",\n      "index": 1,\n      "label_model_id": "320.2.1.1",\n      "model_name": "label_01_BP_region_res_28_38",\n      "selector_name": "U2_snRNP_9K1W_branch_region",\n      "text": "BP region (res. 28-38)"\n    },\n    {\n      "atomspec": "#320.1/G:36",\n      "category_key": "pre_mRNA_features",\n      "category_model_id": "320.2.1",\n      "category_name": "pre-mRNA features",\n      "color": "#303030",\n      "default_visible": true,\n      "feature": "branch_point_adenosine",\n      "index": 2,\n      "label_model_id": "320.2.1.2",\n      "model_name": "label_02_BP_A_res_36",\n      "selector_name": "U2_snRNP_9K1W_branch_A",\n      "text": "BP-A (res. 36)"\n    },\n    {\n      "atomspec": "#320.1/H:6",\n      "category_key": "snRNA_pre_mRNA_regions",\n      "category_model_id": "320.2.2",\n      "category_name": "snRNA-pre-mRNA regions",\n      "color": "#0B6E2D",\n      "default_visible": true,\n      "feature": "U2_branchpoint_pairing_region",\n      "index": 3,\n      "label_model_id": "320.2.2.1",\n      "model_name": "label_03_U2_BP_pairing_res_2_11",\n      "selector_name": "U2_snRNP_9K1W_U2_branchpoint_pairing_region",\n      "text": "U2 BP pairing (res. 2-11)"\n    }\n  ],\n  "outline_color": "#ffffff",\n  "outline_width": 3,\n  "size": 144,\n  "structure_model_id": "320.1"\n}'
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
