import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'tools' / (name + '.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


class ReleaseTests(unittest.TestCase):
    def test_release_assets_and_biological_controls(self):
        self.assertEqual(module('validate_release').validate(ROOT), [])

    def test_entrypoint_is_built_from_source(self):
        self.assertTrue(module('build_ui').build(ROOT, check=True))

    def test_composite_and_html_helpers_are_localized(self):
        offline = module('setup_offline')
        text = 'open 6ah0 id #1\nopen ' + offline.RAW_GITHUB_PREFIX + 'scripts/rna_feature_label_models.py\nopen https://plaschka-lab.github.io/SpliceVis/rna_references/example.html?viewer=chimerax\n'
        result = offline.rewrite_script_text(text, Path('/tmp/local copy'), False)
        self.assertNotIn('https://', result)
        self.assertIn((Path('/tmp/local copy').resolve()/'rna_references/example.html').as_uri() + '?viewer=chimerax', result)
        self.assertIn('"' + str(Path('/tmp/local copy/pdb/6ah0.cif').resolve()) + '"', result)
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root/'scripts/composite').mkdir(parents=True)
            path = root/'scripts/composite/pair.cxc'
            path.write_text('open 8y7e id #1\n')
            self.assertIn(path, offline.script_paths(root))

    def test_offline_includes_reference_and_viewer_assets(self):
        self.assertTrue({'web', 'rna_references', 'assets'} <= set(module('setup_offline').COPIED_DIRS))


if __name__ == '__main__':
    unittest.main()
