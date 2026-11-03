const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=fs.existsSync(path.join(__dirname,'../web/comparison-viewer.js'))?'../web/':'../../web/';
const api=require(path.join(__dirname,base,'comparison-viewer.js'));
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const probes=[1,2,3].map(n=>({chain:"A",auth_seq_id:n,ins_code:"",atom:"CA",model_num:1,alt_id:'',x:n,y:0,z:0}));
const model=()=>({modelNum:1,atomicConformation:{x:[1,2,3],y:[0,0,0],z:[0,0,0]},atomicHierarchy:{residueAtomSegments:{index:[0,1,2]},chainAtomSegments:{index:[0,0,0]},atoms:{label_atom_id:{value:()=>"CA"},label_alt_id:{value:()=>""}},chains:{auth_asym_id:{value:()=>"A"}},residues:{auth_seq_id:{value:i=>i+1},pdbx_PDB_ins_code:{value:()=>""}}}});
const record=id=>({pdb_id:id,molstar_color_selections:[{auth_asym_id:'A',color:'#123456'}]});
function fixture({fail=false,delay=0}={}){
 const calls=[],instances=[],frames=new Map();let next=0;
 const element=()=>({style:{visibility:""},events:new Map(),replaceChildren(){this.cleared=true;},addEventListener(n,fn){this.events.set(n,fn);},removeEventListener(n){this.events.delete(n);}});
 class Plugin{
  constructor(){instances.push(this);this.visual={select:async x=>calls.push(['select',instances.indexOf(this),x]),clearSelection:async(...x)=>calls.push(['clear',...x]),reset:async()=>{}};}
  async render(element,options){
   calls.push(["render",options]);
   const self=this;let pose={mode:'perspective',position:[0,0,100],target:[0,0,0],up:[0,1,0],radius:50,fov:.7};
   this.plugin={dispose(){calls.push(['dispose']);},canvas3d:{setProps:x=>calls.push(['props',x]),camera:{getSnapshot:()=>structuredClone(pose),setState:x=>{pose={...pose,...structuredClone(x)};calls.push(['camera',instances.indexOf(self),x]);}}},managers:{structure:{component:{state:{options:{quality:"auto"}},async setOptions(value){calls.push(["style",value]);}},hierarchy:{current:{structures:[]}}},interactivity:{lociSelects:{select:(x,g)=>calls.push(['mark',x,g]),deselectAll:()=>calls.push(['deselect'])}},camera:{focusLoci:(l,o)=>calls.push(['focus',l,o])}}};
  }
  getLociForParams(queries,number){return {kind:'element-loci',elements:queries.length?[{number}]:[]};}
 }
 Plugin.extensions={MVS:{MVSData:{createBuilder(){const entries=[];return {download({url}){const e={url};entries.push(e);return {parse({format}){e.format=format;return {modelStructure(){return {transform({matrix}){e.matrix=matrix;},component(){return {representation(){}};}};}};}};},getState(){return entries;}};}},async loadMVS(plugin,entries){calls.push(['load',entries]);if(delay)await new Promise(r=>setTimeout(r,delay));if(fail)throw new Error('Bad coordinates');plugin.managers.structure.hierarchy.current.structures=entries.map(()=>({cell:{obj:{data:{elementCount:1000,models:[model()]}}}}));}}};
 const runtime={Plugin,requestAnimationFrame(fn){const id=++next;frames.set(id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);}};
 const options={leftElement:element(),rightElement:element(),reference:record('6id0'),mobile:record('6id1'),referenceProbes:probes,mobileProbes:probes,matrix:[...I.slice(0,12),1,2,3,1]};
 const tick=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());};
 return {calls,instances,frames,runtime,options,tick};
}
test('rigid transforms accept translation/rotation and inverse restores coordinates',()=>{
 const m=[0,1,0,0,-1,0,0,0,0,0,1,0,10,20,30,1];
 const transform=(a,p)=>[0,1,2].map(r=>a[12+r]+p.reduce((s,v,k)=>s+a[k*4+r]*v,0));
 assert.deepEqual(transform(api.invertMatrix(m),transform(m,[2,3,4])),[2,3,4]);
 assert.notEqual(api.validateMatrix(m),m);
 for(const invalid of [null,[],I.map((v,i)=>i===0?2:v),I.map((v,i)=>i===0?-1:v),I.map((v,i)=>i===3?1:v),I.map((v,i)=>i===0?NaN:v)]) assert.throws(()=>api.validateMatrix(invalid));
});
test('sources validate IDs and distinguish offline CIF from online BCIF',()=>{
 assert.equal(api.coordinateSource(record('6ID0'),false).url,'https://www.ebi.ac.uk/pdbe/entry-files/download/6id0.bcif');
 assert.deepEqual(api.coordinateSource(record('6id0'),true),{url:'pdb/6id0.cif',format:'mmcif'});
 assert.throws(()=>api.coordinateSource(record('../x'),false));
});
test('canonical component colours precede specific feature overlays without mutating data',()=>{
 const r=record('6id0');r.molstar_feature_selections=[{feature:'branch_point_adenosine',color:'#333333',queries:[{auth_asym_id:'R',beg_auth_seq_id:1}]},{feature:'intron',color:'#222222',queries:[{auth_asym_id:'R'}]}];
 const copy=structuredClone(r),p=api.palette(r);assert.deepEqual(r,copy);assert.deepEqual(p.map(v=>v.color),['#123456','#222222','#333333']);
});
test('side-by-side applies fit before display and links cameras in either direction',async()=>{
 const f=fixture(),c=await api.create(f.options,f.runtime);
 assert.equal(f.instances.length,2);
 const loads=f.calls.filter(x=>x[0]==='load');assert.deepEqual(loads[0][1][0].matrix,I);assert.deepEqual(loads[1][1][0].matrix,f.options.matrix);
 assert.ok(f.calls.filter(x=>x[0]==='select').every(x=>x[2].data[0].color==='#123456'));
 f.options.rightElement.events.get('pointerdown')();f.instances[1].plugin.canvas3d.camera.setState({position:[10,20,30]});f.tick();
 assert.deepEqual(f.instances[0].plugin.canvas3d.camera.getSnapshot().position,[10,20,30]);
 c.setSync(false);f.instances[1].plugin.canvas3d.camera.setState({position:[40,50,60]});f.tick();
 assert.deepEqual(f.instances[0].plugin.canvas3d.camera.getSnapshot().position,[10,20,30]);
 c.dispose();assert.equal(f.frames.size,0);assert.equal(f.options.rightElement.events.size,0);assert.equal(f.calls.filter(x=>x[0]==='dispose').length,2);
});
test('overlay uses one canvas and selection keeps both structure markers and colours',async()=>{
 const f=fixture(),c=await api.create({...f.options,overlay:true},f.runtime);
 assert.equal(f.instances.length,1);assert.equal(f.calls.find(x=>x[0]==='load')[1].length,2);
 await c.selectComponent([{auth_asym_id:'A'}],[{auth_asym_id:'B'}],{only:true});
 const marks=f.calls.filter(x=>x[0]==='mark');assert.equal(marks.length,2);assert.deepEqual(marks.map(x=>x[1].loci.elements[0].number),[1,2]);assert.ok(marks.every(x=>x[2]===false));
 const opacity=f.calls.filter(x=>x[0]==='select'&&x[2].nonSelectedOpacity===0);assert.equal(opacity.length,2);assert.ok(opacity.every(x=>x[2].keepColors&&x[2].data[0].color===null));
 c.dispose();
});
test('bad coordinates, invalid fit, timeout and cancellation never leave partial models',async()=>{
 const bad=fixture({fail:true});await assert.rejects(api.create(bad.options,bad.runtime),/Bad coordinates/);assert.ok(bad.options.leftElement.cleared);assert.equal(bad.frames.size,0);
 const invalid=fixture();await assert.rejects(api.create({...invalid.options,matrix:[]},invalid.runtime),/validated/);assert.equal(invalid.instances.length,0);
 const slow=fixture({delay:30});await assert.rejects(api.create({...slow.options,timeoutMs:1},slow.runtime),/timed out/);assert.ok(slow.options.leftElement.cleared);
 const cancelled=fixture({delay:30}),abort=new AbortController(),promise=api.create({...cancelled.options,signal:abort.signal},cancelled.runtime);abort.abort();await assert.rejects(promise,{name:'AbortError'});assert.ok(cancelled.options.leftElement.cleared);
});

test('coordinate probes use original atom positions and reject revised, missing or insertion-mismatched residues',()=>{
 assert.equal(api.validateProbes({models:[model()]},probes),true);
 const revised=model();revised.atomicConformation.x[1]+=0.1;
 assert.throws(()=>api.validateProbes({models:[revised]},probes),/coordinates differ/);
 assert.throws(()=>api.validateProbes({models:[model()]},probes.map(p=>({...p,ins_code:'A'}))),/coordinates differ/);
 assert.throws(()=>api.validateProbes({models:[model()]},[]),/unavailable/);
 assert.throws(()=>api.validateProbes({models:[model()]},probes.map(p=>({...p,model_num:2}))),/coordinates differ/);
 assert.throws(()=>api.validateProbes({models:[model()]},probes.map(p=>({...p,alt_id:'B'}))),/coordinates differ/);
});
test('coordinate version mismatch clears both hidden canvases before exposing the result',async()=>{
 const f=fixture();
 await assert.rejects(api.create({...f.options,mobileProbes:probes.map(p=>({...p,x:p.x+1}))},f.runtime),/coordinates differ/);
 assert.ok(f.options.leftElement.cleared);assert.ok(f.options.rightElement.cleared);
 assert.equal(f.options.leftElement.style.visibility,'');assert.equal(f.options.rightElement.style.visibility,'');
});

test('comparison uses illustrative styling and hides snapshot playback without removing camera controls',async()=>{
 const f=fixture(),c=await api.create(f.options,f.runtime);
 assert.ok(f.calls.filter(x=>x[0]==='render').every(x=>x[1].hideCanvasControls.includes('snapshotControls')&&x[1].hideCanvasControls.includes('snapshotDescription')&&!x[1].hideCanvasControls.includes('all')&&!x[1].hideCanvasControls.includes('reset')));
 assert.ok(f.calls.filter(x=>x[0]==='style').every(x=>x[1].ignoreLight&&x[1].quality==='auto'));
 const outline=f.calls.find(x=>x[0]==='props'&&x[1].postprocessing)?.[1].postprocessing.outline;
 assert.equal(outline.params.scale,.65);assert.equal(outline.params.color,0);assert.equal(outline.params.includeTransparent,true);
 c.dispose();
});
test('left camera motion synchronizes once and idle frames cannot create a feedback loop',async()=>{
 const f=fixture(),c=await api.create(f.options,f.runtime);
 f.options.leftElement.events.get('pointerdown')();f.instances[0].plugin.canvas3d.camera.setState({position:[12,34,56]});f.tick();
 assert.deepEqual(f.instances[1].plugin.canvas3d.camera.getSnapshot().position,[12,34,56]);
 const writes=f.calls.filter(x=>x[0]==='camera').length;
 for(let i=0;i<10;i++)f.tick();
 assert.equal(f.calls.filter(x=>x[0]==='camera').length,writes);assert.equal(f.frames.size,1);
 c.dispose();f.tick();assert.equal(f.frames.size,0);assert.equal(f.calls.filter(x=>x[0]==='camera').length,writes);
});
