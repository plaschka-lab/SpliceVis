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
function setup(){
  const calls=[],timers=[],frames=[],status={textContent:''};
  let width=600,open=true,viewer=null,observer;
  const section={addEventListener:(name,fn)=>section[name]=fn};
  const target={isConnected:true,getBoundingClientRect:()=>({width,height:400}),getClientRects:()=>width?[{}]:[],
    closest:q=>q==='details'?section:!open?section:null,querySelector:()=>viewer,addEventListener(){},appendChild:v=>viewer=v};
  const ctx=vm.createContext({state:{activeTab:'structures',selected:'a',molstarViewer:null,molstarPdbId:'',mobilePane:'detail'},records:[{pdb_id:'a'}],els:{},DATA:{},
    molstarSelectionIntent:0,molstarSelectionQueries:[],molstarVisibilityOperation:null,refreshMolstarProteinSelection:()=>{},molstarProteinSelection:new Set(),molstarVisibilityObserver:null,
    molstarGeneration:0,molstarAbort:null,molstarLoadTask:null,molstarPendingPdbId:'',molstarAutoPreviewEnabled:true,
    AbortController,requestAnimationFrame:fn=>frames.push(fn),fitCycleArt:()=>{},
    window:{setTimeout:fn=>timers.push(fn),dispatchEvent:()=>calls.push('global resize')},
    document:{getElementById:id=>id==='molstarViewer'?target:status,querySelectorAll:()=>[],
      createElement:()=>({style:{},remove(){viewer=null;}}),
      body:{classList:{remove(){},add(name){width=name==='mobile-pane-detail'?600:0;}}}},
    ResizeObserver:class{constructor(fn){observer=this;this.fn=fn;}observe(t){this.target=t;}disconnect(){calls.push('disconnect');}},
    refreshMolstarVisibilityControls:()=>{},renderMolstarFeatureButtons:()=>calls.push('buttons'),
    applyMolstarIllustrativeStyle:async()=>{},applyMolstarColors:async()=>{},SpliceVisInteractions:{setDepthCue(){}},
    PDBeMolstarPlugin:class{constructor(){calls.push('construct');this.plugin={dispose:()=>calls.push('dispose')};}},
    SpliceVisViewer:{load:async()=>calls.push('load')},waitForMolstarComponent:async()=>{},esc:v=>v
  });
  install(ctx,['molstarTargetIsVisible','reconcileMolstarVisibility','observeMolstarVisibility','disposeMolstar','autoLoadMolstarForSelected','loadMolstarForSelected','setMobilePane']);
  const loaded=()=>{viewer={viewerInstance:{plugin:{dispose:()=>calls.push('dispose')}},remove(){viewer=null;}};ctx.state.molstarViewer=viewer;ctx.state.molstarPdbId='a';};
  return {ctx,calls,target,section,loaded,hide:()=>width=0,show:()=>width=600,close:()=>open=false,open:()=>open=true,
    observe:()=>observer.fn(),flush:()=>{while(timers.length)timers.shift()();while(frames.length)frames.shift()();}};
}
test('mobile hide disposes before resize; reopen reloads once and unchanged visibility retains viewer',async()=>{
  const t=setup();t.loaded();t.ctx.setMobilePane('cycle');t.flush();assert.deepEqual(t.calls,['dispose']);
  t.ctx.setMobilePane('detail');t.flush();await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert.equal(t.calls.filter(x=>x==='load').length,1);
  t.ctx.reconcileMolstarVisibility();t.flush();assert.equal(t.calls.filter(x=>x==='dispose').length,1);
  assert.ok(!t.calls.includes('global resize'));
});
test('closed Interactive 3D stops viewer despite a measurable child; reopening is observed',()=>{
  const t=setup();t.loaded();t.ctx.observeMolstarVisibility();t.close();t.section.toggle();assert.deepEqual(t.calls,['dispose']);
  t.open();t.observe();t.flush();assert.equal(t.ctx.molstarPendingPdbId,'a');
});
test('viewport/container collapse disposes; repeated hidden callbacks do not dispose again',()=>{
  const t=setup();t.loaded();t.ctx.observeMolstarVisibility();t.hide();t.observe();t.observe();assert.deepEqual(t.calls,['dispose']);
  t.show();t.ctx.state.activeTab='proteins';t.ctx.reconcileMolstarVisibility();t.flush();assert.equal(t.ctx.molstarPendingPdbId,'');
});
test('hide during bundled-library wait cancels creation, even if immediately shown again',async()=>{
  const t=setup();let ready;t.ctx.waitForMolstarComponent=()=>new Promise(resolve=>ready=resolve);
  const task=t.ctx.loadMolstarForSelected();t.hide();t.ctx.reconcileMolstarVisibility();t.show();ready();await task;
  assert.ok(!t.calls.includes('construct'));assert.equal(t.ctx.molstarPendingPdbId,'');
});
test('visibility is checked again after library wait even before observer callback',async()=>{
  const t=setup();let ready;t.ctx.waitForMolstarComponent=()=>new Promise(resolve=>ready=resolve);
  const task=t.ctx.loadMolstarForSelected();t.close();ready();await task;assert.ok(!t.calls.includes('construct'));
});
test('hidden during model load disposes and cannot apply stale controls after completion',async()=>{
  const t=setup();let ready;t.ctx.SpliceVisViewer.load=()=>new Promise(resolve=>ready=resolve);
  const task=t.ctx.loadMolstarForSelected();await new Promise(resolve=>setImmediate(resolve));t.hide();t.ctx.reconcileMolstarVisibility();ready();await task;
  assert.deepEqual(t.calls,['construct','dispose']);assert.equal(t.ctx.state.molstarViewer,null);
});
test('native resize is reconciled in capture phase and no synthetic resize is dispatched',()=>{
  assert.match(source,/window\.addEventListener\("resize",\(\)=>\{ reconcileMolstarVisibility\(\); requestAnimationFrame\(fitCycleArt\); \},\{capture:true\}\)/);
  assert.doesNotMatch(source,/dispatchEvent\(new Event\("resize"\)\)/);
});
