const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = fs.existsSync(path.join(__dirname,'../web/viewer-interactions.js')) ? path.resolve(__dirname,'..') : path.resolve(__dirname,'../..');
const api = require(path.join(root,'web/viewer-interactions.js'));
const queries=[{auth_asym_id:'A',beg_auth_seq_id:10,end_auth_seq_id:10,color:'#AABBCC',focus:true}];

function viewer(){
  const calls=[];
  const loci={kind:'element-loci',elements:[{indices:[1]}]};
  const instance={getLociForParams:q=>(calls.push(['resolve',q]),loci),plugin:{
    canvas3d:{setProps:p=>calls.push(['props',p])},
    managers:{interactivity:{lociSelects:{selectOnly:(...args)=>calls.push(['mark',...args]),deselectAll:()=>calls.push(['deselect'])}},
      camera:{focusLoci:(...args)=>calls.push(['focus',...args])}}
  },visual:{select:p=>calls.push(['visualSelect',p]),clearSelection:(...args)=>calls.push(['clearOpacity',...args]),clearHighlight:()=>calls.push(['clearHover']),reset:p=>calls.push(['reset',p])}};
  return {instance,calls,loci};
}

test('persistent residue selection marks edges without recolouring or expanding granularity',()=>{
  const {instance,calls,loci}=viewer();
  assert.equal(api.select(instance,queries),loci);
  assert.deepEqual(calls.find(x=>x[0]==='mark'),['mark',{loci},false]);
  const props=calls.find(x=>x[0]==='props')[1];
  assert.equal(props.renderer.selectStrength,0);
  assert.notEqual(props.marking.selectEdgeColor,props.marking.highlightEdgeColor);
  assert.equal(calls.some(x=>x[0]==='visualSelect'),false);
  assert.deepEqual(calls.find(x=>x[0]==='focus')[2],{minRadius:15,extraRadius:8,durationMs:250});
  assert.equal(props.cameraClipping.far,false);
});

test('linked selection can mark without moving the camera',()=>{
  const {instance,calls}=viewer(); api.select(instance,queries,{focus:false});
  assert.equal(calls.some(x=>x[0]==='focus'),false);
});

test('missing viewer, selection and modelled coordinates fail before changing the scene',()=>{
  assert.throws(()=>api.select(null,queries),/not ready/);
  const {instance,calls}=viewer();
  assert.throws(()=>api.select(instance,[]),/Choose a component/);
  instance.getLociForParams=()=>({kind:'element-loci',elements:[]});
  assert.throws(()=>api.select(instance,queries),/No modelled atoms/);
  assert.equal(calls.length,0);
});

test('hide is cumulative, preserves colours and does not mutate caller queries',async()=>{
  const {instance,calls}=viewer(); await api.hide(instance,queries);
  const options=calls.find(x=>x[0]==='visualSelect')[1];
  assert.equal(options.keepColors,true); assert.equal(options.keepOpacity,true);
  assert.equal(options.keepRepresentations,true);
  assert.equal(options.data[0].color,null); assert.equal(options.data[0].opacity,0); assert.equal(options.data[0].focus,false);
  assert.equal(queries[0].color,'#AABBCC'); assert.equal(queries[0].focus,true);
});

test('show-only replaces visibility and show-all restores opacity without clearing palette',async()=>{
  const {instance,calls}=viewer(); await api.showOnly(instance,queries); await api.showAll(instance);
  const options=calls.find(x=>x[0]==='visualSelect')[1];
  assert.equal(options.keepOpacity,false); assert.equal(options.nonSelectedOpacity,0);
  assert.equal(options.data[0].opacity,1); assert.equal(options.data[0].color,null);
  assert.deepEqual(calls.find(x=>x[0]==='clearOpacity'),['clearOpacity',undefined,{keepColors:true,keepRepresentations:true}]);
});

test('clear removes persistent and hover markers and resets view without changing opacity',async()=>{
  const {instance,calls}=viewer(); await api.clear(instance);
  assert.deepEqual(calls,[['deselect'],['clearHover'],['reset',{camera:true}]]);
});

test('depth cue is independent of clipping, palette and camera focus',()=>{
  const {instance,calls}=viewer(); api.setDepthCue(instance,false); api.setDepthCue(instance,true);
  assert.deepEqual(calls,[['props',{cameraFog:{name:'off',params:{}}}],['props',{cameraFog:{name:'on',params:{intensity:60}}}]]);
});
