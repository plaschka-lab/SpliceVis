import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def payload(path):
    return json.loads(re.search(r'<script id="alignmentData" type="application/json">(.*?)</script>',path.read_text(),re.S)[1])


class TransSplicingSequences(unittest.TestCase):
    def test_split_sl_sequence_and_chain_coordinates(self):
        records=json.loads((ROOT/'data/structures.json').read_text())['records']
        for pdb in ['9if7','9if8']:
            record=next(r for r in records if r['pdb_id']==pdb)
            views=record['rna_sequence_views']
            self.assertEqual(len(views),4)
            for view in views:
                for field in ['html','fasta','genbank']:
                    self.assertTrue((ROOT/view[field]).is_file())
            p=payload(ROOT/views[0]['html'])
            self.assertEqual(len(p['reference_sequence']),96)
            fs={f['feature']:f for f in p['features']}
            self.assertEqual((fs['exon_5']['start'],fs['exon_5']['end']),(1,39))
            self.assertEqual((fs['intron']['start'],fs['intron']['end']),(40,96))
            self.assertEqual(fs['exon_5']['color'],'#FF9D00')
            self.assertEqual(fs['intron']['color'],'#303030')
            exon=next(r for r in p['records'] if r['chain']=='LE')
            outron=next(r for r in p['records'] if r['chain']=='LO')
            self.assertEqual(exon['sequence'][39:],'-'*57)
            self.assertEqual(outron['sequence'][:39],'-'*39)
            self.assertEqual(outron['auth_positions'][39],'40')
            self.assertEqual(outron['auth_positions'][95],'96')
            self.assertEqual(outron['mask'][61:71],'.'*10)
            self.assertTrue(all(a is None for a in outron['auth_positions'][61:71]))

    def test_ligated_product_and_unspecified_modelled_bases(self):
        p=payload(ROOT/'rna_references/9if8_chain_LE.html')
        fs={f['feature']:f for f in p['features']}
        self.assertEqual((fs['exon_3']['start'],fs['exon_3']['end']),(40,63))
        m=next(r for r in p['records'] if r['chain']=='LE')
        self.assertEqual(m['sequence'][39:],'N'*24)
        self.assertEqual(m['mask'][39:41],'MM')
        p=payload(ROOT/'rna_references/9if7_chain_RN.html')
        fs={f['feature']:f for f in p['features']}
        self.assertEqual((fs['exon_3']['start'],fs['exon_3']['end']),(45,68))
        self.assertEqual(p['reference_sequence'][42:44],'AG')
