import json
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[1]
class TerminationPublication(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.records={r['pdb_id']:r for r in json.loads((ROOT/'data/structures.json').read_text())['records']}
    def test_published_metadata_and_map_links(self):
        for pdb,emdb,empiar in [('9s2e','EMD-54493','EMPIAR-14002'),('9s2f','EMD-54494','EMPIAR-14001')]:
            r=self.records[pdb]
            self.assertEqual((r['paper_title'],r['doi'],r['pubmed_id'],r['journal'],str(r['year'])),('Mechanism of spliceosome termination','10.1038/s41586-026-11101-6','42844479','Nature','2026'))
            self.assertIn(emdb,r['emdb_ids']);self.assertEqual(r['empiar_id'],empiar)
            self.assertIn('Faraway R',r['authors']);self.assertIn('Plaschka C',r['authors'])
            self.assertIn('DHX35',r['abstract'])
            self.assertIn('doi:10.1038/s41586-026-11101-6',r['substrate_types'][0]['evidence'])
    def test_gcfc2_is_paralog_with_preserved_color(self):
        protein=next(p for p in self.records['9s2e']['proteins'] if p['chains']=='GC')
        self.assertEqual((protein['gene'],protein['display_name'],protein['color_hex']),('GCFC2','GCFC2','#FFC0CB'))
        self.assertEqual(protein['homolog_relationship'],'human paralog')
