/* Deposited models in one coordinate frame. No fit is inferred in the viewer. */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.SpliceVisComparisonViewer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  function validateMatrix(matrix){
    if(!Array.isArray(matrix)||matrix.length!==16||matrix.some(v=>typeof v!=='number'||!Number.isFinite(v))) throw new Error('A validated structural alignment is required.');
    const tolerance=.002;
    if([3,7,11].some(i=>Math.abs(matrix[i])>tolerance)||Math.abs(matrix[15]-1)>tolerance) throw new Error('The alignment is not a rigid transformation.');
    const cols=[matrix.slice(0,3),matrix.slice(4,7),matrix.slice(8,11)];
    for(let i=0;i<3;i++) for(let j=0;j<3;j++) if(Math.abs(cols[i].reduce((s,x,k)=>s+x*cols[j][k],0)-(i===j?1:0))>tolerance) throw new Error('The alignment contains scaling or a non-rigid rotation.');
    const [a,b,c]=cols,det=a[0]*(b[1]*c[2]-b[2]*c[1])-b[0]*(a[1]*c[2]-a[2]*c[1])+c[0]*(a[1]*b[2]-a[2]*b[1]);
    if(Math.abs(det-1)>tolerance) throw new Error('The alignment contains a reflection.');
    return matrix.slice();
  }
  function invertMatrix(value){
    const m=validateMatrix(value),out=identity();
    for(let col=0;col<3;col++) for(let row=0;row<3;row++) out[col*4+row]=m[row*4+col];
    for(let row=0;row<3;row++) out[12+row]=-[0,1,2].reduce((sum,k)=>sum+out[k*4+row]*m[12+k],0);
    return out;
  }
  function coordinateSource(record,offline){
    const id=String(record?.pdb_id||'').toLowerCase();
    if(!/^[a-z0-9]{4}$/.test(id)) throw new Error('Invalid structure identifier.');
    return offline?{url:`pdb/${id}.cif`,format:'mmcif'}:{url:`https://www.ebi.ac.uk/pdbe/entry-files/download/${id}.bcif`,format:'bcif'};
  }
  function palette(record){
    const priority=f=>{const v=String(f.feature||'').toLowerCase();return v==='substrate'?-1:v.includes('branch_point_adenosine')?40:/exon_5|exon_3|ligated|exon_defined/.test(v)?30:/splice_site|branch|polypyrimidine/.test(v)?20:10;};
    return [...(record.molstar_color_selections||[]).map(x=>({auth_asym_id:x.auth_asym_id,color:x.color})),...(record.molstar_feature_selections||[]).filter(f=>priority(f)>=0).slice().sort((a,b)=>priority(a)-priority(b)).flatMap(f=>(f.queries||[]).map(q=>({...q,color:f.color||'#FFFF00',focus:false})))];
  }
  function validateProbes(structure,probes){
    if(!Array.isArray(probes)||probes.length<3) throw new Error('Coordinate-version checks are unavailable for this alignment.');
    const models=structure.models || [...new Set((structure.units||[]).map(unit=>unit.model))];
    const normalizeInsertion=value=>['.','?',undefined,null].includes(value)?'':String(value);
    for(const probe of probes){
      if(!probe.chain || !Number.isFinite(Number(probe.auth_seq_id)) || (probe.model_num!==undefined&&!Number.isFinite(Number(probe.model_num))) || ![probe.x,probe.y,probe.z].every(Number.isFinite)) throw new Error('Invalid coordinate-version evidence.');
      let matched=false;
      for(const model of models){
        if(probe.model_num!==undefined&&Number(model.modelNum)!==Number(probe.model_num))continue;
        const h=model.atomicHierarchy,c=model.atomicConformation;
        if(!h||!c)continue;
        for(let atom=0;atom<c.x.length;atom++){
          const residue=h.residueAtomSegments.index[atom],chain=h.chainAtomSegments.index[atom];
          if(h.atoms.label_atom_id.value(atom)!==(probe.atom||'CA') || h.chains.auth_asym_id.value(chain)!==probe.chain || h.residues.auth_seq_id.value(residue)!==Number(probe.auth_seq_id) || normalizeInsertion(h.residues.pdbx_PDB_ins_code.value(residue))!==normalizeInsertion(probe.ins_code))continue;
          if(probe.alt_id!==undefined&&normalizeInsertion(h.atoms.label_alt_id?.value(atom))!==normalizeInsertion(probe.alt_id))continue;
          if(Math.hypot(c.x[atom]-probe.x,c.y[atom]-probe.y,c.z[atom]-probe.z)<=.05){matched=true;break;}
        }
        if(matched)break;
      }
      if(!matched)throw new Error('The downloaded coordinates differ from the validated alignment. Rebuild the alignment data before comparing this pair.');
    }
    return true;
  }
  function cameraPose(camera){
    const s=camera.getSnapshot();
    return {mode:s.mode,position:[...s.position],target:[...s.target],up:[...s.up],radius:s.radius,fov:s.fov};
  }
  async function style(instance){
    const plugin=instance.plugin,component=plugin.managers.structure.component,canvas=plugin.canvas3d;
    if(component)await component.setOptions({...component.state?.options,ignoreLight:true});
    const processing=canvas.props?.postprocessing||{};
    const outline=processing.outline?.name==='on'?processing.outline.params||{}:{};
    const occlusion=processing.occlusion?.name==='on'?processing.occlusion.params||{}:{};
    canvas.setProps({postprocessing:{
      outline:{name:'on',params:{...outline,scale:.65,color:0,threshold:outline.threshold??.33,includeTransparent:true}},
      occlusion:{name:'on',params:Object.keys(occlusion).length?occlusion:{multiScale:{name:'off',params:{}},radius:5,bias:.8,blurKernelSize:15,blurDepthBias:.5,samples:32,resolutionScale:1,color:0,transparentThreshold:.4}},
      shadow:{name:'off',params:{}}
    }});
    canvas.setProps({cameraFog:{name:'off',params:{}},cameraClipping:{radius:100,far:false,minNear:1},renderer:{selectStrength:0},marking:{enabled:true,selectEdgeColor:0x172554,selectEdgeStrength:1,ghostEdgeStrength:.3,edgeScale:1}});
  }
  function abortError(){const error=new Error('Comparison loading was cancelled.');error.name='AbortError';return error;}
  async function create(options,runtime={}){
    const {leftElement,rightElement,reference,mobile,overlay=false,offline=false,onStatus=()=>{},signal,timeoutMs=120000}=options;
    const matrix=validateMatrix(options.matrix),Ctor=runtime.Plugin||root.PDBeMolstarPlugin;
    const entries=[{element:leftElement,record:reference,transform:identity(),probes:options.referenceProbes},{element:rightElement,record:mobile,transform:matrix,probes:options.mobileProbes},...(options.additional||[]).map(x=>({...x,transform:validateMatrix(x.transform)}))];
    if(entries.length>5 || (overlay&&entries.length!==2))throw new Error('Choose up to five side-by-side structures or two for overlay.');
    for(const entry of entries){coordinateSource(entry.record,offline);if(!Array.isArray(entry.probes)||entry.probes.length<3||(!overlay&&!entry.element))throw new Error('Alignment evidence or viewer target is missing.');}
    if(!leftElement||(!overlay&&!rightElement)||!Ctor?.extensions?.MVS) throw new Error('The comparison viewer is unavailable.');
    coordinateSource(reference,offline);coordinateSource(mobile,offline);
    if(!Array.isArray(options.referenceProbes)||options.referenceProbes.length<3||!Array.isArray(options.mobileProbes)||options.mobileProbes.length<3)throw new Error('Coordinate-version checks are unavailable for this alignment.');
    if(signal?.aborted)throw abortError();
    const instances=[],listeners=[];
    const elements=overlay?[leftElement]:entries.map(x=>x.element),visibility=elements.map(element=>element.style.visibility);
    elements.forEach(element=>element.style.visibility='hidden');
    const raf=runtime.requestAnimationFrame||root.requestAnimationFrame.bind(root),caf=runtime.cancelAnimationFrame||root.cancelAnimationFrame.bind(root);
    let disposed=false,frame=null,sync=true,active=0,previous=[];
    const guard=()=>{if(disposed||signal?.aborted)throw abortError();};
    function dispose(){
      if(disposed)return;
      disposed=true;
      if(frame!==null)caf(frame);
      signal?.removeEventListener('abort',dispose);
      listeners.forEach(([element,name,fn])=>element.removeEventListener(name,fn));
      for(const instance of instances)instance.plugin?.dispose();
      elements.forEach(element=>element.replaceChildren());
      elements.forEach((element,index)=>element.style.visibility=visibility[index]);
    }
    if(signal?.aborted)throw abortError();
    signal?.addEventListener('abort',dispose,{once:true});
    async function bounded(work){
      let timer,onAbort;
      try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Comparison loading timed out. Retry when coordinates are available.')),timeoutMs);onAbort=()=>reject(abortError());signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)onAbort();})]);}
      finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
    }
    async function load(element,entries){
      guard();
      const instance=new Ctor();instances.push(instance);
      // Empty initialization avoids loading a second copy before applying the fit.
      await instance.render(element,{hideControls:true,hideCanvasControls:['expand','controlToggle','controlInfo','selection','animation','trajectory','snapshotControls','snapshotDescription'],bgColor:'white',selectInteraction:false,sequencePanel:false,pdbeLink:!offline});
      if(disposed){instance.plugin?.dispose();throw abortError();}guard();
      const {MVSData,loadMVS}=Ctor.extensions.MVS,builder=MVSData.createBuilder();
      for(const {record,transform} of entries){
        const source=coordinateSource(record,offline);
        const structure=builder.download({url:source.url}).parse({format:source.format}).modelStructure();
        structure.transform({matrix:transform});
        structure.component({selector:'polymer'}).representation({type:'cartoon'});
      }
      await loadMVS(instance.plugin,builder.getState(),{sanityChecks:true});guard();
      const structures=instance.plugin.managers.structure.hierarchy.current.structures;
      if(structures.length!==entries.length||structures.some(s=>!s.cell?.obj?.data?.elementCount)) throw new Error('One or more coordinate models could not be loaded.');
      for(let i=0;i<entries.length;i++){
        validateProbes(structures[i].cell.obj.data,entries[i].probes);
        const colors=palette(entries[i].record);
        await instance.visual.select({structureNumber:i+1,data:colors,nonSelectedColor:'#D8DDE4'});guard();
        if(overlay&&i===1)await instance.visual.select({structureNumber:i+1,data:[{color:null,opacity:.55}],keepColors:true,keepRepresentations:true});
      }
      await style(instance);guard();
      return instance;
    }
    const cameras=()=>instances.map(x=>x.plugin.canvas3d.camera);
    function copyCamera(from,to){const cs=cameras();cs[to].setState(cameraPose(cs[from]),0);}
    function synchronize(from){for(let i=0;i<instances.length;i++)if(i!==from)copyCamera(from,i);}
    function remember(){previous=cameras().map(c=>JSON.stringify(cameraPose(c)));}
    function tick(){
      if(disposed)return;
      if(!overlay&&instances.length>=2){
        const now=cameras().map(c=>JSON.stringify(cameraPose(c)));
        if(sync){const changed=now.map((v,i)=>v!==previous[i]);const from=changed[active]?active:changed.findIndex(Boolean);if(from>=0)synchronize(from);}
        remember();
      }
      frame=raf(tick);
    }
    const targets=()=>overlay?[{instance:instances[0],number:1},{instance:instances[0],number:2}]:instances.map(instance=>({instance,number:1}));
    async function reset(){
      guard();
      for(const instance of instances){await instance.visual.clearSelection(undefined,{keepColors:true,keepRepresentations:true});instance.plugin.managers.interactivity.lociSelects.deselectAll();await instance.visual.reset({camera:true});guard();}
      if(overlay)await instances[0].visual.select({structureNumber:2,data:[{color:null,opacity:.55}],keepColors:true,keepRepresentations:true});
      active=0;if(!overlay&&sync)synchronize(0);remember();
    }
    async function selectInView(index,queries,{only=false,focus=true}={}){
      guard();
      const view=targets()[index];
      if(!view||!Array.isArray(queries)||queries.some(q=>!q?.auth_asym_id))throw new Error('Choose a valid component in this structure.');
      const {instance,number}=view;
      const loci=queries.length?instance.getLociForParams(queries,number):null;
      if(loci&&(loci.kind!=='element-loci'||!loci.elements?.length))throw new Error('This selection has no modelled atoms.');
      // Only clear this model's marker, including in a shared overlay canvas.
      const modelLoci=instance.getLociForParams([{}],number);
      instance.plugin.managers.interactivity.lociSelects.deselect({loci:modelLoci});
      await instance.visual.clearSelection(number,{keepColors:true,keepRepresentations:true});guard();
      if(loci)instance.plugin.managers.interactivity.lociSelects.select({loci},false);
      if(only&&queries.length)await instance.visual.select({structureNumber:number,data:queries.map(q=>({...q,color:null,opacity:overlay&&index===1?.55:1,focus:false})),nonSelectedOpacity:0,keepColors:true,keepRepresentations:true});
      else if(overlay&&index===1)await instance.visual.select({structureNumber:number,data:[{color:null,opacity:.55}],keepColors:true,keepRepresentations:true});
      guard();
      if(loci&&focus){
        instance.plugin.managers.camera.focusLoci(loci,{minRadius:15,extraRadius:8,durationMs:0});
        active=overlay?0:index;if(!overlay&&sync)synchronize(active);remember();
      }
    }
    async function selectComponent(refQueries,mobileQueries,{only=false,additionalQueries=[]}={}){
      guard();
      const views=targets(),queries=[refQueries,mobileQueries,...additionalQueries];
      if(queries.length!==views.length || queries.some(items=>!Array.isArray(items)||!items.length||items.some(q=>!q?.auth_asym_id)))throw new Error('Choose a shared component first.');
      const loci=views.map((v,i)=>v.instance.getLociForParams(queries[i],v.number));
      if(loci.some(l=>l?.kind!=='element-loci'||!l.elements?.length))throw new Error('This component has no modelled atoms in one of the structures.');
      for(const instance of instances)instance.plugin.managers.interactivity.lociSelects.deselectAll();
      for(let i=0;i<views.length;i++){
        const {instance,number}=views[i];
        instance.plugin.managers.interactivity.lociSelects.select({loci:loci[i]},false);
        await instance.visual.clearSelection(number,{keepColors:true,keepRepresentations:true});guard();
        if(only)await instance.visual.select({structureNumber:number,data:queries[i].map(q=>({...q,color:null,opacity:overlay&&i===1?.55:1,focus:false})),nonSelectedOpacity:0,keepColors:true,keepRepresentations:true});
        else if(overlay&&i===1)await instance.visual.select({structureNumber:number,data:[{color:null,opacity:.55}],keepColors:true,keepRepresentations:true});
      }
      active=0;
      instances[0].plugin.managers.camera.focusLoci(overlay?loci:loci[0],{minRadius:15,extraRadius:8,durationMs:0});
      if(!overlay){if(sync)synchronize(0);else for(let i=1;i<instances.length;i++)instances[i].plugin.managers.camera.focusLoci(loci[i],{minRadius:15,extraRadius:8,durationMs:0});}remember();
    }
    try{
      onStatus('Loading aligned coordinate models…');
      await bounded((async()=>{
        if(overlay)await load(leftElement,[{record:reference,transform:identity(),probes:options.referenceProbes},{record:mobile,transform:matrix,probes:options.mobileProbes}]);
        else{
          for(const entry of entries)await load(entry.element,[entry]);
        }
      })());guard();
      if(!overlay){synchronize(0);elements.forEach((element,index)=>{const activate=()=>active=index;element.addEventListener('pointerdown',activate);element.addEventListener('wheel',activate,{passive:true});listeners.push([element,'pointerdown',activate],[element,'wheel',activate]);});}
      remember();frame=raf(tick);
      elements.forEach((element,index)=>element.style.visibility=visibility[index]);
      onStatus(overlay?'Aligned overlay. The second structure is semi-transparent.':'Aligned models ready. Rotate or zoom any view.');
      return Object.freeze({dispose,setSync(value){guard();sync=Boolean(value);if(sync&&!overlay)synchronize(active);remember();},reset,selectComponent,selectInView});
    }catch(error){dispose();throw error;}
  }
  return Object.freeze({create,validateMatrix,invertMatrix,validateProbes,coordinateSource,palette});
});
