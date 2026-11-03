const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=fs.existsSync(path.join(__dirname,'../web/dashboard.js'))?path.resolve(__dirname,'..'):path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'web/dashboard.js'),'utf8');
function install(ctx,names){for(const name of names){const match=source.match(new RegExp(`^    (?:async )?function ${name}\\([\\s\\S]*?(?=^    (?:async )?function |^    let |^    window\\.)`,'m'));assert.ok(match,`missing ${name}`);vm.runInContext(match[0],ctx);}}
function setup(loading=false){
 const record={pdb_id:'a',molstar_color_selections:[{label:'A protein',auth_asym_id:'A',color:'#112233'},{label:'A protein',auth_asym_id:'B',color:'#112233'},{label:'Z protein',auth_asym_id:'Z',color:'#abcdef'}]};
 const calls=[],status={textContent:''},count={textContent:''},clear={},list={innerHTML:''},controls=[{disabled:true,hasAttribute:()=>true}];
 const checkboxes=[0,1].map(index=>({dataset:{proteinIndex:String(index)},checked:false}));
 let ready;
 const instance={plugin:{canvas3d:{},dispose:()=>calls.push('dispose')},visual:{reset:async()=>calls.push('camera-reset')}};
 let viewer=loading?null:{viewerInstance:instance};
 const ctx=vm.createContext({state:{selected:'a',molstarPdbId:loading?'':'a',molstarViewer:viewer},molstarSelectionIntent:0,molstarProteinSelection:new Set(),molstarSelectionQueries:[],molstarVisibilityOperation:null,
 molstarGeneration:0,molstarAbort:null,molstarLoadTask:null,molstarPendingPdbId:'',
 currentMolstarRecord:()=>record,currentMolstarViewerElement:()=>viewer,
 esc:v=>String(v),attr:v=>String(v),matchesSearch:(q,value)=>value.includes(q),
 document:{getElementById:id=>({molstarStatus:status,molstarProteinCount:count,molstarProteinClear:clear,molstarProteinList:list})[id]||null,
 querySelectorAll:q=>q==='[data-protein-index]'?checkboxes:q==='.viewer-display-actions button'?controls:[]},
 SpliceVisInteractions:{select:(_instance,queries,options)=>calls.push({kind:'mark',queries,options}),clear:async()=>calls.push('clear'),hide:async(_i,queries)=>calls.push({kind:'hide',queries}),showOnly:async(_i,queries)=>calls.push({kind:'showOnly',queries})},
 loadMolstarForSelected:()=>{if(ctx.molstarLoadTask)return ctx.molstarLoadTask;ctx.disposeMolstar();ctx.molstarLoadTask=new Promise(resolve=>ready=()=>{viewer={viewerInstance:instance};ctx.state.molstarViewer=viewer;ctx.state.molstarPdbId=ctx.state.selected;ctx.molstarLoadTask=null;resolve();});return ctx.molstarLoadTask;}
 });
 install(ctx,['molstarLegendItems','molstarLegend','searchMolstarProteins','refreshMolstarProteinSelection','clearMolstarLegendActive','molstarProteinQueries','toggleMolstarProtein','prepareMolstarSelection','molstarSelectionIsCurrent','markMolstarSelection','clearMolstarFeature','disposeMolstar','refreshMolstarVisibilityControls','changeMolstarVisibility','selectMolstarComponentFromLegend']);
 return {ctx,calls,record,status,count,clear,list,controls,checkboxes,finish:()=>ready(),toggle:(index,checked)=>ctx.toggleMolstarProtein({dataset:{proteinIndex:String(index)},checked})};
}
test('multiple proteins select all constituent chains with canonical colours and no camera jump; Display uses the union',async()=>{
 const t=setup();await t.toggle(0,true);await t.toggle(1,true);
 const mark=t.calls.filter(c=>c.kind==='mark').at(-1);assert.equal(mark.queries.map(q=>q.auth_asym_id).join(','),'A,B,Z');
 assert.equal(mark.queries[0].color,'#112233');assert.equal(mark.queries[2].color,'#abcdef');assert.equal(mark.options.focus,false);
 assert.equal(t.count.textContent,'2 proteins selected');assert.equal(t.clear.disabled,false);assert.equal(t.controls[0].disabled,false);
 await t.ctx.changeMolstarVisibility('hide');await t.ctx.changeMolstarVisibility('showOnly');
 for(const action of t.calls.filter(c=>['hide','showOnly'].includes(c.kind)))assert.equal(action.queries.map(q=>q.auth_asym_id).join(','),'A,B,Z');
});
test('unchecking removes the whole component; removing last clears marks without resetting camera or visibility',async()=>{
 const t=setup();await t.toggle(0,true);await t.toggle(1,true);await t.toggle(0,false);
 assert.equal(t.ctx.molstarSelectionQueries.map(q=>q.auth_asym_id).join(','),'Z');assert.equal(t.checkboxes[0].checked,false);assert.equal(t.count.textContent,'1 protein selected');
 await t.toggle(1,false);assert.equal(t.ctx.molstarSelectionQueries.length,0);assert.equal(t.ctx.molstarProteinSelection.size,0);assert.equal(t.controls[0].disabled,true);
 assert.ok(t.calls.includes('clear'));assert.ok(!t.calls.includes('camera-reset'));assert.equal(t.count.textContent,'0 proteins selected');
});
test('search hides rows without dropping checked selections and restores their checked state',async()=>{
 const t=setup();await t.toggle(0,true);t.ctx.searchMolstarProteins({value:'Z protein'});
 assert.ok(!t.list.innerHTML.includes('A protein'));assert.equal(t.ctx.molstarProteinSelection.size,1);
 t.ctx.searchMolstarProteins({value:''});assert.match(t.list.innerHTML,/data-protein-index="0" checked/);assert.match(t.list.innerHTML,/background:#112233/);
});
test('protein name selects only that component and focuses it; RNA selection clears protein checks',async()=>{
 const t=setup();await t.toggle(0,true);await t.toggle(1,true);await t.ctx.selectMolstarComponentFromLegend({dataset:{legendIndex:'0'}});
 assert.equal(t.ctx.molstarProteinSelection.size,1);assert.equal(t.ctx.molstarSelectionQueries.map(q=>q.auth_asym_id).join(','),'A,B');assert.equal(t.calls.filter(c=>c.kind==='mark').at(-1).options.focus,true);
 const selection=await t.ctx.prepareMolstarSelection('a');await t.ctx.markMolstarSelection(selection,[{auth_asym_id:'RNA',beg_auth_seq_id:1,end_auth_seq_id:2}]);
 assert.equal(t.ctx.molstarProteinSelection.size,0);assert.equal(t.checkboxes.some(c=>c.checked),false);
});
test('rapid checks while model loads merge; stale first continuation cannot replace the newer union',async()=>{
 const t=setup(true),first=t.toggle(0,true),second=t.toggle(1,true);t.finish();await Promise.all([first,second]);
 assert.equal(t.calls.filter(c=>c.kind==='mark').length,1);assert.equal(t.ctx.molstarSelectionQueries.map(q=>q.auth_asym_id).join(','),'A,B,Z');
});
test('clear during loading and a model change both invalidate pending protein selections',async()=>{
 for(const clear of [true,false]){
  const t=setup(true),pending=t.toggle(0,true);
  if(clear)await t.ctx.clearMolstarFeature(false);else{t.ctx.state.selected='b';t.ctx.disposeMolstar();}
  t.finish();await pending;assert.equal(t.calls.filter(c=>c.kind==='mark').length,0);assert.equal(t.ctx.molstarProteinSelection.size,0);assert.equal(t.controls[0].disabled,true);
 }
});
test('component chain unions deduplicate without mutating canonical input',()=>{
 const t=setup();t.record.molstar_color_selections.push({label:'Z protein',auth_asym_id:'B',color:'#abcdef'});
 const before=JSON.stringify(t.record),queries=t.ctx.molstarProteinQueries(t.record,new Set([0,1]));
 assert.equal(queries.map(q=>q.auth_asym_id).join(','),'A,B,Z');assert.equal(JSON.stringify(t.record),before);
});
test('failed marking clears the checked set and old outlines; failed loading cannot leave a selected count',async()=>{
 const t=setup();await t.toggle(0,true);t.ctx.SpliceVisInteractions.select=()=>{throw new Error('No modelled atoms');};await t.toggle(1,true);
 assert.equal(t.ctx.molstarProteinSelection.size,0);assert.equal(t.ctx.molstarSelectionQueries.length,0);assert.ok(t.calls.includes('clear'));assert.equal(t.status.textContent,'No modelled atoms');
 const failed=setup();failed.ctx.prepareMolstarSelection=async()=>{throw new Error('Loading failed');};await failed.toggle(0,true);
 assert.equal(failed.ctx.molstarProteinSelection.size,0);assert.equal(failed.ctx.molstarSelectionQueries.length,0);assert.match(failed.status.textContent,/Loading failed/);
});
