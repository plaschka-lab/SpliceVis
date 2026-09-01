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
_EMBEDDED_SPEC_JSON = '{\n  "pdb_id": "7aav",\n  "selectors": [\n    {\n      "atomspec": "#372.1/NB,NM,NW",\n      "category": "subcomplex",\n      "color": "#F4BF67",\n      "comment": "NTC/NTR related",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "NTC/NTR groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "NTC/NTR related",\n      "name": "pdb_7AAV_NTC_NTR_related",\n      "section": "Named selections for systematic-chain subcomplexes."\n    },\n    {\n      "atomspec": "#372.1/N2,N3,N5",\n      "category": "subcomplex",\n      "color": "#F4BF67",\n      "comment": "NTC/PRP19",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "NTC/NTR groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "NTC/PRP19",\n      "name": "pdb_7AAV_NTC_PRP19",\n      "section": "Named selections for systematic-chain subcomplexes."\n    },\n    {\n      "atomspec": "#372.1/M",\n      "category": "subcomplex",\n      "color": "#303030",\n      "comment": "RNA/substrate",\n      "family": "RNA",\n      "feature": "",\n      "group": "pre-mRNA features",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "RNA/substrate",\n      "name": "pdb_7AAV_RNA_substrate",\n      "section": "Named selections for systematic-chain subcomplexes."\n    },\n    {\n      "atomspec": "#372.1/C2",\n      "category": "subcomplex",\n      "color": "#9CA3AF",\n      "comment": "Second step factors",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "other protein/RNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "Second step factors",\n      "name": "pdb_7AAV_Second_step_factors",\n      "section": "Named selections for systematic-chain subcomplexes."\n    },\n    {\n      "atomspec": "#372.1/2",\n      "category": "subcomplex",\n      "color": "#2F8B4D",\n      "comment": "U2 snRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U2/SF3B groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U2 snRNP",\n      "name": "pdb_7AAV_U2_snRNP",\n      "section": "Named selections for systematic-chain subcomplexes."\n    },\n    {\n      "atomspec": "#372.1/5,5A,5C",\n      "category": "subcomplex",\n      "color": "#0000CD",\n      "comment": "U5 snRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U5 snRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U5 snRNP",\n      "name": "pdb_7AAV_U5_snRNP",\n      "section": "Named selections for systematic-chain subcomplexes."\n    },\n    {\n      "atomspec": "#372.1/6",\n      "category": "subcomplex",\n      "color": "#DC143C",\n      "comment": "U6 snRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U6 snRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U6 snRNP",\n      "name": "pdb_7AAV_U6_snRNP",\n      "section": "Named selections for systematic-chain subcomplexes."\n    },\n    {\n      "atomspec": "#372.1/XA7,XAP,XBM,XCD",\n      "category": "subcomplex",\n      "color": "#9CA3AF",\n      "comment": "other",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "other protein/RNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "other",\n      "name": "pdb_7AAV_other",\n      "section": "Named selections for systematic-chain subcomplexes."\n    },\n    {\n      "atomspec": "/D1,D2,D5,D6",\n      "category": "universal subcomplex",\n      "color": "#FF69B4",\n      "comment": "Disassembly factors",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "disassembly factors",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "Disassembly factors",\n      "name": "spliceosome_Disassembly_factors",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/J1,J2,J3,J4,J5",\n      "category": "universal subcomplex",\n      "color": "#EAA439",\n      "comment": "EJC/mRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "EJC/mRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "EJC/mRNP",\n      "name": "spliceosome_EJC_mRNP",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/NA,NB,NC,NF,NI,NL,NM,NP,NQ,NR,NW,NY",\n      "category": "universal subcomplex",\n      "color": "#F4BF67",\n      "comment": "NTC/NTR related",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "NTC/NTR groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "NTC/NTR related",\n      "name": "spliceosome_NTC_NTR_related",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/N1A,N1B,N1C,N1D,N2,N3,N4,N5",\n      "category": "universal subcomplex",\n      "color": "#F4BF67",\n      "comment": "NTC/PRP19",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "NTC/NTR groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "NTC/PRP19",\n      "name": "spliceosome_NTC_PRP19",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/RA,RC",\n      "category": "universal subcomplex",\n      "color": "#9CA3AF",\n      "comment": "RNA-binding",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "other protein/RNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "RNA-binding",\n      "name": "spliceosome_RNA_binding",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/I,IA,IB,IC,M,MA,MB,MC,MD",\n      "category": "universal subcomplex",\n      "color": "#303030",\n      "comment": "RNA/substrate",\n      "family": "RNA",\n      "feature": "",\n      "group": "pre-mRNA features",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "RNA/substrate",\n      "name": "spliceosome_RNA_substrate",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/RB",\n      "category": "universal subcomplex",\n      "color": "#9CA3AF",\n      "comment": "SR proteins",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "other protein/RNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "SR proteins",\n      "name": "spliceosome_SR_proteins",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/C1,C2,C3",\n      "category": "universal subcomplex",\n      "color": "#9CA3AF",\n      "comment": "Second step factors",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "other protein/RNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "Second step factors",\n      "name": "spliceosome_Second_step_factors",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/SA,SAA,SAB,SAC,SB,SBA,SBB,SC,SCA,SCB,SD,SDA,SDB,SE,SEA,SEB,SEC,SF,SFA,SFB,SFC,SG,SGA,SGB",\n      "category": "universal subcomplex",\n      "color": "#9CA3AF",\n      "comment": "Sm ring",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "other protein/RNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "Sm ring",\n      "name": "spliceosome_Sm_ring",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/1S1,1S1A,1S1B,1S1C,1S1D,1S2,1S2A,1S2B,1S2C,1S2D,1S3,1S3A,1S3B,1S3C,1S3D,1SB,1SBA,1SBB,1SBC,1SBD,1SE,1SEA,1SEB,1SEC,1SED,1SF,1SFA,1SFB,1SFC,1SFD,1SG,1SGA,1SGB,1SGC,1SGD",\n      "category": "universal subcomplex",\n      "color": "#B66AAE",\n      "comment": "U1 Sm ring",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U1 snRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U1 Sm ring",\n      "name": "spliceosome_U1_Sm_ring",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/1,1A,1AA,1AB,1AC,1AD,1B,1BA,1BB,1C,1CA,1CB,1CC,1CD,1D,1E,1G,1H,1I,1J,1K,1R1,1R2,1R3,1R4",\n      "category": "universal subcomplex",\n      "color": "#B66AAE",\n      "comment": "U1 snRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U1 snRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U1 snRNP",\n      "name": "spliceosome_U1_snRNP",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/11,12",\n      "category": "universal subcomplex",\n      "color": "#B66AAE",\n      "comment": "U11/U12 snRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U1 snRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U11/U12 snRNP",\n      "name": "spliceosome_U11_U12_snRNP",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/2S1,2S2,2S3,2SB,2SE,2SF,2SG",\n      "category": "universal subcomplex",\n      "color": "#BFE6BF",\n      "comment": "U2 Sm ring",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U2/SF3B groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U2 Sm ring",\n      "name": "spliceosome_U2_Sm_ring",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/2,2K,2KA,2KB,2L,2M,2N,2O,2P,2Q,2R",\n      "category": "universal subcomplex",\n      "color": "#2F8B4D",\n      "comment": "U2 snRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U2/SF3B groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U2 snRNP",\n      "name": "spliceosome_U2_snRNP",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/2A,2B,2C,2D,2E,2F,2FA,2FB,2G,2H,2I,2IA,2IB,2J,2JA,2JB",\n      "category": "universal subcomplex",\n      "color": "#6DBE70",\n      "comment": "U2/SF3B",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U2/SF3B groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U2/SF3B",\n      "name": "spliceosome_U2_SF3B",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/4S1,4S2,4S3,4SB,4SE,4SF,4SG",\n      "category": "universal subcomplex",\n      "color": "#F5E85A",\n      "comment": "U4 Sm ring",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U4 snRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U4 Sm ring",\n      "name": "spliceosome_U4_Sm_ring",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/4",\n      "category": "universal subcomplex",\n      "color": "#D8C800",\n      "comment": "U4 snRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U4 snRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U4 snRNP",\n      "name": "spliceosome_U4_snRNP",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/4A,4B,4BA,4BB,4C,4D,6A,6B,6C",\n      "category": "universal subcomplex",\n      "color": "#C3BA7A",\n      "comment": "U4/U6 snRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U4/U6 groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U4/U6 snRNP",\n      "name": "spliceosome_U4_U6_snRNP",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/4AT,6AT",\n      "category": "universal subcomplex",\n      "color": "#D8C800",\n      "comment": "U4atac/U6atac snRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U4/U6 groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U4atac/U6atac snRNP",\n      "name": "spliceosome_U4atac_U6atac_snRNP",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/5S1,5S2,5S3,5SB,5SE,5SF,5SG",\n      "category": "universal subcomplex",\n      "color": "#BFC3E8",\n      "comment": "U5 Sm ring",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U5 snRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U5 Sm ring",\n      "name": "spliceosome_U5_Sm_ring",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/5,5A,5B,5C,5D,5E,5F,5G,5H,5I",\n      "category": "universal subcomplex",\n      "color": "#0000CD",\n      "comment": "U5 snRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U5 snRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U5 snRNP",\n      "name": "spliceosome_U5_snRNP",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/6L2,6L3,6L4,6L5,6L6,6L7,6L8",\n      "category": "universal subcomplex",\n      "color": "#FECACA",\n      "comment": "U6 LSm",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U6 snRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U6 LSm",\n      "name": "spliceosome_U6_LSm",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/6,6R1,6R2",\n      "category": "universal subcomplex",\n      "color": "#DC143C",\n      "comment": "U6 snRNP",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "U6 snRNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "U6 snRNP",\n      "name": "spliceosome_U6_snRNP",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "/X0,X1,X2,X3,X4,X5,X6,X7,X8,X9A,X9B,XA,XA0,XA1,XA2,XA3,XA4,XA5,XA6,XA7,XA8,XA9,XAA,XAB,XAC,XAD,XAE,XAF,XAG,XAH,XAI,XAJ,XAK,XAL,XALA,XALB,XAM,XAN,XAO,XAP,XAQ,XAR,XAS,XAT,XAU,XAV,XAW,XAX,XAY,XAZ,XB,XB0,XB1,XB2,XB3,XB4,XB5,XB6,XB7,XB8,XB9,XBA,XBB,XBC,XBD,XBDA,XBDB,XBE,XBF,XBG,XBH,XBI,XBJ,XBK,XBL,XBM,XBN,XBO,XBP,XBQ,XBR,XBS,XBT,XBU,XBV,XBW,XBX,XBYA,XBYB,XBZ,XCA,XCB,XCC,XCD,XD,XEA,XEB,XF,XG,XH,XI,XJ,XK,XL,XM,XN,XO,XP,XQ,XR,XS,XT,XU,XV,XW,XX,XY,XZ",\n      "category": "universal subcomplex",\n      "color": "#9CA3AF",\n      "comment": "other",\n      "family": "Protein/RNP groups",\n      "feature": "",\n      "group": "other protein/RNP groups",\n      "group_key": "",\n      "kind": "subcomplex",\n      "label": "other",\n      "name": "spliceosome_other",\n      "section": "Model-independent named selections for all renamed systematic-chain models."\n    },\n    {\n      "atomspec": "#372.1/M:50-58",\n      "category": "substrate RNA feature",\n      "color": "#FF9D00",\n      "comment": "5\' exon: residues 50-58, splice-site-inference, medium confidence, validation not_applicable",\n      "family": "RNA",\n      "feature": "exon_5",\n      "group": "pre-mRNA features",\n      "group_key": "pre_mRNA_features",\n      "kind": "rna_feature",\n      "label": "5\' exon",\n      "label_category_model_id": "372.2.1",\n      "label_default_visible": "true",\n      "label_group_model_id": "372.2",\n      "label_model_id": "372.2.1.1",\n      "name": "pre_Bact_7AAV_5exon",\n      "section": "Named selections for resolved substrate RNA features."\n    },\n    {\n      "atomspec": "#372.1/M:59-64",\n      "category": "substrate RNA feature",\n      "color": "#303030",\n      "comment": "5\' splice site: residues 59-64, network-scored-motif, high confidence, validation validated",\n      "family": "RNA",\n      "feature": "five_prime_splice_site",\n      "group": "pre-mRNA features",\n      "group_key": "pre_mRNA_features",\n      "kind": "rna_feature",\n      "label": "5\' splice site",\n      "label_category_model_id": "372.2.1",\n      "label_default_visible": "true",\n      "label_group_model_id": "372.2",\n      "label_model_id": "372.2.1.2",\n      "name": "pre_Bact_7AAV_5SS",\n      "section": "Named selections for resolved substrate RNA features."\n    },\n    {\n      "atomspec": "#372.1/M:59-78",\n      "category": "substrate RNA feature",\n      "color": "#303030",\n      "comment": "intron: residues 59-78, splice-site-inference, medium confidence, validation not_applicable",\n      "family": "RNA",\n      "feature": "intron",\n      "group": "pre-mRNA features",\n      "group_key": "pre_mRNA_features",\n      "kind": "rna_feature",\n      "label": "intron",\n      "label_category_model_id": "372.2.1",\n      "label_default_visible": "true",\n      "label_group_model_id": "372.2",\n      "label_model_id": "372.2.1.3",\n      "name": "pre_Bact_7AAV_intron",\n      "section": "Named selections for resolved substrate RNA features."\n    },\n    {\n      "atomspec": "#372.1/2:26-28",\n      "category": "snRNA feature",\n      "color": "#047857",\n      "comment": "U2 snRNA U2/U6 helix I partner: residues 26-28, review-region, high confidence",\n      "family": "RNA",\n      "feature": "U2_U6_helix_I_partner",\n      "group": "snRNA-snRNA interacting regions",\n      "group_key": "snRNA_snRNA_regions",\n      "kind": "rna_feature",\n      "label": "U2 snRNA U2/U6 helix I partner",\n      "label_category_model_id": "372.2.2",\n      "label_default_visible": "",\n      "label_group_model_id": "372.2",\n      "label_model_id": "372.2.2.1",\n      "name": "pre_Bact_7AAV_U2_U6_helix_I_partner",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#372.1/5:38-42",\n      "category": "snRNA feature",\n      "color": "#1B3CD0",\n      "comment": "U5 snRNA loop I: residues 38-42, sequence-motif, medium confidence",\n      "family": "RNA",\n      "feature": "U5_loop_I",\n      "group": "snRNA-pre-mRNA regions",\n      "group_key": "snRNA_pre_mRNA_regions",\n      "kind": "rna_feature",\n      "label": "U5 snRNA loop I",\n      "label_category_model_id": "372.2.3",\n      "label_default_visible": "true",\n      "label_group_model_id": "372.2",\n      "label_model_id": "372.2.3.1",\n      "name": "pre_Bact_7AAV_U5_loop_I",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#372.1/6:1-30",\n      "category": "snRNA feature",\n      "color": "#DC143C",\n      "comment": "U6 snRNA 5\' terminal stem-loop: residues 1-30, reference-alignment, high confidence",\n      "family": "RNA",\n      "feature": "U6_5prime_terminal_stem_loop",\n      "group": "internal stem loops",\n      "group_key": "internal_stem_loops",\n      "kind": "rna_feature",\n      "label": "U6 snRNA 5\' terminal stem-loop",\n      "label_category_model_id": "372.2.4",\n      "label_default_visible": "",\n      "label_group_model_id": "372.2",\n      "label_model_id": "372.2.4.1",\n      "name": "pre_Bact_7AAV_U6_5_terminal_stem_loop",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#372.1/6:35-57,60",\n      "category": "snRNA feature",\n      "color": "#D0183C",\n      "comment": "U6 snRNA U2/U6 helix I partner: residues 35-57;60, motif-neighborhood, medium confidence",\n      "family": "RNA",\n      "feature": "U6_U2_helix_I_partner",\n      "group": "snRNA-snRNA interacting regions",\n      "group_key": "snRNA_snRNA_regions",\n      "kind": "rna_feature",\n      "label": "U6 snRNA U2/U6 helix I partner",\n      "label_category_model_id": "372.2.2",\n      "label_default_visible": "",\n      "label_group_model_id": "372.2",\n      "label_model_id": "372.2.2.2",\n      "name": "pre_Bact_7AAV_U6_U2_helix_I_partner",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#372.1/6:38-49",\n      "category": "snRNA feature",\n      "color": "#E01842",\n      "comment": "U6 snRNA 5\' splice-site upstream contact: residues 38-49, motif-neighborhood, medium confidence",\n      "family": "RNA",\n      "feature": "U6_5SS_upstream_contact",\n      "group": "other snRNA regions",\n      "group_key": "other_snRNA_regions",\n      "kind": "rna_feature",\n      "label": "U6 snRNA 5\' splice-site upstream contact",\n      "label_category_model_id": "372.2.3",\n      "label_default_visible": "true",\n      "label_group_model_id": "372.2",\n      "label_model_id": "372.2.3.2",\n      "name": "pre_Bact_7AAV_U6_5SS_upstream_contact",\n      "section": "Named selections for resolved snRNA functional regions."\n    },\n    {\n      "atomspec": "#372.1/6:41-47",\n      "category": "snRNA feature",\n      "color": "#DC143C",\n      "comment": "U6 snRNA ACAGAGA box: residues 41-47, sequence-motif, high confidence",\n      "family": "RNA",\n      "feature": "U6_ACAGAGA_box",\n      "group": "other snRNA regions",\n      "group_key": "other_snRNA_regions",\n      "kind": "rna_feature",\n      "label": "U6 snRNA ACAGAGA box",\n      "label_category_model_id": "372.2.5",\n      "label_default_visible": "",\n      "label_group_model_id": "372.2",\n      "label_model_id": "372.2.5.1",\n      "name": "pre_Bact_7AAV_U6_ACAGAGA_box",\n      "section": "Named selections for resolved snRNA functional regions."\n    }\n  ],\n  "structure_group_id": "372",\n  "structure_model_id": "372.1"\n}'
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
