#!/usr/bin/env python3
"""Open a small ChimeraX browser for generated named selections."""

from __future__ import annotations

import json
import re
import sys

from chimerax.core.commands import run

_UNBOUND_MODEL = object()


def _ui_available(session) -> bool:
    return bool(getattr(getattr(session, "ui", None), "is_gui", False))


def _id_tuple(model_id: str) -> tuple[int, ...]:
    return tuple(int(part) for part in str(model_id).split(".") if part)


def _model_by_id(session, model_id: str):
    if not model_id:
        return None
    models = session.models.list(model_id=_id_tuple(model_id))
    return models[0] if models else None


def _parent_model_ids(model_id: str) -> list[str]:
    parts = str(model_id).split(".")
    return [".".join(parts[:idx]) for idx in range(1, len(parts))]


def _model_scope(session, spec, bound_model=_UNBOUND_MODEL):
    """Use the browser's exact atomic model, never a parent containing other models."""
    model_id = str(spec.get("structure_model_id", ""))
    if not re.fullmatch(r"[1-9]\d*(?:\.\d+)*", model_id):
        raise ValueError("This selection browser has no valid structure model ID.")
    model = _model_by_id(session, model_id)
    if model is None or not hasattr(model, "atoms"):
        raise ValueError(f"Structure #{model_id} is no longer open.")
    if bound_model is not _UNBOUND_MODEL and model is not bound_model:
        raise ValueError(f"Structure #{model_id} has been replaced; reopen its selection browser.")
    return f"#{model_id}"


def ribbon_preset_commands(scope, preset):
    """Model-scoped subset of Matthias's Thin_ribbons.cxc preset.

    Thick uses protein width 4 / thickness 3; Thin uses width 2 / thickness 1.
    Nucleic cartoons use width/thickness 4 for Thick and 2 for Thin. Do not change colours, nucleotide annotation display, maps, or
    global lighting/background/camera. `divisions` is global even with a scope,
    so unlike the source template it is deliberately omitted here.
    """
    if not re.fullmatch(r"#[1-9]\d*(?:\.\d+)*", scope):
        raise ValueError("Ribbon presets require an exact structure model ID.")
    if preset not in ("overview", "detail"):
        raise ValueError("Choose Thick or Thin style.")
    width, thickness = (2, 1) if preset == "detail" else (4, 3)
    nucleic_size = 2 if preset == "detail" else 4
    return [
        f"cartoon style {scope} modeHelix default arrows true arrowsHelix false arrowScale 1.5 width {width} thickness {thickness} sides 12",
        f"cartoon style ({scope} & ~(nucleic|strand)) xsection round",
        f"cartoon style ({scope} & (nucleic|strand)) xsection rectangle",
        f"cartoon style ({scope} & nucleic) xsection round width {nucleic_size} thickness {nucleic_size}",
    ]


def apply_ribbon_preset(session, spec, preset, bound_model=_UNBOUND_MODEL):
    scope = _model_scope(session, spec, bound_model)
    for command in ribbon_preset_commands(scope, preset):
        run(session, command)


def _selection_has_atoms(session, target):
    from chimerax.core.commands import AtomSpecArg
    parsed, _, _ = AtomSpecArg.parse(target, session)
    return bool(len(parsed.evaluate(session).atoms))


def focus_named_selection(session, spec, data, bound_model=_UNBOUND_MODEL):
    """Select/focus only this browser's model and automatically use Detail."""
    scope = _model_scope(session, spec, bound_model)
    selector = str(data.get("name", ""))
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", selector):
        raise ValueError("This feature has no valid named selector.")
    target = f"({scope} & {selector})"
    if not _selection_has_atoms(session, target):
        raise ValueError("This feature has no modelled atoms in this structure.")
    apply_ribbon_preset(session, spec, "detail", bound_model)
    run(session, f"select subtract {scope}")
    run(session, f"select add {target}")
    # 'view sel' would include an unrelated structure's preserved selection.
    run(session, f"view {target}")


def reset_structure_view(session, spec, bound_model=_UNBOUND_MODEL):
    scope = _model_scope(session, spec, bound_model)
    apply_ribbon_preset(session, spec, "overview", bound_model)
    run(session, f"select subtract {scope}")
    run(session, f"view {scope}")


def open_selection_browser(session, spec_path: str) -> None:
    with open(spec_path, "r", encoding="utf-8") as handle:
        spec = json.load(handle)
    selectors = list(spec.get("selectors", []))
    if not selectors:
        session.logger.info("No spliceosome named selections are available for this structure.")
        return
    if not _ui_available(session):
        session.logger.info(
            f"Loaded {len(selectors)} spliceosome named selections; "
            "the selection browser is skipped in no-GUI ChimeraX."
        )
        return

    from chimerax.core.tools import ToolInstance
    from chimerax.ui import MainToolWindow
    from Qt.QtCore import Qt
    from Qt.QtGui import QColor, QBrush, QFont
    from Qt.QtWidgets import (
        QHBoxLayout,
        QLabel,
        QLineEdit,
        QPushButton,
        QTreeWidget,
        QTreeWidgetItem,
        QVBoxLayout,
    )

    class SpliceosomeSelectionBrowser(ToolInstance):
        SESSION_ENDURING = False
        SESSION_SAVE = False

        def __init__(self, session, tool_name, spec, selectors):
            super().__init__(session, tool_name)
            self.spec = spec
            self.bound_model = _model_by_id(session, str(spec.get("structure_model_id", "")))
            self.selectors = selectors
            self.filtered = list(selectors)
            self._populating = False
            self.tool_window = MainToolWindow(self)
            parent = self.tool_window.ui_area
            layout = QVBoxLayout(parent)
            title = QLabel(
                f"{spec.get('pdb_id', '').upper()} named selections "
                f"({len(selectors)} total)"
            )
            layout.addWidget(title)
            presets = QHBoxLayout()
            presets.addWidget(QLabel("Style:", parent))
            self.overview_button = QPushButton("Thick", parent)
            self.detail_button = QPushButton("Thin", parent)
            for button in (self.overview_button, self.detail_button):
                button.setCheckable(True)
                presets.addWidget(button)
            self.overview_button.setChecked(True)
            self.overview_button.setToolTip("Thick overview ribbons for this structure only; preserve component colours.")
            self.detail_button.setToolTip("Thinner protein ribbons for close inspection; also applied when focusing a feature. Nucleic cartoons use width and thickness 2.")
            presets.addStretch()
            layout.addLayout(presets)
            self.search = QLineEdit(parent)
            self.search.setPlaceholderText("Search selector, label, category, residues, or atomspec")
            layout.addWidget(self.search)
            self.tree = QTreeWidget(parent)
            self.tree.setColumnCount(4)
            self.tree.setHeaderLabels(["Label", "Selection", "Target", "Selector"])
            self.tree.setAlternatingRowColors(True)
            self.tree.setRootIsDecorated(True)
            self.tree.setUniformRowHeights(False)
            layout.addWidget(self.tree)
            buttons = QHBoxLayout()
            self.select_button = QPushButton("Select + Zoom", parent)
            self.show_labels_button = QPushButton("Show Labels", parent)
            self.hide_labels_button = QPushButton("Hide Labels", parent)
            self.clear_button = QPushButton("Reset view", parent)
            self.clear_button.setToolTip("Clear this structure's selection, restore Thick style, and fit this structure in the view.")
            buttons.addWidget(self.select_button)
            buttons.addWidget(self.show_labels_button)
            buttons.addWidget(self.hide_labels_button)
            buttons.addWidget(self.clear_button)
            layout.addLayout(buttons)

            self.search.textChanged.connect(self._filter)
            self.tree.itemClicked.connect(self._activate_item)
            self.tree.itemDoubleClicked.connect(self._activate_item)
            self.tree.itemChanged.connect(self._label_checkbox_changed)
            self.select_button.clicked.connect(self._activate_current)
            self.show_labels_button.clicked.connect(lambda: self._set_all_filtered_labels(True))
            self.hide_labels_button.clicked.connect(lambda: self._set_all_filtered_labels(False))
            self.overview_button.clicked.connect(lambda: self._preset("overview"))
            self.detail_button.clicked.connect(lambda: self._preset("detail"))
            self.clear_button.clicked.connect(self._reset_view)
            self._populate()
            self.tool_window.manage("side")

        def _filter_text(self, item):
            return " ".join(
                str(item.get(key, ""))
                for key in ("name", "label", "category", "atomspec", "comment")
            ).lower()

        def _filter(self, text):
            needle = text.strip().lower()
            self.filtered = [
                item for item in self.selectors if not needle or needle in self._filter_text(item)
            ]
            self._populate()

        def _populate(self):
            self._populating = True
            self.tree.clear()
            grouped = {}
            for item in self.filtered:
                family = item.get("family") or (
                    "RNA" if "RNA" in item.get("category", "") else "Protein/RNP groups"
                )
                group = item.get("group") or item.get("category") or "other selections"
                grouped.setdefault(family, {}).setdefault(group, []).append(item)

            family_order = ["RNA", "Protein/RNP groups", "Other"]
            for family in sorted(grouped, key=lambda value: (family_order.index(value) if value in family_order else 99, value)):
                family_count = sum(len(items) for items in grouped[family].values())
                family_item = QTreeWidgetItem(["", f"{family} ({family_count})", "", ""])
                self._style_group_item(family_item, family)
                self.tree.addTopLevelItem(family_item)
                for group in sorted(grouped[family]):
                    rows = sorted(grouped[family][group], key=lambda value: (value.get("label") or value.get("name", "")).lower())
                    group_item = QTreeWidgetItem(["", f"{group} ({len(rows)})", "", ""])
                    self._style_group_item(group_item, group)
                    family_item.addChild(group_item)
                    for data in rows:
                        label = data.get("label") or data.get("name")
                        atomspec = data.get("atomspec", "")
                        selector = data.get("name", "")
                        has_label = bool(data.get("label_model_id"))
                        row = QTreeWidgetItem(["", f"  {label}", atomspec, selector])
                        row.setData(0, Qt.UserRole, data)
                        row.setData(1, Qt.UserRole, data)
                        if has_label:
                            row.setFlags(row.flags() | Qt.ItemIsUserCheckable)
                            row.setCheckState(0, Qt.Checked if self._label_visible(data) else Qt.Unchecked)
                            row.setToolTip(0, "Show or hide the corresponding 3D RNA feature label")
                        else:
                            row.setText(0, "")
                        self._style_leaf_item(row, data)
                        group_item.addChild(row)
            self.tree.expandAll()
            for column in range(4):
                self.tree.resizeColumnToContents(column)
            self._populating = False

        def _style_group_item(self, item, label):
            font = item.font(1)
            font.setBold(True)
            item.setFont(1, font)
            item.setForeground(1, QBrush(QColor("#20242a")))
            for column in range(4):
                item.setBackground(column, QBrush(QColor("#eef2f7")))

        def _style_leaf_item(self, item, data):
            color = QColor(data.get("color") or "#9CA3AF")
            pale = QColor(color)
            pale.setAlpha(45)
            for column in range(4):
                item.setBackground(column, QBrush(pale))
            item.setForeground(1, QBrush(color))
            font = item.font(1)
            font.setBold(True)
            item.setFont(1, font)
            item.setToolTip(
                1,
                f"{data.get('label') or data.get('name')}\n"
                f"{data.get('category', '')} / {data.get('group', '')}\n"
                f"{data.get('comment', '')}",
            )

        def _label_visible(self, data):
            model_id = data.get("label_model_id", "")
            model = _model_by_id(self.session, model_id)
            if model is None:
                return bool(data.get("label_default_visible"))
            if not getattr(model, "display", True):
                return False
            for parent_id in _parent_model_ids(model_id):
                parent = _model_by_id(self.session, parent_id)
                if parent is not None and not getattr(parent, "display", True):
                    return False
            return True

        def _set_label_visible(self, data, visible):
            model_id = data.get("label_model_id", "")
            model = _model_by_id(self.session, model_id)
            if model is None:
                self.session.logger.warning(
                    f"RNA label model #{model_id} is not open. "
                    "The checkbox only toggles labels created earlier by the RNA label script."
                )
                return
            if visible:
                for parent_id in _parent_model_ids(model_id):
                    parent = _model_by_id(self.session, parent_id)
                    if parent is not None:
                        parent.display = True
            model.display = bool(visible)

        def _label_checkbox_changed(self, item, column):
            if self._populating or column != 0:
                return
            data = item.data(0, Qt.UserRole)
            if not data or not data.get("label_model_id"):
                return
            self._set_label_visible(data, item.checkState(0) == Qt.Checked)

        def _set_all_filtered_labels(self, visible):
            self._populating = True
            root = self.tree.invisibleRootItem()
            for item in self._iter_items(root):
                data = item.data(0, Qt.UserRole)
                if not data or not data.get("label_model_id"):
                    continue
                self._set_label_visible(data, visible)
                item.setCheckState(0, Qt.Checked if visible else Qt.Unchecked)
            self._populating = False

        def _iter_items(self, item):
            for index in range(item.childCount()):
                child = item.child(index)
                yield child
                yield from self._iter_items(child)

        def _activate_current(self):
            item = self.tree.currentItem()
            if item is not None:
                self._activate_item(item, 1)

        def _activate_item(self, item, column=0):
            if column == 0:
                return
            data = item.data(0, Qt.UserRole)
            if not data:
                return
            try:
                focus_named_selection(self.session, self.spec, data, self.bound_model)
                self._preset_checked("detail")
            except Exception as error:
                self.session.logger.warning(f"Could not focus this feature: {error}")

        def _preset_checked(self, preset):
            self.overview_button.setChecked(preset == "overview")
            self.detail_button.setChecked(preset == "detail")

        def _preset(self, preset):
            try:
                apply_ribbon_preset(self.session, self.spec, preset, self.bound_model)
                self._preset_checked(preset)
            except Exception as error:
                self.session.logger.warning(f"Could not change ribbon style: {error}")

        def _reset_view(self):
            try:
                reset_structure_view(self.session, self.spec, self.bound_model)
                self._preset_checked("overview")
            except Exception as error:
                self.session.logger.warning(f"Could not reset this structure's view: {error}")

    tool_name = f"Spliceosome Selections {spec.get('pdb_id', '').upper()}".strip()
    SpliceosomeSelectionBrowser(session, tool_name, spec, selectors)
    session.logger.info(f"Opened spliceosome named selection browser with {len(selectors)} entries.")

# Embedded named-selection specification for remote execution from GitHub.
_EMBEDDED_SPEC_JSON = '{\n  "pdb_id": "7q4p",\n  "selectors": [\n    {\n      "atomspec": "#313.1/2",\n      "category": "subcomplex",\n      "color": "#2F8B4D",\n      "comment": "U2 snRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U2/SF3B groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U2 snRNP",\n      "name": "pdb_7Q4P_U2_snRNP",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#313.1/1,9,A,B,C,E,G",\n      "category": "subcomplex",\n      "color": "#6DBE70",\n      "comment": "U2/SF3B",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U2/SF3B groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U2/SF3B",\n      "name": "pdb_7Q4P_U2_SF3B",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#313.1/2:26-27",\n      "category": "snRNA feature",\n      "color": "#047857",\n      "comment": "U2 snRNA U2/U6 helix I partner: residues 26-27, review-region, high confidence",\n      "family": "RNA",\n      "feature": "U2_U6_helix_I_partner",\n      "group": "snRNA-snRNA interacting regions",\n      "group_key": "snRNA_snRNA_regions",\n      "kind": "rna_feature",\n      "label": "U2 snRNA U2/U6 helix I partner",\n      "label_category_model_id": "313.2.1",\n      "label_default_visible": "",\n      "label_group_model_id": "313.2",\n      "label_model_id": "313.2.1.1",\n      "name": "U2_snRNP_7Q4P_U2_U6_helix_I_partner",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#313.1/2:34-41",\n      "category": "snRNA feature",\n      "color": "#0B6E2D",\n      "comment": "U2 snRNA branchpoint pairing region: residues 34-41, sequence-motif-neighborhood, medium confidence",\n      "family": "RNA",\n      "feature": "U2_branchpoint_pairing_region",\n      "group": "snRNA-pre-mRNA regions",\n      "group_key": "snRNA_pre_mRNA_regions",\n      "kind": "rna_feature",\n      "label": "U2 snRNA branchpoint pairing region",\n      "label_category_model_id": "313.2.2",\n      "label_default_visible": "true",\n      "label_group_model_id": "313.2",\n      "label_model_id": "313.2.2.1",\n      "name": "U2_snRNP_7Q4P_U2_branchpoint_pairing_region",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#313.1/2:46-64",\n      "category": "snRNA feature",\n      "color": "#167A38",\n      "comment": "U2 snRNA stem IIa: residues 46-64, review-region, low confidence",\n      "family": "RNA",\n      "feature": "U2_stem_IIa",\n      "group": "internal stem loops",\n      "group_key": "internal_stem_loops",\n      "kind": "rna_feature",\n      "label": "U2 snRNA stem IIa",\n      "label_category_model_id": "313.2.3",\n      "label_default_visible": "",\n      "label_group_model_id": "313.2",\n      "label_model_id": "313.2.3.1",\n      "name": "U2_snRNP_7Q4P_U2_stem_IIa",\n      "section": "Named selections for resolved snRNA functional regions."\n    }\n  ],\n  "structure_group_id": "313",\n  "structure_model_id": "313.1"\n}'
_EMBEDDED_SPEC = json.loads(_EMBEDDED_SPEC_JSON)

import os as _os
import tempfile as _tempfile
_fd, _spec_path = _tempfile.mkstemp(prefix='spliceosome_named_selections_', suffix='.json')
try:
    with _os.fdopen(_fd, 'w', encoding='utf-8') as _handle:
        json.dump(_EMBEDDED_SPEC, _handle)
    open_selection_browser(session, _spec_path)
finally:
    try:
        _os.remove(_spec_path)
    except OSError:
        pass
