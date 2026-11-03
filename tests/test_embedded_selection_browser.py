"""Catch stale browser code in the files actually launched by public CXC scripts."""
import ast
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
MARKER = '# Embedded named-selection specification for remote execution from GitHub.\n'

class EmbeddedBrowserTests(unittest.TestCase):
    def test_downloaded_browsers_match_shared_helper(self):
        count = 0
        for folder in ('scripts', 'scripts_systematic', 'scripts_with_primary_maps', 'scripts_systematic_with_primary_maps'):
            helper = (ROOT / folder / 'named_selection_browser.py').read_text()
            expected = helper.split('\nif "session" in globals() and len(sys.argv) > 1:')[0].strip()
            for path in (ROOT / folder / 'selection_browser_scripts').glob('*.py'):
                with self.subTest(script=str(path.relative_to(ROOT))):
                    text = path.read_text()
                    self.assertEqual(text.split(MARKER, 1)[0].strip(), expected)
                    ast.parse(text)
                    self.assertIn('apply_ribbon_preset(session, spec, "detail", bound_model)', text)
                    self.assertIn('QPushButton("Overview", parent)', text)
                    self.assertIn('QPushButton("Reset view", parent)', text)
                    self.assertIn('open_selection_browser(session, _spec_path)', text)
                    count += 1
        self.assertGreater(count, 500)
