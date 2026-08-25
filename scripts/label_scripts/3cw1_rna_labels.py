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
_EMBEDDED_SPEC_JSON = '{\n  "background": "none",\n  "cleanup_model_ids": [\n    "301.1.90"\n  ],\n  "default_visible_category_keys": [\n    "pre_mRNA_features",\n    "snRNA_pre_mRNA_regions"\n  ],\n  "default_visible_category_names": [\n    "pre-mRNA features",\n    "snRNA-pre-mRNA regions"\n  ],\n  "height": 3.35,\n  "label_group_model_id": "301.2",\n  "label_group_name": "RNA_feature_labels",\n  "labels": [\n    {\n      "atomspec": "#301.1/V:6",\n      "category_key": "snRNA_pre_mRNA_regions",\n      "category_model_id": "301.2.1",\n      "category_name": "snRNA-pre-mRNA regions",\n      "color": "#B66AAE",\n      "default_visible": true,\n      "feature": "U1_5prime_5SS_recognition",\n      "index": 1,\n      "label_model_id": "301.2.1.1",\n      "model_name": "label_01_U1_5_SS_recog_res_1_10_201_210_401_410_601_610",\n      "selector_name": "U1_snRNP_3CW1_U1_5_5SS_recognition",\n      "text": "U1 5\'SS recog. (res. 1-10;201-210;401-410;601-610)"\n    },\n    {\n      "atomspec": "#301.1/V:28",\n      "category_key": "internal_stem_loops",\n      "category_model_id": "301.2.2",\n      "category_name": "internal stem loops",\n      "color": "#BF72B7",\n      "default_visible": false,\n      "feature": "U1_SL1",\n      "index": 2,\n      "label_model_id": "301.2.2.1",\n      "model_name": "label_02_U1_SL1_res_11_45_211_245_411_445_611_645",\n      "selector_name": "U1_snRNP_3CW1_U1_SL1",\n      "text": "U1 SL1 (res. 11-45;211-245;411-445;611-645)"\n    },\n    {\n      "atomspec": "#301.1/V:46",\n      "category_key": "internal_stem_loops",\n      "category_model_id": "301.2.2",\n      "category_name": "internal stem loops",\n      "color": "#AD62A6",\n      "default_visible": false,\n      "feature": "U1_SL2",\n      "index": 3,\n      "label_model_id": "301.2.2.2",\n      "model_name": "label_03_U1_SL2_res_246_247_248_249_250_251_252_253_254_255_256_283_284_285_286_287_288_289_290_291_292_293_294_295_296_297_298_299_300_301_302_303_304_305_306_307_308_309_310_311_312_313_314_315_316_317_318_319_320_321_446_447_448_449_450_451_452_453_454_455_456_483_484_485_486_487_488_489_490_491_492_493_494_495_496_497_498_499_500_501_502_503_504_505_506_507_508_509_510_511_512_513_514_515_516_517_518_519_520_521_46_47_48_49_50_51_52_53_54_55_56_83_84_85_86_87_88_89_90_91_92_93_94_95_96_97_98_99_100_101_102_103_104_105_106_107_108_109_110_111_112_113_114_115_116_117_118_119_120_121_646_647_648_649_650_651_652_653_654_655_656_683_684_685_686_687_688_689_690_691_692_693_694_695_696_697_698_699_700_701_702_703_704_705_706_707_708_709_710_711_712_713_714_715_716_717_718_719_720_721",\n      "selector_name": "U1_snRNP_3CW1_U1_SL2",\n      "text": "U1 SL2 (res. 246,247,248,249,250,251,252,253,254,255,256,283,284,285,286,287,288,289,290,291,292,293,294,295,296,297,298,299,300,301,302,303,304,305,306,307,308,309,310,311,312,313,314,315,316,317,318,319,320,321;446,447,448,449,450,451,452,453,454,455,456,483,484,485,486,487,488,489,490,491,492,493,494,495,496,497,498,499,500,501,502,503,504,505,506,507,508,509,510,511,512,513,514,515,516,517,518,519,520,521;46,47,48,49,50,51,52,53,54,55,56,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121;646,647,648,649,650,651,652,653,654,655,656,683,684,685,686,687,688,689,690,691,692,693,694,695,696,697,698,699,700,701,702,703,704,705,706,707,708,709,710,711,712,713,714,715,716,717,718,719,720,721)"\n    }\n  ],\n  "outline_color": "#ffffff",\n  "outline_offsets": [\n    [\n      -0.085,\n      0,\n      0\n    ],\n    [\n      0.085,\n      0,\n      0\n    ],\n    [\n      0,\n      -0.085,\n      0\n    ],\n    [\n      0,\n      0.085,\n      0\n    ],\n    [\n      -0.06,\n      -0.06,\n      0\n    ],\n    [\n      -0.06,\n      0.06,\n      0\n    ],\n    [\n      0.06,\n      -0.06,\n      0\n    ],\n    [\n      0.06,\n      0.06,\n      0\n    ],\n    [\n      -0.052,\n      0,\n      0\n    ],\n    [\n      0.052,\n      0,\n      0\n    ],\n    [\n      0,\n      -0.052,\n      0\n    ],\n    [\n      0,\n      0.052,\n      0\n    ],\n    [\n      -0.037,\n      -0.037,\n      0\n    ],\n    [\n      -0.037,\n      0.037,\n      0\n    ],\n    [\n      0.037,\n      -0.037,\n      0\n    ],\n    [\n      0.037,\n      0.037,\n      0\n    ]\n  ],\n  "size": 144,\n  "structure_model_id": "301.1"\n}'
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
