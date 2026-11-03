const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const filename=fs.existsSync(path.join(root,'rna_references'))?path.join(root,'rna_references/8i0u_vs_minx_m3_324.modelled.html'):path.join(root,'../human_spliceosome_cryoem/rna_feature_exports_public/alignments/substrate_reference_pairwise/8i0u_vs_minx_m3_324.modelled.html');
const html=fs.readFileSync(filename,'utf8');
const data=JSON.parse(html.match(/<script id="alignmentData" type="application\/json">(.*?)<\/script>/s)[1]);
test('8I0U tooltip follows the annotated columns and excludes technical coordinates',()=>{
 const context=vm.createContext({data,escapeHtml:s=>s});
 for(const name of ['sequenceMarkup','numericAuth'])vm.runInContext(html.match(new RegExp('^function '+name+'\\([\\s\\S]*?(?=^function )','m'))[0],context);
 const result=vm.runInContext('sequenceMarkup(data.records[1],170,178)',context);
 assert.match(result,/Residue 112 · modelled\nFeatures: intron, polypyrimidine tract/);
 assert.match(result,/not modelled\nFeatures: intron, 3' splice site/);
 assert.doesNotMatch(result,/ title=|sequence position|alignment column|deposited chain/);
});
test('feature bars inherit the sequence scale and tooltip has no browser hover delay',()=>{
 assert.match(html,/\.feature-bar\{font:inherit;letter-spacing:inherit;/);
 assert.match(html,/role="tooltip" hidden/);
 assert.match(html,/document.addEventListener\("pointerover"/);
 assert.match(html,/info.hidden=false/);
});
