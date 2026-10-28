import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class U11Structures(unittest.TestCase):
    def test_deposited_membership_and_substrate(self):
        records = {r['pdb_id']: r for r in json.loads((ROOT/'data/structures.json').read_text())['records']}
        expected = {'8r7n':('EMD-18984',13), '9gbw':('EMD-51223',14),
                    '9gbz':('EMD-51225',4), '9gc0':('EMD-51226',11),
                    '9gcl':('EMD-51233',10), '9gcm':('EMD-51234',4)}
        for pdb, (emdb, chains) in expected.items():
            with self.subTest(pdb=pdb):
                r = records[pdb]
                self.assertEqual(r['doi'], '10.1016/j.molcel.2024.12.017')
                self.assertEqual(r['state'], 'U11 snRNP')
                self.assertEqual(r['emdb_ids'], [emdb])
                self.assertEqual(r['chain_count'], chains)
                self.assertEqual(r['systematic_chain_count'], chains)
                self.assertEqual(bool(r['substrate_types']), pdb in {'9gbw','9gbz'})
                self.assertEqual(r['rna_2d']['status'], 'complete')
                for key in ['script_path','script_systematic_path','primary_map_script_path','primary_map_script_systematic_path']:
                    self.assertTrue((ROOT/r[key]).is_file())
                    script = (ROOT/r[key]).read_text()
                    self.assertNotRegex(script, r'#60[2-7]\.9\b')
                    self.assertNotIn('/Users/', script)
                selections = r['molstar_color_selections']
                self.assertEqual({s['auth_asym_id'] for s in selections},
                                 {c.strip() for x in r['proteins']+r['rnas'] for c in x['chains'].split(';')})
