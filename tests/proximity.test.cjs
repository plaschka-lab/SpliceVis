const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const root=fs.existsSync(path.join(__dirname,'../web/dashboard.js'))?path.resolve(__dirname,'..'):path.resolve(__dirname,'../..');
const src=fs.readFileSync(path.join(root,'web/dashboard.js'),'utf8'),ctx=vm.createContext({});
for(const name of ['proximityRange','proximityMatches'])vm.runInContext(src.match(new RegExp(`^    function ${name}\\([\\s\\S]*?(?=^    (?:async )?function )`,'m'))[0],ctx);
const row=(res,distance,target='SNRNP200')=>['A',String(res),res,12,target,'B',distance,'123',123];
const records=new Map([['6id0',{pdb_id:'6id0'}]]);
test('whole protein explicitly allows blank bounds; range requires both integer endpoints',()=>{
 assert.equal(ctx.proximityRange('whole','',''),null);
 for(const ends of [['',''],['12',''],['','12'],['1.2','8'],['x','2']])assert.throws(()=>ctx.proximityRange('range',...ends),/integer/);
 assert.equal(JSON.stringify(ctx.proximityRange('range','20','10')),JSON.stringify({start:10,end:20}));
});
test('closest per-target contact, cutoff, range and public-entry filtering',()=>{
 const payload={pdbs:[['6id0',[row(10,3),row(12,2),row(13,7,'PRPF6'),row(14,null,'bad'),row(15,-1,'bad')]],['private',[row(12,1)]]]};
 const whole=ctx.proximityMatches(payload,records,'PRPF8',null,8);
 assert.equal(whole.length,2);assert.equal(whole[0].min_distance_a,2);assert.equal(whole[0].query_scope,'whole protein');assert.equal(whole[0].query_start,'');
 const range=ctx.proximityMatches(payload,records,'PRPF8',{start:10,end:10},8);
 assert.equal(range.length,1);assert.equal(range[0].source_auth_seq,'10');assert.equal(range[0].query_scope,'residue range');
 assert.equal(ctx.proximityMatches(payload,records,'PRPF8',null,1).length,0);
});
test('whole search includes non-numeric author labels; residue ranges exclude them',()=>{
 const payload={pdbs:[['6id0',[row(null,2)]]]};
 assert.equal(ctx.proximityMatches(payload,records,'PRPF8',null,8).length,1);
 assert.equal(ctx.proximityMatches(payload,records,'PRPF8',{start:0,end:20},8).length,0);
});
