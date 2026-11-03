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

    Overview uses the generated dashboard's width 4 / thickness 3; Detail uses
    the supplied width 2 / thickness 1. RNA remains width/thickness 4, as in the
    template. Do not change colours, nucleotide annotation display, maps, or
    global lighting/background/camera. `divisions` is global even with a scope,
    so unlike the source template it is deliberately omitted here.
    """
    if not re.fullmatch(r"#[1-9]\d*(?:\.\d+)*", scope):
        raise ValueError("Ribbon presets require an exact structure model ID.")
    if preset not in ("overview", "detail"):
        raise ValueError("Choose Overview or Detail ribbons.")
    width, thickness = (2, 1) if preset == "detail" else (4, 3)
    return [
        f"cartoon style {scope} modeHelix default arrows true arrowsHelix false arrowScale 1.5 width {width} thickness {thickness} sides 12",
        f"cartoon style ({scope} & ~(nucleic|strand)) xsection round",
        f"cartoon style ({scope} & (nucleic|strand)) xsection rectangle",
        f"cartoon style ({scope} & nucleic) xsection round width 4 thickness 4",
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
            presets.addWidget(QLabel("Ribbons", parent))
            self.overview_button = QPushButton("Overview", parent)
            self.detail_button = QPushButton("Detail", parent)
            for button in (self.overview_button, self.detail_button):
                button.setCheckable(True)
                presets.addWidget(button)
            self.overview_button.setChecked(True)
            self.overview_button.setToolTip("Thick overview ribbons for this structure only; preserve component colours.")
            self.detail_button.setToolTip("Thinner protein ribbons for close inspection; also applied when focusing a feature. RNA width follows the supplied preset.")
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
            self.clear_button.setToolTip("Clear this structure's selection, restore Overview ribbons, and fit this structure in the view.")
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
_EMBEDDED_SPEC_JSON = '{\n  "pdb_id": "7dvq",\n  "selectors": [\n    {\n      "atomspec": "#388.1/V",\n      "category": "subcomplex",\n      "color": "#EAA439",\n      "comment": "EJC/mRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "EJC/mRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "EJC/mRNP",\n      "name": "pdb_7DVQ_EJC_mRNP",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#388.1/J,R",\n      "category": "subcomplex",\n      "color": "#F4BF67",\n      "comment": "NTC/NTR related",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "NTC/NTR groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "NTC/NTR related",\n      "name": "pdb_7DVQ_NTC_NTR_related",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#388.1/L,P,T",\n      "category": "subcomplex",\n      "color": "#F4BF67",\n      "comment": "NTC/PRP19",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "NTC/NTR groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "NTC/PRP19",\n      "name": "pdb_7DVQ_NTC_PRP19",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#388.1/G",\n      "category": "subcomplex",\n      "color": "#303030",\n      "comment": "RNA/substrate",\n      "family": "RNA",\n      "feature": "",\n      "group": "pre-mRNA features",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "RNA/substrate",\n      "name": "pdb_7DVQ_RNA_substrate",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#388.1/U",\n      "category": "subcomplex",\n      "color": "#9CA3AF",\n      "comment": "SR proteins",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "other protein/RNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "SR proteins",\n      "name": "pdb_7DVQ_SR_proteins",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#388.1/H",\n      "category": "subcomplex",\n      "color": "#B66AAE",\n      "comment": "U11/U12 snRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U1 snRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U11/U12 snRNP",\n      "name": "pdb_7DVQ_U11_U12_snRNP",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#388.1/h,i,j,k,l,m,n",\n      "category": "subcomplex",\n      "color": "#BFE6BF",\n      "comment": "U2 Sm ring",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U2/SF3B groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U2 Sm ring",\n      "name": "pdb_7DVQ_U2_Sm_ring",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#388.1/1,2,3,4,5,6,7",\n      "category": "subcomplex",\n      "color": "#6DBE70",\n      "comment": "U2/SF3B",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U2/SF3B groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U2/SF3B",\n      "name": "pdb_7DVQ_U2_SF3B",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#388.1/F",\n      "category": "subcomplex",\n      "color": "#D8C800",\n      "comment": "U4atac/U6atac snRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U4/U6 groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U4atac/U6atac snRNP",\n      "name": "pdb_7DVQ_U4atac_U6atac_snRNP",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#388.1/a,b,c,d,e,f,g",\n      "category": "subcomplex",\n      "color": "#BFC3E8",\n      "comment": "U5 Sm ring",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U5 snRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U5 Sm ring",\n      "name": "pdb_7DVQ_U5_Sm_ring",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#388.1/A,B,C,D,E",\n      "category": "subcomplex",\n      "color": "#0000CD",\n      "comment": "U5 snRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U5 snRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U5 snRNP",\n      "name": "pdb_7DVQ_U5_snRNP",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#388.1/0,8,9,I,K,M,X,Y,Z,v,x,y,z",\n      "category": "subcomplex",\n      "color": "#9CA3AF",\n      "comment": "other",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "other protein/RNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "other",\n      "name": "pdb_7DVQ_other",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#388.1/G:-11-0",\n      "category": "substrate RNA feature",\n      "color": "#FF9D00",\n      "comment": "5\' exon: residues -11-0, five-ss-inference, medium confidence, validation not_applicable",\n      "family": "RNA",\n      "feature": "exon_5",\n      "group": "pre-mRNA features",\n      "group_key": "pre_mRNA_features",\n      "kind": "rna_feature",\n      "label": "5\' exon",\n      "label_category_model_id": "388.2.1",\n      "label_default_visible": "true",\n      "label_group_model_id": "388.2",\n      "label_model_id": "388.2.1.1",\n      "name": "Bact_7DVQ_5exon",\n      "section": "Named selections for resolved substrate RNA features."\n    },\n    {\n      "atomspec": "#388.1/G:1-10",\n      "category": "substrate RNA feature",\n      "color": "#303030",\n      "comment": "5\' splice site: residues 1-10, minor-snrna-basepair; manual-review-correction, high confidence, validation validated",\n      "family": "RNA",\n      "feature": "five_prime_splice_site",\n      "group": "pre-mRNA features",\n      "group_key": "pre_mRNA_features",\n      "kind": "rna_feature",\n      "label": "5\' splice site",\n      "label_category_model_id": "388.2.1",\n      "label_default_visible": "true",\n      "label_group_model_id": "388.2",\n      "label_model_id": "388.2.1.2",\n      "name": "Bact_7DVQ_5SS",\n      "section": "Named selections for resolved substrate RNA features."\n    },\n    {\n      "atomspec": "#388.1/G:1-19,191-222",\n      "category": "substrate RNA feature",\n      "color": "#303030",\n      "comment": "intron from 5\' splice site: residues 1-19;191-222, five-ss-inference, medium confidence, validation not_applicable",\n      "family": "RNA",\n      "feature": "intron",\n      "group": "pre-mRNA features",\n      "group_key": "pre_mRNA_features",\n      "kind": "rna_feature",\n      "label": "intron from 5\' splice site",\n      "label_category_model_id": "388.2.1",\n      "label_default_visible": "true",\n      "label_group_model_id": "388.2",\n      "label_model_id": "388.2.1.3",\n      "name": "Bact_7DVQ_intron",\n      "section": "Named selections for resolved substrate RNA features."\n    },\n    {\n      "atomspec": "#388.1/G:195-206",\n      "category": "substrate RNA feature",\n      "color": "#303030",\n      "comment": "branch point region: residues 195-206, network-scored-motif, high confidence, validation validated",\n      "family": "RNA",\n      "feature": "branch_point_region",\n      "group": "pre-mRNA features",\n      "group_key": "pre_mRNA_features",\n      "kind": "rna_feature",\n      "label": "branch point region",\n      "label_category_model_id": "388.2.1",\n      "label_default_visible": "true",\n      "label_group_model_id": "388.2",\n      "label_model_id": "388.2.1.4",\n      "name": "Bact_7DVQ_branch_region",\n      "section": "Named selections for resolved substrate RNA features."\n    },\n    {\n      "atomspec": "#388.1/G:203",\n      "category": "substrate RNA feature",\n      "color": "#303030",\n      "comment": "branch point adenosine: residues 203, network-scored-motif, high confidence, validation validated",\n      "family": "RNA",\n      "feature": "branch_point_adenosine",\n      "group": "pre-mRNA features",\n      "group_key": "pre_mRNA_features",\n      "kind": "rna_feature",\n      "label": "branch point adenosine",\n      "label_category_model_id": "388.2.1",\n      "label_default_visible": "true",\n      "label_group_model_id": "388.2",\n      "label_model_id": "388.2.1.5",\n      "name": "Bact_7DVQ_branch_A",\n      "section": "Named selections for resolved substrate RNA features."\n    },\n    {\n      "atomspec": "#388.1/H:2-11",\n      "category": "snRNA feature",\n      "color": "#047857",\n      "comment": "U12 snRNA U12/U6atac helix I partner: residues 2-11, reference-alignment, high confidence",\n      "family": "RNA",\n      "feature": "U12_U6atac_helix_I_partner",\n      "group": "snRNA-snRNA interacting regions",\n      "group_key": "snRNA_snRNA_regions",\n      "kind": "rna_feature",\n      "label": "U12 snRNA U12/U6atac helix I partner",\n      "label_category_model_id": "388.2.2",\n      "label_default_visible": "",\n      "label_group_model_id": "388.2",\n      "label_model_id": "388.2.2.1",\n      "name": "Bact_7DVQ_U12_U6atac_helix_I_partner",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#388.1/H:16-26",\n      "category": "snRNA feature",\n      "color": "#0B6E2D",\n      "comment": "U12 snRNA branchpoint pairing region: residues 16-26, reference-alignment, high confidence",\n      "family": "RNA",\n      "feature": "U12_branchpoint_pairing_region",\n      "group": "snRNA-pre-mRNA regions",\n      "group_key": "snRNA_pre_mRNA_regions",\n      "kind": "rna_feature",\n      "label": "U12 snRNA branchpoint pairing region",\n      "label_category_model_id": "388.2.3",\n      "label_default_visible": "true",\n      "label_group_model_id": "388.2",\n      "label_model_id": "388.2.3.1",\n      "name": "Bact_7DVQ_U12_branchpoint_pairing_region",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#388.1/H:75-81",\n      "category": "snRNA feature",\n      "color": "#2F8B4D",\n      "comment": "U12 snRNA Sm site: residues 75-81, sequence-motif, medium confidence",\n      "family": "RNA",\n      "feature": "U12_Sm_site",\n      "group": "other snRNA regions",\n      "group_key": "other_snRNA_regions",\n      "kind": "rna_feature",\n      "label": "U12 snRNA Sm site",\n      "name": "Bact_7DVQ_U12_Sm_site",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#388.1/B:38-42",\n      "category": "snRNA feature",\n      "color": "#1B3CD0",\n      "comment": "U5 snRNA loop I: residues 38-42, sequence-motif, medium confidence",\n      "family": "RNA",\n      "feature": "U5_loop_I",\n      "group": "snRNA-pre-mRNA regions",\n      "group_key": "snRNA_pre_mRNA_regions",\n      "kind": "rna_feature",\n      "label": "U5 snRNA loop I",\n      "label_category_model_id": "388.2.3",\n      "label_default_visible": "true",\n      "label_group_model_id": "388.2",\n      "label_model_id": "388.2.3.2",\n      "name": "Bact_7DVQ_U5_loop_I",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#388.1/F:11-17",\n      "category": "snRNA feature",\n      "color": "#DC143C",\n      "comment": "U6atac snRNA 5\' splice-site recognition region: residues 11-17, reference-alignment, high confidence",\n      "family": "RNA",\n      "feature": "U6atac_5prime_5SS_recognition",\n      "group": "snRNA-pre-mRNA regions",\n      "group_key": "snRNA_pre_mRNA_regions",\n      "kind": "rna_feature",\n      "label": "U6atac snRNA 5\' splice-site recognition region",\n      "label_category_model_id": "388.2.3",\n      "label_default_visible": "true",\n      "label_group_model_id": "388.2",\n      "label_model_id": "388.2.3.3",\n      "name": "Bact_7DVQ_U6atac_5_5SS_recognition",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#388.1/F:23-29",\n      "category": "snRNA feature",\n      "color": "#D0183C",\n      "comment": "U6atac snRNA U6atac/U12 helix I partner: residues 23-29, reference-alignment, high confidence",\n      "family": "RNA",\n      "feature": "U6atac_U12_helix_I_partner",\n      "group": "snRNA-snRNA interacting regions",\n      "group_key": "snRNA_snRNA_regions",\n      "kind": "rna_feature",\n      "label": "U6atac snRNA U6atac/U12 helix I partner",\n      "label_category_model_id": "388.2.2",\n      "label_default_visible": "",\n      "label_group_model_id": "388.2",\n      "label_model_id": "388.2.2.2",\n      "name": "Bact_7DVQ_U6atac_U12_helix_I_partner",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#388.1/F:26-28",\n      "category": "snRNA feature",\n      "color": "#C91236",\n      "comment": "U6atac snRNA AGC catalytic triad: residues 26-28, reference-alignment, high confidence",\n      "family": "RNA",\n      "feature": "U6atac_AGC_catalytic_triad",\n      "group": "catalytic core regions",\n      "group_key": "catalytic_core_regions",\n      "kind": "rna_feature",\n      "label": "U6atac snRNA AGC catalytic triad",\n      "label_category_model_id": "388.2.4",\n      "label_default_visible": "",\n      "label_group_model_id": "388.2",\n      "label_model_id": "388.2.4.1",\n      "name": "Bact_7DVQ_U6atac_AGC_catalytic_triad",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#388.1/F:52-56,61-65",\n      "category": "snRNA feature",\n      "color": "#D61A3D",\n      "comment": "U6atac snRNA internal stem-loop: residues 52-56;61-65, reference-alignment, medium confidence",\n      "family": "RNA",\n      "feature": "U6atac_ISL",\n      "group": "internal stem loops",\n      "group_key": "internal_stem_loops",\n      "kind": "rna_feature",\n      "label": "U6atac snRNA internal stem-loop",\n      "label_category_model_id": "388.2.5",\n      "label_default_visible": "",\n      "label_group_model_id": "388.2",\n      "label_model_id": "388.2.5.1",\n      "name": "Bact_7DVQ_U6atac_ISL",\n      "section": "Named selections for resolved snRNA functional regions."\n    }\n  ],\n  "structure_group_id": "388",\n  "structure_model_id": "388.1"\n}'
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
