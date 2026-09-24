import json
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
class ChlamydomonasCuration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.r = next(r for r in json.loads((ROOT/'data/structures.json').read_text())['records'] if r['pdb_id']=='8xi2')
    def test_identity_and_deposition_conflicts(self):
        r=self.r
        self.assertEqual((r['state'],r['species_code'],r['protein_count'],r['rna_count']),('C*','CHLRE',26,5))
        self.assertEqual(r['chain_count'],34)
        self.assertEqual(r['systematic_chain_count'],34)
        self.assertEqual(r['doi'],'10.1038/s44318-024-00274-3')
        p={x['chains']:x for x in r['proteins']}
        self.assertEqual(p['C']['display_name'],'Snu114')
        self.assertEqual(p['M']['display_name'],'Syf2')
        self.assertEqual(p['S']['display_name'],'PPIL1')
        self.assertTrue(all(x.get('annotation_source') for x in p.values()))
    def test_rna_boundaries_and_assets(self):
        r=self.r
        self.assertEqual(r['rna_2d']['status'],'complete')
        self.assertFalse(any(x['feature']=='three_prime_splice_site' for x in r['substrate_features']))
        exon=next(x for x in r['substrate_features'] if x['feature']=='exon_5')
        self.assertEqual(exon['auth_residue_ranges'],'-7--1')
        motif=next(x for x in r['snrna_features'] if x['feature']=='U6_ACAGAGA_box')
        self.assertEqual(motif['feature_sequence'],'ACAGAGA')
        u=next(x for x in r['snrna_features'] if x['feature']=='U6_catalytic_U')
        self.assertEqual((u['feature_sequence'],int(u['seq_start'])),('U',67))
        self.assertIn('#FF9D00',(ROOT/r['script_path']).read_text())
