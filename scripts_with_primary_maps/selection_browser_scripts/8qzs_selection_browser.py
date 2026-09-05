#!/usr/bin/env python3
"""Open a small ChimeraX browser for generated named selections."""

from __future__ import annotations

import json
import sys

from chimerax.core.commands import run


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
            self.clear_button = QPushButton("Clear", parent)
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
            self.clear_button.clicked.connect(lambda: run(self.session, "select clear"))
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
            selector = data.get("name", "")
            if not selector:
                return
            run(self.session, "select clear")
            run(self.session, f"select {selector}")
            run(self.session, "view sel")

    tool_name = f"Spliceosome Selections {spec.get('pdb_id', '').upper()}".strip()
    SpliceosomeSelectionBrowser(session, tool_name, spec, selectors)
    session.logger.info(f"Opened spliceosome named selection browser with {len(selectors)} entries.")

# Embedded named-selection specification for remote execution from GitHub.
_EMBEDDED_SPEC_JSON = '{\n  "pdb_id": "8qzs",\n  "selectors": [\n    {\n      "atomspec": "#371.1/Z,z1,z2",\n      "category": "subcomplex",\n      "color": "#303030",\n      "comment": "RNA/substrate",\n      "family": "RNA",\n      "feature": "",\n      "group": "pre-mRNA features",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "RNA/substrate",\n      "name": "pdb_8QZS_RNA_substrate",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#371.1/2b,2e,2f,2g,21,22,23",\n      "category": "subcomplex",\n      "color": "#BFE6BF",\n      "comment": "U2 Sm ring",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U2/SF3B groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U2 Sm ring",\n      "name": "pdb_8QZS_U2_Sm_ring",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#371.1/2,2A,2B",\n      "category": "subcomplex",\n      "color": "#2F8B4D",\n      "comment": "U2 snRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U2/SF3B groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U2 snRNP",\n      "name": "pdb_8QZS_U2_snRNP",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#371.1/7,8,9,B1,B2,B3,B4,B5,B6,BP",\n      "category": "subcomplex",\n      "color": "#6DBE70",\n      "comment": "U2/SF3B",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U2/SF3B groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U2/SF3B",\n      "name": "pdb_8QZS_U2_SF3B",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#371.1/4b,4e,4f,4g,41,42,43",\n      "category": "subcomplex",\n      "color": "#F5E85A",\n      "comment": "U4 Sm ring",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U4 snRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U4 Sm ring",\n      "name": "pdb_8QZS_U4_Sm_ring",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#371.1/4",\n      "category": "subcomplex",\n      "color": "#D8C800",\n      "comment": "U4 snRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U4 snRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U4 snRNP",\n      "name": "pdb_8QZS_U4_snRNP",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#371.1/D,F,J,L,M,U",\n      "category": "subcomplex",\n      "color": "#C3BA7A",\n      "comment": "U4/U6 snRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U4/U6 groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U4/U6 snRNP",\n      "name": "pdb_8QZS_U4_U6_snRNP",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#371.1/5b,5e,5f,5g,51,52,53",\n      "category": "subcomplex",\n      "color": "#BFC3E8",\n      "comment": "U5 Sm ring",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U5 snRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U5 Sm ring",\n      "name": "pdb_8QZS_U5_Sm_ring",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#371.1/5,A,B,C,E,N,S",\n      "category": "subcomplex",\n      "color": "#0000CD",\n      "comment": "U5 snRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U5 snRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U5 snRNP",\n      "name": "pdb_8QZS_U5_snRNP",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#371.1/62,63,64,65,66,67,68",\n      "category": "subcomplex",\n      "color": "#FECACA",\n      "comment": "U6 LSm",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U6 snRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U6 LSm",\n      "name": "pdb_8QZS_U6_LSm",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#371.1/6",\n      "category": "subcomplex",\n      "color": "#DC143C",\n      "comment": "U6 snRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U6 snRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U6 snRNP",\n      "name": "pdb_8QZS_U6_snRNP",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#371.1/I,K,W,X,r,v,w,x,y",\n      "category": "subcomplex",\n      "color": "#9CA3AF",\n      "comment": "other",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "other protein/RNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "other",\n      "name": "pdb_8QZS_other",\n      "section": "Named selections for subcomplexes using original deposited chain IDs."\n    },\n    {\n      "atomspec": "#371.1/Z:29-43|#371.1/z1:1-8",\n      "category": "substrate RNA feature",\n      "color": "#303030",\n      "comment": "intron: residues 1-8; 29-43, five-ss-inference/manual-review-addition, high/low confidence, validation not_applicable/validated",\n      "family": "RNA",\n      "feature": "intron",\n      "group": "pre-mRNA features",\n      "group_key": "pre_mRNA_features",\n      "kind": "rna_feature",\n      "label": "intron",\n      "label_category_model_id": "371.2.1",\n      "label_default_visible": "true",\n      "label_group_model_id": "371.2",\n      "label_model_id": "371.2.1.1",\n      "name": "B_8QZS_intron",\n      "section": "Named selections for resolved substrate RNA features."\n    },\n    {\n      "atomspec": "#371.1/Z:35-43",\n      "category": "substrate RNA feature",\n      "color": "#303030",\n      "comment": "branch point region: residues 35-43, network-scored-motif, high confidence, validation validated",\n      "family": "RNA",\n      "feature": "branch_point_region",\n      "group": "pre-mRNA features",\n      "group_key": "pre_mRNA_features",\n      "kind": "rna_feature",\n      "label": "branch point region",\n      "label_category_model_id": "371.2.1",\n      "label_default_visible": "true",\n      "label_group_model_id": "371.2",\n      "label_model_id": "371.2.1.2",\n      "name": "B_8QZS_branch_region",\n      "section": "Named selections for resolved substrate RNA features."\n    },\n    {\n      "atomspec": "#371.1/Z:41",\n      "category": "substrate RNA feature",\n      "color": "#303030",\n      "comment": "branch point adenosine: residues 41, network-scored-motif, high confidence, validation validated",\n      "family": "RNA",\n      "feature": "branch_point_adenosine",\n      "group": "pre-mRNA features",\n      "group_key": "pre_mRNA_features",\n      "kind": "rna_feature",\n      "label": "branch point adenosine",\n      "label_category_model_id": "371.2.1",\n      "label_default_visible": "true",\n      "label_group_model_id": "371.2",\n      "label_model_id": "371.2.1.3",\n      "name": "B_8QZS_branch_A",\n      "section": "Named selections for resolved substrate RNA features."\n    },\n    {\n      "atomspec": "#371.1/z1:-3--1|#371.1/z2:-3--1",\n      "category": "substrate RNA feature",\n      "color": "#FF9D00",\n      "comment": "5\' exon: residues -3--1, five-ss-inference/manual-review-addition, high/medium confidence, validation not_applicable/validated",\n      "family": "RNA",\n      "feature": "exon_5",\n      "group": "pre-mRNA features",\n      "group_key": "pre_mRNA_features",\n      "kind": "rna_feature",\n      "label": "5\' exon",\n      "label_category_model_id": "371.2.1",\n      "label_default_visible": "true",\n      "label_group_model_id": "371.2",\n      "label_model_id": "371.2.1.4",\n      "name": "B_8QZS_5exon",\n      "section": "Named selections for resolved substrate RNA features."\n    },\n    {\n      "atomspec": "#371.1/z1:1-6",\n      "category": "substrate RNA feature",\n      "color": "#303030",\n      "comment": "5\' splice site: residues 1-6, network-scored-motif, high confidence, validation validated",\n      "family": "RNA",\n      "feature": "five_prime_splice_site",\n      "group": "pre-mRNA features",\n      "group_key": "pre_mRNA_features",\n      "kind": "rna_feature",\n      "label": "5\' splice site",\n      "label_category_model_id": "371.2.1",\n      "label_default_visible": "true",\n      "label_group_model_id": "371.2",\n      "label_model_id": "371.2.1.5",\n      "name": "B_8QZS_5SS",\n      "section": "Named selections for resolved substrate RNA features."\n    },\n    {\n      "atomspec": "#371.1/2:29-30",\n      "category": "snRNA feature",\n      "color": "#047857",\n      "comment": "U2 snRNA U2/U6 helix I partner: residues 29-30, review-region, high confidence",\n      "family": "RNA",\n      "feature": "U2_U6_helix_I_partner",\n      "group": "snRNA-snRNA interacting regions",\n      "group_key": "snRNA_snRNA_regions",\n      "kind": "rna_feature",\n      "label": "U2 snRNA U2/U6 helix I partner",\n      "label_category_model_id": "371.2.2",\n      "label_default_visible": "",\n      "label_group_model_id": "371.2",\n      "label_model_id": "371.2.2.1",\n      "name": "B_8QZS_U2_U6_helix_I_partner",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#371.1/2:32-41",\n      "category": "snRNA feature",\n      "color": "#0B6E2D",\n      "comment": "U2 snRNA branchpoint pairing region: residues 32-41, sequence-motif-neighborhood, medium confidence",\n      "family": "RNA",\n      "feature": "U2_branchpoint_pairing_region",\n      "group": "snRNA-pre-mRNA regions",\n      "group_key": "snRNA_pre_mRNA_regions",\n      "kind": "rna_feature",\n      "label": "U2 snRNA branchpoint pairing region",\n      "label_category_model_id": "371.2.3",\n      "label_default_visible": "true",\n      "label_group_model_id": "371.2",\n      "label_model_id": "371.2.3.1",\n      "name": "B_8QZS_U2_branchpoint_pairing_region",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#371.1/2:46-65",\n      "category": "snRNA feature",\n      "color": "#167A38",\n      "comment": "U2 snRNA stem IIa: residues 46-65, review-region, low confidence",\n      "family": "RNA",\n      "feature": "U2_stem_IIa",\n      "group": "internal stem loops",\n      "group_key": "internal_stem_loops",\n      "kind": "rna_feature",\n      "label": "U2 snRNA stem IIa",\n      "label_category_model_id": "371.2.4",\n      "label_default_visible": "",\n      "label_group_model_id": "371.2",\n      "label_model_id": "371.2.4.1",\n      "name": "B_8QZS_U2_stem_IIa",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#371.1/2:99-105",\n      "category": "snRNA feature",\n      "color": "#2F8B4D",\n      "comment": "U2 snRNA Sm site: residues 99-105, sequence-motif, medium confidence",\n      "family": "RNA",\n      "feature": "U2_Sm_site",\n      "group": "other snRNA regions",\n      "group_key": "other_snRNA_regions",\n      "kind": "rna_feature",\n      "label": "U2 snRNA Sm site",\n      "name": "B_8QZS_U2_Sm_site",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#371.1/4:1-18",\n      "category": "snRNA feature",\n      "color": "#E0CF1A",\n      "comment": "U4 snRNA U4/U6 stem II partner: residues 1-18, reference-alignment, high confidence",\n      "family": "RNA",\n      "feature": "U4_U6_stem_II_partner",\n      "group": "snRNA-snRNA interacting regions",\n      "group_key": "snRNA_snRNA_regions",\n      "kind": "rna_feature",\n      "label": "U4 snRNA U4/U6 stem II partner",\n      "label_category_model_id": "371.2.2",\n      "label_default_visible": "",\n      "label_group_model_id": "371.2",\n      "label_model_id": "371.2.2.2",\n      "name": "B_8QZS_U4_U6_stem_II_partner",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#371.1/4:56-63",\n      "category": "snRNA feature",\n      "color": "#D8C800",\n      "comment": "U4 snRNA U4/U6 stem I partner: residues 56-63, reference-alignment, high confidence",\n      "family": "RNA",\n      "feature": "U4_U6_stem_I_partner",\n      "group": "snRNA-snRNA interacting regions",\n      "group_key": "snRNA_snRNA_regions",\n      "kind": "rna_feature",\n      "label": "U4 snRNA U4/U6 stem I partner",\n      "label_category_model_id": "371.2.2",\n      "label_default_visible": "",\n      "label_group_model_id": "371.2",\n      "label_model_id": "371.2.2.3",\n      "name": "B_8QZS_U4_U6_stem_I_partner",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#371.1/4:60-63,68-95",\n      "category": "snRNA feature",\n      "color": "#F0DF2E",\n      "comment": "U4 snRNA Brr2 loading region: residues 60-63;68-95, reference-alignment, medium confidence",\n      "family": "RNA",\n      "feature": "U4_Brr2_loading_region",\n      "group": "other snRNA regions",\n      "group_key": "other_snRNA_regions",\n      "kind": "rna_feature",\n      "label": "U4 snRNA Brr2 loading region",\n      "label_category_model_id": "371.2.5",\n      "label_default_visible": "",\n      "label_group_model_id": "371.2",\n      "label_model_id": "371.2.5.1",\n      "name": "B_8QZS_U4_Brr2_loading_region",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#371.1/4:119-125",\n      "category": "snRNA feature",\n      "color": "#F5E85A",\n      "comment": "U4 snRNA Sm site: residues 119-125, sequence-motif, medium confidence",\n      "family": "RNA",\n      "feature": "U4_Sm_site",\n      "group": "other snRNA regions",\n      "group_key": "other_snRNA_regions",\n      "kind": "rna_feature",\n      "label": "U4 snRNA Sm site",\n      "name": "B_8QZS_U4_Sm_site",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#371.1/5:38-42",\n      "category": "snRNA feature",\n      "color": "#1B3CD0",\n      "comment": "U5 snRNA loop I: residues 38-42, sequence-motif, medium confidence",\n      "family": "RNA",\n      "feature": "U5_loop_I",\n      "group": "snRNA-pre-mRNA regions",\n      "group_key": "snRNA_pre_mRNA_regions",\n      "kind": "rna_feature",\n      "label": "U5 snRNA loop I",\n      "label_category_model_id": "371.2.3",\n      "label_default_visible": "true",\n      "label_group_model_id": "371.2",\n      "label_model_id": "371.2.3.2",\n      "name": "B_8QZS_U5_loop_I",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#371.1/6:36-60",\n      "category": "snRNA feature",\n      "color": "#D0183C",\n      "comment": "U6 snRNA U2/U6 helix I partner: residues 36-60, motif-neighborhood, medium confidence",\n      "family": "RNA",\n      "feature": "U6_U2_helix_I_partner",\n      "group": "snRNA-snRNA interacting regions",\n      "group_key": "snRNA_snRNA_regions",\n      "kind": "rna_feature",\n      "label": "U6 snRNA U2/U6 helix I partner",\n      "label_category_model_id": "371.2.2",\n      "label_default_visible": "",\n      "label_group_model_id": "371.2",\n      "label_model_id": "371.2.2.4",\n      "name": "B_8QZS_U6_U2_helix_I_partner",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#371.1/6:38-49",\n      "category": "snRNA feature",\n      "color": "#E01842",\n      "comment": "U6 snRNA 5\' splice-site upstream contact: residues 38-49, motif-neighborhood, medium confidence",\n      "family": "RNA",\n      "feature": "U6_5SS_upstream_contact",\n      "group": "other snRNA regions",\n      "group_key": "other_snRNA_regions",\n      "kind": "rna_feature",\n      "label": "U6 snRNA 5\' splice-site upstream contact",\n      "label_category_model_id": "371.2.3",\n      "label_default_visible": "true",\n      "label_group_model_id": "371.2",\n      "label_model_id": "371.2.3.3",\n      "name": "B_8QZS_U6_5SS_upstream_contact",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#371.1/6:41-47",\n      "category": "snRNA feature",\n      "color": "#DC143C",\n      "comment": "U6 snRNA ACAGAGA box: residues 41-47, sequence-motif, high confidence",\n      "family": "RNA",\n      "feature": "U6_ACAGAGA_box",\n      "group": "other snRNA regions",\n      "group_key": "other_snRNA_regions",\n      "kind": "rna_feature",\n      "label": "U6 snRNA ACAGAGA box",\n      "label_category_model_id": "371.2.5",\n      "label_default_visible": "",\n      "label_group_model_id": "371.2",\n      "label_model_id": "371.2.5.2",\n      "name": "B_8QZS_U6_ACAGAGA_box",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#371.1/6:52-61",\n      "category": "snRNA feature",\n      "color": "#D9183E",\n      "comment": "U6 snRNA U4/U6 stem I partner: residues 52-61, reference-alignment, high confidence",\n      "family": "RNA",\n      "feature": "U6_U4_stem_I_partner",\n      "group": "other snRNA regions",\n      "group_key": "other_snRNA_regions",\n      "kind": "rna_feature",\n      "label": "U6 snRNA U4/U6 stem I partner",\n      "label_category_model_id": "371.2.5",\n      "label_default_visible": "",\n      "label_group_model_id": "371.2",\n      "label_model_id": "371.2.5.3",\n      "name": "B_8QZS_U6_U4_stem_I_partner",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#371.1/6:53-55",\n      "category": "snRNA feature",\n      "color": "#C91236",\n      "comment": "U6 snRNA AGC catalytic triad: residues 53-55, reference-alignment, high confidence",\n      "family": "RNA",\n      "feature": "U6_AGC_catalytic_triad",\n      "group": "catalytic core regions",\n      "group_key": "catalytic_core_regions",\n      "kind": "rna_feature",\n      "label": "U6 snRNA AGC catalytic triad",\n      "label_category_model_id": "371.2.6",\n      "label_default_visible": "",\n      "label_group_model_id": "371.2",\n      "label_model_id": "371.2.6.1",\n      "name": "B_8QZS_U6_AGC_catalytic_triad",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#371.1/6:56-78",\n      "category": "snRNA feature",\n      "color": "#D61A3D",\n      "comment": "U6 snRNA internal stem-loop core: residues 56-78, reference-alignment, medium confidence",\n      "family": "RNA",\n      "feature": "U6_ISL",\n      "group": "internal stem loops",\n      "group_key": "internal_stem_loops",\n      "kind": "rna_feature",\n      "label": "U6 snRNA internal stem-loop core",\n      "label_category_model_id": "371.2.4",\n      "label_default_visible": "",\n      "label_group_model_id": "371.2",\n      "label_model_id": "371.2.4.2",\n      "name": "B_8QZS_U6_ISL",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#371.1/6:63-74",\n      "category": "snRNA feature",\n      "color": "#E01842",\n      "comment": "U6 snRNA U4/U6 stem II partner: residues 63-74, reference-alignment, high confidence",\n      "family": "RNA",\n      "feature": "U6_U4_stem_II_partner",\n      "group": "other snRNA regions",\n      "group_key": "other_snRNA_regions",\n      "kind": "rna_feature",\n      "label": "U6 snRNA U4/U6 stem II partner",\n      "label_category_model_id": "371.2.5",\n      "label_default_visible": "",\n      "label_group_model_id": "371.2",\n      "label_model_id": "371.2.5.4",\n      "name": "B_8QZS_U6_U4_stem_II_partner",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#371.1/6:102-105",\n      "category": "snRNA feature",\n      "color": "#E33A55",\n      "comment": "U6 snRNA LSm site: residues 102-105, terminal-region, low confidence",\n      "family": "RNA",\n      "feature": "U6_LSm_site",\n      "group": "other snRNA regions",\n      "group_key": "other_snRNA_regions",\n      "kind": "rna_feature",\n      "label": "U6 snRNA LSm site",\n      "name": "B_8QZS_U6_LSm_site",\n      "section": "Named selections for resolved snRNA functional regions."\n    }\n  ],\n  "structure_group_id": "371",\n  "structure_model_id": "371.1"\n}'
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
