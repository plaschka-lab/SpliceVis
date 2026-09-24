import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class LeishmaniaCuration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / 'data/structures.json').read_text())
        cls.records = {r['pdb_id']: r for r in cls.data['records']}

    def test_states_composition_and_citation(self):
        for pdb, state, count in [('9if7', 'C*', 53), ('9if8', 'P', 49)]:
            r = self.records[pdb]
            self.assertEqual((r['state'], r['species_code'], r['protein_count'], r['rna_count']),
                             (state, 'LEITA', count, 6))
            self.assertEqual(r['doi'], '10.1038/s41467-026-77480-6')
            self.assertEqual(r['rna_2d']['status'], 'complete')
            self.assertTrue(all(p.get('annotation_source') for p in r['proteins']))
            self.assertFalse(any('UniProt cross-reference: 9IF' in p.get('annotation_note', '') for p in r['proteins']))
            self.assertTrue(any(p['chains'] == 'UX' and p['homolog_relationship'] == 'unidentified'
                                for p in r['proteins']))

    def test_analog_identity_is_not_collapsed_into_human_gene(self):
        r = self.records['9if7']
        proteins = {p['display_name']: p for p in r['proteins']}
        for name in ['PRC3', 'PRC5', 'RBP1', 'CWC21', 'Zn-knuckle']:
            self.assertIn('analog', proteins[name]['homolog_relationship'])
        self.assertEqual(proteins['LtaP16.0490'].get('homolog_target', ''), '')
        self.assertIn('DDX41', proteins['LtaP16.0490']['annotation_note'])
        for item in self.data['protein_lookup']:
            if item.get('color_key', '').startswith('LT_'):
                self.assertFalse(item['human_gene'])

    def test_sl_color_and_ligation_boundaries(self):
        for pdb in ['9if7', '9if8']:
            r = self.records[pdb]
            features = r['substrate_features']
            sl = next(f for f in features if f['original_chain_id'] == 'LE' and f['feature'] == 'exon_5')
            self.assertEqual((int(sl['seq_start']), int(sl['seq_end'])), (1, 39))
            outron = next(f for f in features if f['original_chain_id'] == 'LO' and f['feature'] == 'intron')
            self.assertEqual((int(outron['seq_start']), int(outron['seq_end'])), (1, 57))
            exon3 = next(f for f in features if f['feature'] == 'exon_3')
            self.assertEqual((exon3['original_chain_id'], int(exon3['seq_start'])),
                             ('RN', 45) if pdb == '9if7' else ('LE', 40))
            script = (ROOT / r['script_path']).read_text()
            self.assertIn('#FF9D00', script)
            self.assertIn('#C65D00', script)
            self.assertIn('#303030', script)
            svg = (ROOT / r['rna_2d']['svg']).read_text()
            self.assertIn('Linear sequence schematic', svg)


if __name__ == '__main__':
    unittest.main()
