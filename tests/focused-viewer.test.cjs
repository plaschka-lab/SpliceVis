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
  const calls=[],pending=[],status={textContent:''};
  const controls=[true,true,false].map(requires=>({disabled:false,hasAttribute:name=>name==='data-requires-selection'&&requires}));
  const createViewer=()=>({viewerInstance:{plugin:{canvas3d:{},dispose(){}},visual:{reset:async()=>calls.push('reset')}}});
  let viewer=createViewer();
  const ctx=vm.createContext({state:{selected:'a',molstarPdbId:'a',molstarViewer:viewer},molstarSelectionQueries:[{auth_asym_id:'A'}],molstarSelectionIntent:1,
    molstarVisibilityOperation:null,refreshMolstarProteinSelection:()=>{},molstarProteinSelection:new Set(),molstarLoadTask:null,molstarGeneration:0,molstarAbort:null,molstarPendingPdbId:'',
    currentMolstarViewerElement:()=>viewer,clearMolstarLegendActive:()=>{},
    document:{getElementById:id=>id==='molstarStatus'?status:null,querySelectorAll:q=>q==='.viewer-display-actions button'?controls:[]},
    SpliceVisInteractions:{select:(_instance,queries)=>calls.push(['select',queries]),clear:async()=>{}}
  });
  for(const action of ['hide','showOnly','showAll'])ctx.SpliceVisInteractions[action]=(instance,queries)=>{
    calls.push([action,queries]);return new Promise((resolve,reject)=>pending.push({resolve,reject}));
  };
  install(ctx,['refreshMolstarVisibilityControls','changeMolstarVisibility','clearMolstarFeature','markMolstarSelection','molstarSelectionIsCurrent','disposeMolstar']);
  return {ctx,calls,pending,status,controls,finish:()=>pending.shift().resolve(),fail:()=>pending.shift().reject(new Error('opacity failed')),
    select:async chain=>{const selection={instance:viewer.viewerInstance,intent:++ctx.molstarSelectionIntent,requested:ctx.state.selected};await ctx.markMolstarSelection(selection,[{auth_asym_id:chain}]);},
    replace:()=>{ctx.disposeMolstar();viewer=createViewer();ctx.state.molstarViewer=viewer;ctx.state.molstarPdbId='a';}};
}

test('Reset during Hide leaves selection controls disabled and retains reset status',async()=>{
  const t=setup(),hide=t.ctx.changeMolstarVisibility('hide');
  assert.ok(t.controls.every(b=>b.disabled));await t.ctx.clearMolstarFeature();
  t.finish();await hide;
  assert.deepEqual(t.controls.map(b=>b.disabled),[true,true,false]);
  assert.equal(t.ctx.molstarSelectionQueries.length,0);assert.match(t.status.textContent,/Reset view/);
});

test('new selection during visibility update cannot unlock controls until completion',async()=>{
  const t=setup();t.ctx.molstarSelectionQueries=[];
  const show=t.ctx.changeMolstarVisibility('showAll');await t.select('B');
  assert.ok(t.controls.every(b=>b.disabled));t.finish();await show;
  assert.deepEqual(t.controls.map(b=>b.disabled),[false,false,false]);
  assert.equal(t.ctx.molstarSelectionQueries[0].auth_asym_id,'B');
});

test('visibility updates are mutually exclusive and snapshot the selected queries',async()=>{
  const t=setup(),hide=t.ctx.changeMolstarVisibility('hide');
  t.ctx.molstarSelectionQueries[0].auth_asym_id='B';
  await t.ctx.changeMolstarVisibility('showAll');
  assert.equal(t.calls.length,1);assert.equal(t.calls[0][1][0].auth_asym_id,'A');
  t.finish();await hide;
  const show=t.ctx.changeMolstarVisibility('showAll');assert.equal(t.calls.length,2);t.finish();await show;
});

test('completion on a disposed viewer cannot unlock a new viewers pending operation',async()=>{
  const t=setup(),old=t.ctx.changeMolstarVisibility('hide');t.replace();await t.select('B');
  const current=t.ctx.changeMolstarVisibility('showOnly');t.finish();await old;
  assert.ok(t.controls.every(b=>b.disabled));assert.ok(t.ctx.molstarVisibilityOperation);
  t.finish();await current;assert.deepEqual(t.controls.map(b=>b.disabled),[false,false,false]);
});

test('model loading blocks opacity mutations; failure releases controls using current selection',async()=>{
  const t=setup();t.ctx.molstarLoadTask=Promise.resolve();t.ctx.refreshMolstarVisibilityControls();
  assert.ok(t.controls.every(b=>b.disabled));await t.ctx.changeMolstarVisibility('hide');assert.equal(t.calls.length,0);
  t.ctx.molstarLoadTask=null;t.ctx.refreshMolstarVisibilityControls();
  const action=t.ctx.changeMolstarVisibility('hide');t.fail();await action;
  assert.deepEqual(t.controls.map(b=>b.disabled),[false,false,false]);assert.equal(t.status.textContent,'opacity failed');
});

test('focused viewer cannot navigate to hidden mobile atlas panes',()=>{
  const classes=new Set(),ctx=vm.createContext({state:{panelOnly:true,mobilePane:'detail'},els:{},requestAnimationFrame:()=>{},fitCycleArt:()=>{},reconcileMolstarVisibility:()=>{},document:{body:{classList:{remove:(...names)=>names.forEach(n=>classes.delete(n)),add:name=>classes.add(name)}}}});
  install(ctx,['setMobilePane']);
  for(const pane of ['cycle','structures','detail','invalid']){ctx.setMobilePane(pane);assert.equal(ctx.state.mobilePane,'detail');assert.ok(classes.has('mobile-pane-detail'));}
  ctx.state.panelOnly=false;ctx.setMobilePane('cycle');assert.equal(ctx.state.mobilePane,'cycle');
  const css=fs.readFileSync(path.join(root,'web/dashboard.css'),'utf8');
  assert.match(css,/\.structure-only \.mobile-view-switch\s*\{\s*display:none/);
});
