"""Release-level invariants for the data shipped to the comparison viewer."""
import json
import math
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class ComparisonReleaseTests(unittest.TestCase):
    def test_fits_only_reference_public_entries_and_valid_coordinate_frames(self):
        records = json.loads((ROOT / 'data/structures.json').read_text())['records']
        ids = {r['pdb_id'] for r in records}
        manifest = json.loads((ROOT / 'data/comparison-alignments.json').read_text())
        self.assertEqual(set(manifest['entries']), ids)
        self.assertEqual(len(manifest['pairs']), len(ids) * (len(ids)-1) // 2)
        self.assertLessEqual(set(manifest['probes']), ids)
        for key, pair in manifest['pairs'].items():
            self.assertEqual(set(key.split(':')), {pair['reference'], pair['mobile']})
            self.assertTrue({pair['reference'], pair['mobile']} <= ids)
            if not pair['supported']:
                self.assertTrue(pair.get('reason'))
                continue
            matrix = pair['matrix']
            self.assertEqual(len(matrix), 16)
            self.assertTrue(all(math.isfinite(n) for n in matrix))
            self.assertEqual([matrix[i] for i in (3,7,11,15)], [0,0,0,1])
            self.assertGreaterEqual(pair['fit_residues'], 100)
            self.assertLessEqual(pair['fit_residues'], pair['matched_residues'])
            self.assertGreaterEqual(pair['rmsd'], 0)
            for entry in (pair['reference'], pair['mobile']):
                self.assertTrue(manifest['probes'].get(entry))

if __name__ == '__main__':
    unittest.main()
