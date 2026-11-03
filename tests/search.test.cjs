const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=fs.existsSync(path.join(__dirname,'../web/dashboard.js'))?path.resolve(__dirname,'..'):path.resolve(__dirname,'../..');
const src=fs.readFileSync(path.join(root,'web/dashboard.js'),'utf8');
const ctx=vm.createContext({});
for(const name of ['normalizeSearch','matchesSearch','molstarLegendItems','exactStageForQuery','parseStructureSearchClause','parseStructureSearch','matchesStructureSearch','fieldsFor','substrateTypeOk','rnaFeatureOk','filtered']){
  vm.runInContext(src.match(new RegExp(`^    function ${name}\\([\\s\\S]*?(?=^    (?:async )?function )`,'m'))[0],ctx);
}
test('all terms required within comma-separated alternatives; trailing commas cannot match everything',()=>{
 assert.equal(ctx.matchesSearch('human PRPF8, yeast DHX15','Human with PRPF8'),true);
 assert.equal(ctx.matchesSearch('human PRPF8, yeast DHX15','Human DHX15'),false);
 assert.equal(ctx.matchesSearch('6id0,','6id1'),false);
 assert.equal(ctx.matchesSearch('  ,  ','anything'),true);
});
test('prime spellings, splice-site aliases and species names normalize consistently',()=>{
 for(const term of ["3′ splice site","3' splice-site","3SS","3 prime splice site"]){assert.equal(ctx.matchesSearch(term,"3' splice site"),true);}
 assert.equal(ctx.matchesSearch('human 3ss',"Homo sapiens, annotated 3' splice site"),true);
 assert.equal(ctx.matchesSearch('3ss',"5' splice site"),false);
});
test('protein legend sorts naturally and retains deposited chains and canonical colours',()=>{
 const items=ctx.molstarLegendItems({molstar_color_selections:[{label:'Z',auth_asym_id:'A',color:'#123456'},{label:'Prp8',auth_asym_id:'B',color:'#abcdef'},{label:'Prp8',auth_asym_id:'C',color:'#abcdef'}]});
 assert.equal(items[0].label,'Prp8');assert.equal(items[0].chains.join(','),'B,C');assert.equal(items[0].color,'#abcdef');
});
test('actual highest-resolution human 3-prime splice site exercise and alternative PDB search',{skip:!fs.existsSync(path.join(root,'data/structures.json'))},()=>{
 ctx.records=JSON.parse(fs.readFileSync(path.join(root,'data/structures.json'))).records;
 ctx.STAGES=[];ctx.ORDER={};ctx.state={structureQuery:'human 3′ splice site',mode:'component',family:'all',cyclePdbIds:[],species:'Human',substrateType:'all',rnaFeature:'feature:three_prime_splice_site',sortBy:'resolution',sortDir:'asc'};
 const hits=ctx.filtered();assert.ok(hits.length>0);
 assert.ok(hits.every(r=>r.species==='Human'&&r.substrate_features.some(f=>f.feature==='three_prime_splice_site')));
 assert.ok(hits.every((r,i)=>!i||Number(r.resolution)>=Number(hits[i-1].resolution)));
 console.log(`3′SS exercise: ${hits[0].pdb_id} (${hits[0].resolution} Å), ${hits.length} hits`);
 ctx.state={...ctx.state,structureQuery:'6ID0, 6ID1',mode:'all',species:'all',rnaFeature:'all'};
 assert.equal(ctx.filtered().map(r=>r.pdb_id).sort().join(','),'6id0,6id1');
});

test('resolution sort starts ascending in both UI entry points',()=>{
 assert.doesNotMatch(src,/\["year","chains","proteins","resolution"\]\.includes/);
});
