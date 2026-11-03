const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=fs.existsSync(path.join(__dirname,'../web/dashboard.js'))?path.resolve(__dirname,'..'):path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'web/dashboard.js'),'utf8');
function fixture(){
 const pending=new Map();
 const ctx=vm.createContext({Map,records:[],DATA:{proximity:{max_distance_a:8,available:true}},state:{proximityResults:[]},els:{proximityProtein:{value:'A'},proximityScope:{value:'whole'},proximityStart:{value:''},proximityEnd:{value:''},proximityDistance:{value:'8'},runProximitySearch:{disabled:false},proximityStatus:{textContent:''},downloadProximityCsv:{},copyProximityCxc:{disabled:false}}});
 ctx.proximityCatalogEntry=query=>query?{name:query}:null;
 ctx.loadProximityPayload=entry=>new Promise((resolve,reject)=>pending.set(entry.name,{resolve,reject}));
 ctx.proximityMatches=payload=>payload;
 ctx.proximityDisplayResults=()=>ctx.state.proximityResults;
 ctx.updateProximityResultPresentation=()=>{ctx.els.proximityStatus.textContent=ctx.state.proximityQuerySummary;};
 ctx.renderProximityResults=()=>{};
 ctx.proximityChimeraXScript=async()=>'open 6id0';
 ctx.copyText=async(text,button)=>{button.textContent='Copied';};
 vm.runInContext('let proximitySearchIntent=0;',ctx);
 for(const name of ['proximityRange','runProximitySearch','copyProximityChimeraX']){
  vm.runInContext(source.match(new RegExp(`^    (?:async )?function ${name}\\([\\s\\S]*?(?=^    (?:async )?function )`,'m'))[0],ctx);
 }
 return {ctx,pending};
}
test('latest proximity search wins when earlier coordinates finish later',async()=>{
 const {ctx,pending}=fixture();const first=ctx.runProximitySearch();
 ctx.els.proximityProtein.value='B';const latest=ctx.runProximitySearch();
 pending.get('B').resolve(['B']);await latest;
 pending.get('A').resolve(['A']);await first;
 assert.deepEqual(ctx.state.proximityResults,['B']);assert.match(ctx.els.proximityStatus.textContent,/^B whole protein/);assert.equal(ctx.els.runProximitySearch.disabled,false);
});
test('superseded failure and finally cannot clear results or enable a newer pending search',async()=>{
 const {ctx,pending}=fixture();const first=ctx.runProximitySearch();
 ctx.els.proximityProtein.value='B';const latest=ctx.runProximitySearch();
 pending.get('A').reject(new Error('Old request failed'));await first;
 assert.equal(ctx.els.runProximitySearch.disabled,true);assert.equal(ctx.els.proximityStatus.textContent,'Loading B proximity index...');
 pending.get('B').resolve(['B']);await latest;assert.deepEqual(ctx.state.proximityResults,['B']);
});
test('invalid newest input supersedes an older pending success and allows correction',async()=>{
 const {ctx,pending}=fixture();const first=ctx.runProximitySearch();
 ctx.els.proximityProtein.value='';await ctx.runProximitySearch();
 const validation=ctx.els.proximityStatus.textContent;
 pending.get('A').resolve(['A']);await first;
 assert.equal(ctx.state.proximityResults.length,0);assert.equal(ctx.els.proximityStatus.textContent,validation);assert.match(validation,/Choose one protein/);assert.equal(ctx.els.runProximitySearch.disabled,false);
});
test('invalid newest residue range also supersedes an older pending error',async()=>{
 const {ctx,pending}=fixture();const first=ctx.runProximitySearch();
 ctx.els.proximityScope.value='range';await ctx.runProximitySearch();
 const validation=ctx.els.proximityStatus.textContent;
 pending.get('A').reject(new Error('Old request failed'));await first;
 assert.equal(ctx.els.proximityStatus.textContent,validation);assert.match(validation,/integer residue numbers/);assert.equal(ctx.els.runProximitySearch.disabled,false);
});
test('a current failure clears stale results and disables their exports',async()=>{
 const {ctx,pending}=fixture();ctx.state.proximityResults=['old'];const run=ctx.runProximitySearch();
 pending.get('A').reject(new Error('Missing index'));await run;
 assert.equal(ctx.state.proximityResults.length,0);assert.match(ctx.els.proximityStatus.textContent,/Missing index/);assert.equal(ctx.els.downloadProximityCsv.disabled,true);assert.equal(ctx.els.copyProximityCxc.disabled,true);
});
test('script download and clipboard failures are reported and copy can be retried',async()=>{
 for(const failure of ['download','clipboard']){
  const {ctx}=fixture();ctx.state.proximityResults=['one'];
  if(failure==='download')ctx.proximityChimeraXScript=async()=>{throw new Error('Missing offline script');};
  else ctx.copyText=async()=>{throw new Error('Clipboard denied');};
  await ctx.copyProximityChimeraX();
  assert.match(ctx.els.proximityStatus.textContent,/Could not copy the ChimeraX script/);assert.equal(ctx.els.copyProximityCxc.disabled,false);
 }
});
test('copy completion follows current result availability when a search changes during copying',async()=>{
 const {ctx}=fixture();ctx.state.proximityResults=['one'];let finish;
 ctx.proximityChimeraXScript=()=>new Promise(resolve=>finish=resolve);
 const task=ctx.copyProximityChimeraX();assert.equal(ctx.els.copyProximityCxc.disabled,true);
 ctx.state.proximityResults=[];finish('open 6id0');await task;
 assert.equal(ctx.els.copyProximityCxc.disabled,true);
});
