const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=fs.existsSync(path.join(__dirname,'../web/dashboard.js'))?path.resolve(__dirname,'..'):path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'web/dashboard.js'),'utf8');
function install(ctx,names){
  for(const name of names){
    const match=source.match(new RegExp(`^    (?:async )?function ${name}\\([\\s\\S]*?(?=^    (?:async )?function |^    let |^    window\\.)`,'m'));
    assert.ok(match,`missing ${name}`);vm.runInContext(match[0],ctx);
  }
}
const search=vm.createContext({STAGES:JSON.parse(source.match(/const STAGES = (\[[^;]+\]);/)[1])});
install(search,['normalizeSearch','matchesSearch','exactStageForQuery','parseStructureSearchClause','parseStructureSearch','matchesStructureSearch','fieldsFor']);

test('comma alternatives and combined state phrases remain exact, including starred states',()=>{
  for(const query of ['B, C','B complex, C complex']){
    for(const state of ['B','C','B*','C*','Bact','pre-B','B*D complex','A complex']){
      assert.equal(search.matchesStructureSearch(query,{state},'human spliceosome complex B C'),['B','C'].includes(state),`${query}/${state}`);
    }
  }
  assert.equal(search.matchesStructureSearch('human B complex',{state:'B'},'Homo sapiens spliceosome'),true);
  assert.equal(search.matchesStructureSearch('human B complex',{state:'Bact'},'Homo sapiens B complex'),false);
  assert.equal(search.matchesStructureSearch('human B*',{state:'B'},'human B*'),false);
  assert.equal(search.matchesStructureSearch('human B*',{state:'B*'},'human'),true);
  assert.equal(search.matchesStructureSearch('human B*D complex',{state:'B*D complex'},'human'),true);
  assert.equal(search.matchesStructureSearch('pre-B human',{state:'B'},'pre B human'),false);
  assert.equal(search.matchesStructureSearch('pre-B human',{state:'pre-B'},'human'),true);
  assert.equal(search.matchesStructureSearch('B C',{state:'B'},'B C'),false);
  assert.equal(search.matchesStructureSearch('human U5',{state:'C'},'human U5 snRNA'),true);
  assert.equal(search.matchesStructureSearch('a protein',{state:'C'},'a protein'),true);
  assert.equal(search.matchesStructureSearch('human A complex',{state:'A complex'},'human'),true);
});

test('actual local atlas B/C alternatives do not leak unrelated states',{skip:!fs.existsSync(path.join(root,'data/structures.json'))},()=>{
  const records=JSON.parse(fs.readFileSync(path.join(root,'data/structures.json'))).records;
  const actual=records.filter(r=>search.matchesStructureSearch('B, C',r,search.fieldsFor(r).all.join(' '))).map(r=>r.pdb_id).sort();
  const expected=records.filter(r=>['B','C'].includes(r.state)).map(r=>r.pdb_id).sort();
  assert.ok(expected.length);assert.deepEqual(actual,expected);
});

function setup(){
  const calls=[],status={textContent:''},controls=[{disabled:true,hasAttribute:()=>true}],ctx=vm.createContext({});
  let live=null,resolveLoad=null,resolveClear=null;
  const instance={visual:{reset:async()=>calls.push('camera-reset')},plugin:{canvas3d:{},dispose:()=>calls.push('disposed')}};
  Object.assign(ctx,{
    state:{selected:'a',molstarPdbId:'',molstarViewer:null},molstarLoadTask:null,molstarSelectionQueries:[],molstarSelectionIntent:0,molstarVisibilityOperation:null,
    molstarGeneration:0,molstarAbort:null,molstarPendingPdbId:'',
    document:{getElementById:id=>id==='molstarStatus'?status:null,querySelectorAll:q=>['[data-requires-selection]','.viewer-display-actions button'].includes(q)?controls:[]},
    currentMolstarViewerElement:()=>live,
    currentMolstarRecord:()=>({pdb_id:ctx.state.selected,rnas:[{chains:'A'}]}),
    clearMolstarLegendActive:()=>{},
    SpliceVisInteractions:{select:(_instance,q)=>calls.push(['select',q[0].auth_asym_id]),clear:()=>new Promise(resolve=>resolveClear=resolve)},
    loadMolstarForSelected:()=>{
      if(ctx.molstarLoadTask)return ctx.molstarLoadTask;
      ctx.disposeMolstar();
      ctx.molstarLoadTask=new Promise(resolve=>resolveLoad=()=>{
        live={viewerInstance:instance};ctx.state.molstarViewer=live;ctx.state.molstarPdbId=ctx.state.selected;ctx.molstarLoadTask=null;resolve();
      });
      return ctx.molstarLoadTask;
    }
  });
  install(ctx,['refreshMolstarVisibilityControls','prepareMolstarSelection','molstarSelectionIsCurrent','markMolstarSelection','selectMolstarFeature','selectMolstarFeatureFromButton','clearMolstarFeature','disposeMolstar','compactNumericRanges','focusMolstarAlignmentSelection']);
  return {ctx,calls,controls,status,finishLoad:()=>resolveLoad(),finishClear:()=>resolveClear(),instance};
}
const feature=chain=>({label:chain,chain,residue_ranges:'1',queries:[{auth_asym_id:chain,beg_auth_seq_id:1,end_auth_seq_id:1}]});

test('reset while loading cancels pending feature selection',async()=>{
  const t=setup();const pending=t.ctx.selectMolstarFeature(feature('A'));
  await t.ctx.clearMolstarFeature();t.finishLoad();await pending;
  assert.equal(t.calls.some(c=>Array.isArray(c)&&c[0]==='select'),false);
  assert.equal(t.ctx.molstarSelectionQueries.length,0);assert.equal(t.controls[0].disabled,true);
});

test('newest selection wins when multiple clicks share one model load',async()=>{
  const t=setup();const old=t.ctx.selectMolstarFeature(feature('A')),latest=t.ctx.selectMolstarFeature(feature('B'));
  t.finishLoad();await Promise.all([old,latest]);
  assert.deepEqual(t.calls.filter(Array.isArray),[['select','B']]);
  assert.equal(t.ctx.molstarSelectionQueries[0].auth_asym_id,'B');assert.equal(t.controls[0].disabled,false);
});

test('late reset completion cannot clear a newer selection or move its camera',async()=>{
  const t=setup();const first=t.ctx.selectMolstarFeature(feature('A'));t.finishLoad();await first;
  const reset=t.ctx.clearMolstarFeature();await t.ctx.selectMolstarFeature(feature('B'));t.finishClear();await reset;
  assert.equal(t.ctx.molstarSelectionQueries[0].auth_asym_id,'B');assert.equal(t.controls[0].disabled,false);
  assert.equal(t.calls.includes('camera-reset'),false);
});

test('model disposal invalidates pending intents even if selected PDB later matches',async()=>{
  const t=setup();const pending=t.ctx.selectMolstarFeature(feature('A'));t.ctx.disposeMolstar();t.finishLoad();await pending;
  assert.equal(t.calls.some(Array.isArray),false);
});

test('failed or stale feature selection cannot mark a same-index button in another list',async()=>{
  const t=setup();let toggles=0;const original=feature('A'),replacement=feature('B');
  let list={_molstarFeatures:[original],querySelectorAll:()=>[{dataset:{featureIndex:'0'},classList:{toggle:()=>toggles++,remove:()=>{}}}]};
  t.ctx.document.getElementById=id=>id==='molstarFeatureList'?list:t.status;
  const pending=t.ctx.selectMolstarFeatureFromButton({dataset:{featureIndex:'0'}});
  await t.ctx.clearMolstarFeature();toggles=0;list={...list,_molstarFeatures:[replacement]};t.finishLoad();await pending;
  assert.equal(toggles,0);
});

test('alignment payload rejects coercible non-integers and unknown chains before loading',async()=>{
  for(const residues of [[null],[true],['12'],[1.5],['12A'],[Infinity]]){
    const t=setup();await t.ctx.focusMolstarAlignmentSelection({pdb_id:'a',chain:'A',auth_residues:residues});assert.equal(t.ctx.molstarLoadTask,null);
  }
  const t=setup();await t.ctx.focusMolstarAlignmentSelection({pdb_id:'a',chain:'missing',auth_residues:[12]});assert.equal(t.ctx.molstarLoadTask,null);
});
