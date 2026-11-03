/* Small adapter for the bundled PDBe Molstar interaction APIs. */
(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  else root.SpliceVisInteractions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  function ready(instance){
    if(!instance?.plugin?.canvas3d || typeof instance.getLociForParams !== 'function'){
      throw new Error('The 3D viewer is not ready. Wait for the model to finish loading.');
    }
    return instance.plugin;
  }

  function resolve(instance, queries){
    ready(instance);
    if(!Array.isArray(queries) || !queries.length || queries.some(q=>!q || typeof q !== 'object' || !q.auth_asym_id)){
      throw new Error('Choose a component or an annotated residue range first.');
    }
    const loci = instance.getLociForParams(queries);
    if(loci?.kind !== 'element-loci' || !loci.elements?.length){
      throw new Error('No modelled atoms match this selection.');
    }
    return loci;
  }

  function style(plugin){
    plugin.canvas3d.setProps({
      // Mark the edges, not the surfaces: the canonical colour stays visible.
      renderer:{selectStrength:0},
      marking:{enabled:true,selectEdgeColor:0x172554,highlightEdgeColor:0xB45309,
        selectEdgeStrength:1,highlightEdgeStrength:1,ghostEdgeStrength:.3,edgeScale:1},
      cameraClipping:{radius:100,far:false,minNear:1}
    });
  }

  function select(instance, queries, options = {}){
    const loci = resolve(instance, queries), plugin = ready(instance);
    if(!plugin.managers?.interactivity?.lociSelects?.selectOnly || !plugin.managers?.camera?.focusLoci){
      throw new Error('Selection controls are unavailable in this viewer.');
    }
    style(plugin);
    // false prevents granularity settings from expanding a residue to its chain.
    plugin.managers.interactivity.lociSelects.selectOnly({loci}, false);
    if(options.focus !== false) plugin.managers.camera.focusLoci(loci,{minRadius:15,extraRadius:8,durationMs:250});
    return loci;
  }

  async function clear(instance, options = {}){
    const plugin = ready(instance);
    plugin.managers?.interactivity?.lociSelects?.deselectAll();
    if(instance.visual?.clearHighlight) await instance.visual.clearHighlight();
    if(options.resetCamera !== false && instance.visual?.reset) await instance.visual.reset({camera:true});
  }

  async function visibility(instance, queries, only){
    resolve(instance, queries);
    if(typeof instance.visual?.select !== 'function') throw new Error('Visibility controls are unavailable in this viewer.');
    const options = {
      // color:null is essential: otherwise PDBe applies its default orange colour.
      data:queries.map(q=>({...q,color:null,opacity:only ? 1 : 0,focus:false})),
      keepColors:true,keepRepresentations:true,keepOpacity:!only
    };
    if(only) options.nonSelectedOpacity=0;
    await instance.visual.select(options);
  }

  function hide(instance, queries){ return visibility(instance, queries, false); }
  function showOnly(instance, queries){ return visibility(instance, queries, true); }
  async function showAll(instance){
    ready(instance);
    if(typeof instance.visual?.clearSelection !== 'function') throw new Error('Visibility controls are unavailable in this viewer.');
    await instance.visual.clearSelection(undefined,{keepColors:true,keepRepresentations:true});
  }
  function setDepthCue(instance, enabled){
    const plugin=ready(instance);
    plugin.canvas3d.setProps({cameraFog:enabled ? {name:'on',params:{intensity:20}} : {name:'off',params:{}}});
  }

  return Object.freeze({select,clear,hide,showOnly,showAll,setDepthCue});
});
