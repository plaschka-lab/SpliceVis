    async function copyText(text, button){
      await navigator.clipboard.writeText(text);
      if(button){ button.classList.add("copied"); const old=button.textContent; button.textContent="Copied"; setTimeout(()=>{button.classList.remove("copied"); button.textContent=old;},1400); }
    }
    async function scriptFor(r, mode="no_maps"){
      if (!r) return "";
      const systematic = state.chainMode === "systematic";
      const path = mode === "primary_map"
        ? (systematic ? r.primary_map_script_systematic_path : r.primary_map_script_path)
        : (systematic ? r.script_systematic_path : r.script_path);
      const cacheKey = `${r.pdb_id}:${mode}:${state.chainMode}`;
      if (!path) throw new Error(`No ${mode === "primary_map" ? "primary-map" : "model-only"} script is available for ${r.pdb_id}`);
      if (!DATA.scriptCache[cacheKey]) {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Could not load ${path}: ${response.status}`);
        DATA.scriptCache[cacheKey] = await response.text();
      }
      return state.helperSource === "local" ? localizeHelperPaths(DATA.scriptCache[cacheKey]) : DATA.scriptCache[cacheKey];
    }
    function localizeHelperPaths(text){
      const root = (state.localRepoPath || ".").replace(/\/+$/, "");
      const prefix = root === "." ? "" : `${root}/`;
      return String(text || "").replace(/^open\s+https:\/\/(?:raw\.githubusercontent\.com\/plaschka-lab\/SpliceVis\/main\/|plaschka-lab\.github\.io\/SpliceVis\/)([^\s]+)/gm, (_, relative) => {
        const [path,query] = relative.split("?");
        const local = `${prefix}${decodeURIComponent(path)}`;
        const target = path.endsWith('.html') && local.startsWith('/') ? `file://${encodeURI(local)}${query?'?'+query:''}` : local;
        return `open "${target.replaceAll('"','\\"')}"`;
      });
    }
    function reportScriptError(error, button){
      if(button){ button.textContent="Copy failed - retry"; button.title=error.message; }
      const status=document.getElementById("molstarStatus");
      if(status) status.textContent=`ChimeraX script: ${error.message}`;
    }
    async function copyStructureScript(id, button, mode="no_maps"){
      const r = records.find(item => item.pdb_id === id);
      try{ await copyText(await scriptFor(r, mode), button); }
      catch(error){ reportScriptError(error, button); }
    }
    async function copyScriptFile(path, button){
      try{
        const response = await fetch(path);
        if(!response.ok) throw new Error(`Could not load ${path}: ${response.status}`);
        const text=await response.text();
        await copyText(state.helperSource === "local" ? localizeHelperPaths(text) : text, button);
      }catch(error){ reportScriptError(error, button); }
    }
    async function copyUniversalSystematicColoring(button){
      const text = DATA.universal_systematic_coloring_script || "";
      if(!text) throw new Error("Universal systematic coloring script is not available in this build.");
      await copyText(text, button);
    }
