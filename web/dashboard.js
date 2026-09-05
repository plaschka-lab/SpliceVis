
    const EMBEDDED_SPLICING_CYCLE_SVG = "";
    const DATA = { records: [], protein_lookup: [], primary_map_scripts: {}, proximity: {available:false, proteins:[]}, splicing_cycle_svg: "", guides: {rna_elements: [], protein_complexes: [], splicing_cycle: []}, universal_systematic_coloring_script: "", scriptCache: {} };
    let records = [];
    let proteinLookup = [];
    let rnaFeatureDefinitions = [];
    let rnaFeatureConsistency = [];
    const state = { activeTab:"structures", structureQuery:"", proteinQuery:"", mode:"all", family:"all", species:"all", substrateType:"all", rnaFeature:"all", rnaFeatureSearch:"", cyclePdbIds:[], cyclePdbLabel:"", rnaDefinitionQuery:"", proteinComplex:"all", helperSource:"github", localRepoPath:"", proximityResults:[], proximityQuerySummary:"", sortBy:"pathway", sortDir:"asc", chainMode:"original", selected: records[0]?.pdb_id || "", compareIds: [], molstarPdbId:"", molstarViewer:null, sidebarCollapsed:false, openPanelInNewTab:false, panelOnly:false, mobilePane:"cycle" };
    const els = {};
    for (const id of ["sidebarToggle","atlasNavButton","componentsNavButton","openPanelOnly","mobileViewSwitch","search","searchMode","family","species","substrateTypeFilter","rnaFeatureFilter","rnaFeatureQuickSearch","rnaFeatureQuickResults","rnaQuickFilters","activeFilterPanel","activeFilterChips","filterHint","rnaDefinitionSearch","rnaDefinitionRows","cycleStateGuide","rnaElementGuide","proteinComplexGuide","proteinComplexFilter","helperSource","localRepoPath","proximityView","proximityProtein","proximityProteinOptions","proximityStart","proximityEnd","proximityDistance","proximitySpecies","runProximitySearch","downloadProximityCsv","copyProximityCxc","proximityDeduplicate","proximityCoverage","proximityStatus","proximityRows","localCopyView","sortBy","reset","tabs","structuresView","rnaFeaturesView","cycleStatesView","rnaElementsView","complexesView","proteinsView","documentationView","helpView","stats","cycle","cycleContext","rows","detail","tableCount","resultSubtitle","selectedId","selectedScriptActions","proteinRows","proteinCount"]) els[id] = document.getElementById(id);
    const STAGES = ["U1 snRNP","U2 snRNP","U6 snRNP","U6 snRNA biogenesis","E complex","A complex","U5/tri-snRNP","pre-B","B","pre-Bact","Bact","B*","B*D complex","C","C*","P","ILS/disassembly","DIS","U5 recycling"];
    const ORDER = Object.fromEntries(STAGES.map((s,i)=>[s,i]));
    const STATE_COLORS = {
      "U1 snRNP":"#187A4A", "U2 snRNP":"#187A4A", "U6 snRNP":"#187A4A", "U6 snRNA biogenesis":"#187A4A", "U5/tri-snRNP":"#187A4A", "U5 recycling":"#006A2B",
      "E complex":"#356F7A", "A complex":"#2F6670", "pre-B":"#285B64",
      "B":"#1C428B", "pre-Bact":"#123483", "Bact":"#08277A",
      "B*":"#9B4664", "C":"#8E3F59", "C*":"#82364F",
      "P":"#8A574C", "ILS/disassembly":"#7C4C43", "DIS":"#6D4139",
      "B*D complex":"#66536A"
    };
    let molstarLoadPromise = null;
    let molstarPendingPdbId = "";
    let molstarAutoPreviewEnabled = false;
    let molstarGeneration = 0;
    let molstarLoadTask = null;
    let molstarAbort = null;
    let renderedDetailId = null;
    function esc(v){return String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
    function attr(v){return esc(v);}
    function unique(values){return [...new Set(values.filter(Boolean))].sort();}
    function formatResolution(value){
      if(value === null || value === undefined || value === "") return "";
      const number = Number.parseFloat(value);
      return Number.isFinite(number) ? number.toFixed(1) : String(value);
    }
    async function init(){
      const response = await fetch("data/structures.json?v=20260903-ui-guide-v2", {
        cache: "no-cache",
      });
      if (!response.ok) throw new Error(`Could not load data/structures.json: ${response.status}`);
      const payload = await response.json();
      DATA.records = payload.records || payload;
      DATA.protein_lookup = payload.protein_lookup || [];
      DATA.primary_map_scripts = payload.primary_map_scripts || {};
      DATA.proximity = payload.proximity || {available:false, proteins:[]};
      DATA.splicing_cycle_svg = payload.splicing_cycle_svg || EMBEDDED_SPLICING_CYCLE_SVG;
      DATA.guides = payload.guides || {rna_elements: [], protein_complexes: [], splicing_cycle: []};
      DATA.offline = Boolean(payload.offline);
      DATA.universal_systematic_coloring_script = payload.universal_systematic_coloring_script || "";
      rnaFeatureDefinitions = payload.rna_feature_definitions || [];
      rnaFeatureConsistency = payload.rna_feature_consistency || [];
      records = DATA.records;
      proteinLookup = DATA.protein_lookup;
      const params = new URLSearchParams(window.location.search);
      const panelPdb = String(params.get("panel") || params.get("structure") || "").trim().toLowerCase();
      const panelRecord = panelPdb ? records.find(r=>String(r.pdb_id).toLowerCase()===panelPdb) : null;
      state.panelOnly = Boolean(panelRecord);
      if(state.panelOnly) document.body.classList.add("structure-only");
      if(state.panelOnly) state.mobilePane = "detail";
      state.selected = (panelRecord || records.find(r=>String(r.pdb_id).toLowerCase()==="6ah0") || records.find(r=>String(r.pdb_id).toLowerCase()==="5zya") || records[0])?.pdb_id || "";
      molstarAutoPreviewEnabled = Boolean(state.selected);
      els.family.innerHTML = '<option value="all">All states</option>' + STAGES.map(s=>`<option value="${attr(s)}">${esc(s)}</option>`).join("");
      els.species.innerHTML = '<option value="all">All species</option>' + unique(records.map(r=>r.species)).map(s=>`<option>${esc(s)}</option>`).join("");
      const substrateTypes = unique(records.flatMap(r=>(r.substrate_types||[]).map(item=>item.family||item.type)).filter(value=>value && value!=="Other/unspecified substrate"));
      els.substrateTypeFilter.innerHTML = '<option value="all">All substrate types</option><option value="any">Any identified substrate</option><option value="review">Unspecified / needs review</option><option value="none">No substrate RNA identified</option>' + substrateTypes.map(value=>`<option value="${attr(value)}">${esc(value)}</option>`).join("");
      els.rnaFeatureFilter.innerHTML = rnaFeatureOptionData().map(x=>`<option value="${attr(x.value)}">${esc(x.label)}</option>`).join("");
      populateProteinComplexFilter();
      populateProximityProteins();
      populateProximitySpecies();
      renderRnaFeatureQuickSelect();
      bind();
      renderSidebarState();
      render();
    }
    function renderSidebarState(){
      const app = document.querySelector(".app");
      if(!app || !els.sidebarToggle) return;
      app.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
      els.sidebarToggle.textContent = state.sidebarCollapsed ? "Show sidebar" : "Hide sidebar";
      els.sidebarToggle.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
      requestAnimationFrame(fitCycleArt);
    }
    function fitCycleArt(){
      const art = els.cycle?.querySelector(".cycle-art");
      if(!art || !els.cycle) return;
      const box = els.cycle.getBoundingClientRect();
      if(!box.width || !box.height) return;
      const svg = art.querySelector("svg");
      const boxValue = svg?.getAttribute("viewBox")?.trim().split(/\s+/).map(Number) || [];
      const ratio = boxValue.length===4 && boxValue[2]>0 && boxValue[3]>0 ? boxValue[2]/boxValue[3] : 3000/2857;
      const width = Math.floor(Math.min(box.width, box.height * ratio));
      const height = Math.floor(width / ratio);
      art.style.width = `${width}px`;
      art.style.height = `${height}px`;
    }
    function populateProteinComplexFilter(){
      const groups = [
        ["snrnp_u1","U1 snRNP"], ["snrnp_u2","U2 snRNP and SF3B"],
        ["snrnp_tri","U4/U6 and tri-snRNP"], ["snrnp_u5","U5 snRNP"],
        ["sm_lsm","Sm and LSm rings"], ["ntc","NTC / PRP19 complex"],
        ["ntr","Activation and remodeling factors"], ["res","RES complex"],
        ["step2","Second-step factors"], ["ejc","EJC and mRNP factors"],
        ["disassembly","Disassembly and recycling"], ["other","Other or unclassified"]
      ];
      els.proteinComplexFilter.innerHTML = '<option value="all">All component groups</option>' + groups.map(([value,label])=>`<option value="${value}">${label}</option>`).join("");
    }
    function updateSearchContext(){
      const componentView = state.activeTab === "proteins";
      els.search.value = componentView ? state.proteinQuery : state.structureQuery;
      els.search.placeholder = componentView ? "Protein, homolog, alias, chain ID" : "PDB, title, state, author, species";
      els.search.setAttribute("aria-label", componentView ? "Find components" : "Find structures");
      const refine = document.querySelector(".refine-drawer");
      if(refine){ refine.hidden = componentView; if(componentView) refine.open = false; }
    }
    function setMobilePane(pane){
      state.mobilePane = ["cycle","structures","detail"].includes(pane) ? pane : "cycle";
      document.body.classList.remove("mobile-pane-cycle","mobile-pane-structures","mobile-pane-detail");
      document.body.classList.add(`mobile-pane-${state.mobilePane}`);
      if(els.mobileViewSwitch) for(const button of els.mobileViewSwitch.querySelectorAll("button")){
        const active = button.dataset.mobilePane === state.mobilePane;
        button.classList.toggle("active", active);
        if(active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      }
      requestAnimationFrame(fitCycleArt);
      requestAnimationFrame(() => {
        if(state.activeTab === "structures" && molstarAutoPreviewEnabled) autoLoadMolstarForSelected();
        window.dispatchEvent(new Event("resize"));
      });
    }
    function activateSort(header){
      const key=header.dataset.sort;
      if(!key)return;
      if(state.sortBy===key) state.sortDir=state.sortDir==="asc"?"desc":"asc";
      else { state.sortBy=key; state.sortDir=["year","chains","proteins","resolution"].includes(key)?"desc":"asc"; }
      if([...els.sortBy.options].some(option=>option.value===key)) els.sortBy.value = key;
      render();
    }
    function populateProximityProteins(){
      const proteins = DATA.proximity.proteins || [];
      els.proximityProteinOptions.innerHTML = proteins.map(p=>`<option value="${attr(p.name)}">${esc(p.name)} (${p.pdbs} PDBs)</option>`).join("");
      const maxDistance = Number(DATA.proximity.max_distance_a || 0);
      els.proximityDistance.max = maxDistance || "";
      els.proximityCoverage.textContent = DATA.proximity.available ? `${proteins.length} proteins; maximum ${maxDistance} Å cutoff` : "Proximity index not bundled";
      els.runProximitySearch.disabled = !DATA.proximity.available;
      if(!DATA.proximity.available) els.proximityStatus.textContent = "Proximity payloads are not available in this build.";
    }
    function populateProximitySpecies(){
      els.proximitySpecies.innerHTML = '<option value="all">All species</option>' + unique(records.map(r=>r.species)).map(s=>`<option value="${attr(s)}">${esc(s)}</option>`).join("");
    }
    function bind(){
      if(els.sidebarToggle) els.sidebarToggle.addEventListener("click",()=>{state.sidebarCollapsed=!state.sidebarCollapsed; renderSidebarState();});
      if(els.atlasNavButton) els.atlasNavButton.addEventListener("click",()=>showStartTab("structures"));
      if(els.componentsNavButton) els.componentsNavButton.addEventListener("click",()=>showStartTab("proteins"));
      window.addEventListener("resize",()=>requestAnimationFrame(fitCycleArt));
      els.openPanelOnly.addEventListener("change",()=>{state.openPanelInNewTab=els.openPanelOnly.checked;});
      els.search.addEventListener("input",()=>{
        const query=els.search.value.trim().toLowerCase();
        if(state.activeTab === "proteins") state.proteinQuery=query;
        else state.structureQuery=query;
        if(state.activeTab === "structures" && state.structureQuery){ state.family="all"; state.cyclePdbIds=[]; state.cyclePdbLabel=""; els.family.value="all"; }
        if(state.activeTab === "structures" && query) state.mobilePane="structures";
        render();
      });
      els.searchMode.addEventListener("change",()=>{state.mode=els.searchMode.value; render();});
      els.family.addEventListener("change",()=>{state.family=els.family.value; state.cyclePdbIds=[]; state.cyclePdbLabel=""; render();});
      els.species.addEventListener("change",()=>{state.species=els.species.value; render();});
      els.substrateTypeFilter.addEventListener("change",()=>{state.substrateType=els.substrateTypeFilter.value; render();});
      els.rnaFeatureFilter.addEventListener("change",()=>{setRnaFeatureFilter(els.rnaFeatureFilter.value);});
      els.rnaFeatureQuickSearch.addEventListener("input",()=>{state.rnaFeatureSearch=els.rnaFeatureQuickSearch.value; renderRnaFeatureQuickSelect();});
      els.rnaFeatureQuickSearch.addEventListener("keydown",event=>{if(event.key!=="Enter")return; const match=rnaFeatureOptionData(state.rnaFeatureSearch).find(x=>x.value!=="all"); if(!match)return; event.preventDefault(); setRnaFeatureFilter(match.value);});
      els.rnaFeatureQuickResults.addEventListener("click",event=>{const b=event.target.closest("button[data-rna-feature-value]"); if(!b)return; setRnaFeatureFilter(b.dataset.rnaFeatureValue);});
      els.rnaQuickFilters.addEventListener("click",event=>{const b=event.target.closest("button[data-rna-feature]"); if(!b)return; setRnaFeatureFilter(state.rnaFeature===b.dataset.rnaFeature ? "all" : b.dataset.rnaFeature);});
      els.activeFilterChips.addEventListener("click",event=>{const b=event.target.closest("button[data-clear-filter]"); if(!b)return; clearFilter(b.dataset.clearFilter);});
      els.rnaDefinitionSearch.addEventListener("input",()=>{state.rnaDefinitionQuery=els.rnaDefinitionSearch.value.trim().toLowerCase(); renderRnaFeatureDefinitions();});
      els.proteinComplexFilter.addEventListener("change",()=>{state.proteinComplex=els.proteinComplexFilter.value; renderProteins();});
      els.helperSource.addEventListener("change",()=>{state.helperSource=els.helperSource.value; render();});
      els.localRepoPath.addEventListener("input",()=>{state.localRepoPath=els.localRepoPath.value.trim(); render();});
      els.sortBy.addEventListener("change",()=>{state.sortBy=els.sortBy.value; state.sortDir = ["year","chains","proteins","resolution"].includes(state.sortBy) ? "desc" : "asc"; render();});
      els.tabs.addEventListener("click",event=>{const b=event.target.closest("button"); if(!b)return; state.activeTab=b.dataset.tab; for(const x of els.tabs.querySelectorAll("button")) x.classList.toggle("active",x===b); if(els.atlasNavButton) els.atlasNavButton.classList.toggle("active",state.activeTab==="structures"); if(els.componentsNavButton) els.componentsNavButton.classList.toggle("active",state.activeTab==="proteins"); const drawer=b.closest(".tools-drawer"); if(drawer) drawer.open=false; render();});
      document.addEventListener("click", event=>{const th=event.target.closest("th[data-sort]"); if(th) activateSort(th);});
      document.addEventListener("keydown", event=>{const th=event.target.closest("th[data-sort]"); if(!th || !["Enter"," "].includes(event.key))return; event.preventDefault(); activateSort(th);});
      if(els.mobileViewSwitch) els.mobileViewSwitch.addEventListener("click",event=>{const button=event.target.closest("button[data-mobile-pane]"); if(button)setMobilePane(button.dataset.mobilePane);});
      els.runProximitySearch.addEventListener("click", runProximitySearch);
      els.copyProximityCxc.addEventListener("click",async()=>copyText(await proximityChimeraXScript(), els.copyProximityCxc));
      els.downloadProximityCsv.addEventListener("click", downloadProximityCsv);
      els.proximityDeduplicate.addEventListener("change", updateProximityResultPresentation);
      els.proximitySpecies.addEventListener("change", updateProximityResultPresentation);
      for(const input of [els.proximityProtein, els.proximityStart, els.proximityEnd, els.proximityDistance]) input.addEventListener("keydown", event=>{if(event.key==="Enter"){event.preventDefault(); runProximitySearch();}});
      els.proximityRows.addEventListener("click", event=>{const b=event.target.closest("button[data-proximity-pdb]"); if(!b)return; state.selected=b.dataset.proximityPdb; state.activeTab="structures"; for(const x of els.tabs.querySelectorAll("button")) x.classList.toggle("active",x.dataset.tab==="structures"); render();});
      els.reset.addEventListener("click",()=>{state.structureQuery=""; state.mode="all"; state.family="all"; state.species="all"; state.substrateType="all"; state.rnaFeature="all"; state.rnaFeatureSearch=""; state.cyclePdbIds=[]; state.cyclePdbLabel=""; state.rnaDefinitionQuery=""; state.sortBy="pathway"; state.sortDir="asc"; els.search.value=""; els.searchMode.value="all"; els.family.value="all"; els.species.value="all"; els.substrateTypeFilter.value="all"; els.rnaFeatureFilter.value="all"; els.rnaFeatureQuickSearch.value=""; renderRnaFeatureQuickSelect(); els.rnaDefinitionSearch.value=""; els.sortBy.value="pathway"; render();});
    }
    function fieldsFor(r){
      return {
        structure:[r.pdb_id,r.title,r.state,r.species,...(r.substrate_types||[]).flatMap(item=>[item.type,item.family])],
        paper:[r.paper_title,r.abstract,r.doi,r.pubmed_id,r.journal,r.authors],
        author:[r.authors],
        component:[...r.proteins.map(p=>`${p.gene} ${p.name}`),...r.rnas.map(x=>x.name),...(r.substrate_features||[]).map(x=>`${x.feature} ${x.label} ${x.feature_sequence}`),...(r.snrna_features||[]).map(x=>`${x.snrna} ${x.feature} ${x.label} ${x.feature_sequence}`)],
        all:[r.pdb_id,r.title,r.state,r.species,r.paper_title,r.abstract,r.doi,r.pubmed_id,r.journal,r.authors,...(r.substrate_types||[]).flatMap(item=>[item.type,item.family,item.molecule_name]),...r.proteins.map(p=>`${p.gene} ${p.name}`),...r.rnas.map(x=>x.name),...(r.substrate_features||[]).map(x=>`${x.feature} ${x.label} ${x.feature_sequence}`),...(r.snrna_features||[]).map(x=>`${x.snrna} ${x.feature} ${x.label} ${x.feature_sequence}`)]
      };
    }
    function exactStageForQuery(query){
      const needle=String(query||"").trim().toLowerCase();
      if(!needle)return "";
      return STAGES.find(stage=>{const label=stage.toLowerCase(); return needle===label || needle===label.replace(/\s+complex$/,"") || needle===label.split("/")[0];}) || "";
    }
    function rnaFeatureOk(r){
      const value = state.rnaFeature;
      const substrate = r.substrate_features || [];
      const snrna = r.snrna_features || [];
      if(value==="all") return true;
      if(value==="any") return substrate.length || snrna.length;
      if(value==="substrate") return substrate.length;
      if(value==="snrna") return snrna.length;
      if(value==="both") return substrate.length && snrna.length;
      if(value==="none") return !substrate.length && !snrna.length;
      if(value.startsWith("feature:")) return [...substrate,...snrna].some(x=>x.feature===value.slice(8));
      return true;
    }
    function rnaFeatureOptionData(query=""){
      const general=[
        {value:"all", label:"All RNA feature states", search:"all"},
        {value:"any", label:"Any RNA features annotated", search:"any annotated"},
        {value:"substrate", label:"Any (pre-)mRNA features", search:"substrate pre-mRNA mRNA"},
        {value:"snrna", label:"Any snRNA features", search:"snRNA"},
        {value:"both", label:"Both (pre-)mRNA and snRNA features", search:"both substrate snRNA"},
        {value:"none", label:"No RNA feature annotations", search:"none unannotated"}
      ];
      const labels=new Map();
      for(const row of rnaFeatureDefinitions) if(row.feature) labels.set(row.feature, row.label||row.feature);
      for(const record of records) for(const item of [...(record.substrate_features||[]),...(record.snrna_features||[])]) if(item.feature && !labels.has(item.feature)) labels.set(item.feature, fallbackRnaFeatureLabel(item));
      const features=[...labels.entries()].map(([feature,label])=>({value:`feature:${feature}`, label, search:`${feature} ${label}`})).sort((a,b)=>a.label.localeCompare(b.label)||a.value.localeCompare(b.value));
      const options=[...general,...features];
      const needle=(query||"").trim().toLowerCase();
      return needle ? options.filter(x=>`${x.label} ${x.value} ${x.search}`.toLowerCase().includes(needle)) : options;
    }
    function fallbackRnaFeatureLabel(item){
      const label = item.label || item.feature || "";
      const snrna = String(item.snrna || "").replace(/\s+snRNA$/i, "");
      if(snrna && /^(Sm site|LSm site|stem-loop 1|stem-loop 2|internal stem-loop)$/i.test(label)) return `${snrna} ${label}`;
      return label;
    }
    function renderRnaFeatureQuickSelect(){
      let options=rnaFeatureOptionData(state.rnaFeatureSearch);
      if(state.rnaFeature!=="all" && !options.some(x=>x.value===state.rnaFeature)){
        const current=rnaFeatureOptionData().find(x=>x.value===state.rnaFeature);
        if(current) options=[current,...options];
      }
      const shown=options.slice(0,28);
      els.rnaFeatureQuickResults.innerHTML = shown.length ? shown.map(x=>`<button type="button" class="rna-feature-result ${x.value===state.rnaFeature?"active":""}" data-rna-feature-value="${attr(x.value)}" title="${attr(x.label)}">${esc(x.label)}</button>`).join("") + (options.length>shown.length?`<span class="subtle">+${options.length-shown.length} more matches</span>`:"") : '<span class="subtle">No matching RNA feature filters.</span>';
    }
    function rnaFeatureOptionByValue(value){ return rnaFeatureOptionData().find(x=>x.value===value); }
    function setRnaFeatureFilter(value){
      state.rnaFeature = value || "all";
      els.rnaFeatureFilter.value = state.rnaFeature;
      const selected = rnaFeatureOptionByValue(state.rnaFeature);
      state.rnaFeatureSearch = state.rnaFeature === "all" ? "" : (selected?.label || "");
      els.rnaFeatureQuickSearch.value = state.rnaFeatureSearch;
      renderRnaFeatureQuickSelect();
      render();
    }
    function clearFilter(name){
      if(name==="query"){ state.structureQuery=""; els.search.value=""; }
      else if(name==="family"){ state.family="all"; els.family.value="all"; }
      else if(name==="cyclePdb"){ state.cyclePdbIds=[]; state.cyclePdbLabel=""; }
      else if(name==="species"){ state.species="all"; els.species.value="all"; }
      else if(name==="substrateType"){ state.substrateType="all"; els.substrateTypeFilter.value="all"; }
      else if(name==="rnaFeature"){ state.rnaFeature="all"; state.rnaFeatureSearch=""; els.rnaFeatureFilter.value="all"; els.rnaFeatureQuickSearch.value=""; renderRnaFeatureQuickSelect(); }
      render();
    }
    function rnaFeatureLabel(value){
      if(value==="all") return "All RNA features";
      if(value==="any") return "Any RNA feature";
      if(value==="substrate") return "(pre-)mRNA annotated";
      if(value==="snrna") return "snRNA annotated";
      if(value==="both") return "(pre-)mRNA and snRNA annotated";
      if(value==="none") return "No RNA features";
      if(value.startsWith("feature:")){
        const feature = value.slice(8);
        const definition = rnaFeatureDefinitions.find(x=>x.feature===feature);
        return definition?.label || feature;
      }
      return value;
    }
    function renderActiveFilterChips(){
      const chips = [];
      if(state.structureQuery) chips.push(["query", `Search: ${state.structureQuery}`]);
      if(state.family!=="all") chips.push(["family", `State: ${state.family}`]);
      if(state.cyclePdbIds.length) chips.push(["cyclePdb", `Cycle: ${state.cyclePdbLabel || state.cyclePdbIds.map(id=>id.toUpperCase()).join(", ")}`]);
      if(state.species!=="all") chips.push(["species", `Species: ${state.species}`]);
      if(state.substrateType!=="all") chips.push(["substrateType", `Substrate: ${state.substrateType}`]);
      if(state.rnaFeature!=="all") chips.push(["rnaFeature", `RNA: ${rnaFeatureLabel(state.rnaFeature)}`]);
      if(els.activeFilterPanel) els.activeFilterPanel.hidden = !chips.length;
      els.activeFilterChips.innerHTML = chips.map(([key,label])=>`<button type="button" class="filter-chip" data-clear-filter="${attr(key)}" title="Clear this filter">${esc(label)} x</button>`).join("");
      if(els.filterHint) els.filterHint.textContent = chips.length ? "Remove a chip or clear all to broaden the atlas." : "";
      for(const button of els.rnaQuickFilters.querySelectorAll("button[data-rna-feature]")) button.classList.toggle("active", button.dataset.rnaFeature===state.rnaFeature);
    }
    function hasActiveStructureFilters(){
      return Boolean(state.structureQuery || state.family!=="all" || state.cyclePdbIds.length || state.species!=="all" || state.substrateType!=="all" || state.rnaFeature!=="all");
    }
    function substrateTypeOk(r){
      const value=state.substrateType;
      if(value==="all") return true;
      const rows=r.substrate_types||[];
      if(value==="none") return !rows.length;
      if(value==="any") return rows.some(item=>item.family && item.family!=="Other/unspecified substrate");
      if(value==="review") return rows.some(item=>item.family==="Other/unspecified substrate" || item.confidence==="review");
      return rows.some(item=>item.family===value || item.type===value);
    }
    function filtered(options = {}){
      const exactStage=exactStageForQuery(state.structureQuery);
      return records.filter(r=>{
        const fields = fieldsFor(r);
        const parts = state.mode === "all" ? fields.all : [...fields.structure, ...(fields[state.mode] || [])];
        const hay = parts.join(" ").toLowerCase();
        const familyOk = options.ignoreFamily || state.family==="all" || r.state===state.family;
        const cycleOk = options.ignoreCyclePdb || !state.cyclePdbIds.length || state.cyclePdbIds.includes(String(r.pdb_id || "").toLowerCase());
        const queryOk = !state.structureQuery || (exactStage ? r.state===exactStage : hay.includes(state.structureQuery));
        return queryOk && familyOk && cycleOk && (state.species==="all" || r.species===state.species) && substrateTypeOk(r) && rnaFeatureOk(r);
      }).sort((a,b)=>{
        let value = 0;
        if(state.sortBy==="resolution") value = (parseFloat(a.resolution)||99)-(parseFloat(b.resolution)||99);
        else if(state.sortBy==="year") value = (parseInt(a.year)||0)-(parseInt(b.year)||0);
        else if(state.sortBy==="pdb") value = a.pdb_id.localeCompare(b.pdb_id);
        else if(state.sortBy==="chains") value = (a.chain_count||0)-(b.chain_count||0);
        else if(state.sortBy==="proteins") value = (a.protein_count||0)-(b.protein_count||0);
        else if(state.sortBy==="species") value = String(a.species).localeCompare(String(b.species));
        else if(state.sortBy==="title") value = String(a.title).localeCompare(String(b.title));
        else if(state.sortBy==="state") value = String(a.state).localeCompare(String(b.state));
        else if(state.sortBy==="substrate") value = substrateTypeLabel(a).localeCompare(substrateTypeLabel(b));
        else value = (ORDER[a.state]??99)-(ORDER[b.state]??99) || a.pdb_id.localeCompare(b.pdb_id);
        if(value === 0) value = a.pdb_id.localeCompare(b.pdb_id);
        return state.sortDir === "desc" ? -value : value;
      });
    }
    function render(){
      updateSearchContext();
      setMobilePane(state.mobilePane);
      if(els.atlasNavButton){ const active=state.activeTab === "structures"; els.atlasNavButton.classList.toggle("active",active); els.atlasNavButton.setAttribute("aria-pressed",String(active)); }
      if(els.componentsNavButton){ const active=state.activeTab === "proteins"; els.componentsNavButton.classList.toggle("active",active); els.componentsNavButton.setAttribute("aria-pressed",String(active)); }
      els.structuresView.hidden = state.activeTab !== "structures";
      els.proximityView.hidden = state.activeTab !== "proximity";
      els.rnaFeaturesView.hidden = state.activeTab !== "rnaFeatures";
      els.cycleStatesView.hidden = state.activeTab !== "cycleStates";
      els.rnaElementsView.hidden = state.activeTab !== "rnaElements";
      els.complexesView.hidden = state.activeTab !== "complexes";
      els.proteinsView.hidden = state.activeTab !== "proteins";
      els.documentationView.hidden = state.activeTab !== "documentation";
      els.helpView.hidden = state.activeTab !== "help";
      els.localCopyView.hidden = state.activeTab !== "localCopy";
      if(state.activeTab === "proximity") {
        els.resultSubtitle.textContent = proximityDisplayResults().length ? `${proximityDisplayResults().length} proximity matches` : "Spatial search across indexed public structures";
        return;
      }
      if(state.activeTab === "proteins") { renderProteins(); return; }
      if(state.activeTab === "rnaFeatures") {
        renderRnaFeatureDefinitions();
        els.resultSubtitle.textContent = `${rnaFeatureDefinitions.length} RNA feature definitions`;
        return;
      }
      if(state.activeTab === "cycleStates") {
        renderGuideCards(els.cycleStateGuide, DATA.guides.splicing_cycle || [], "name", ["stage","composition","transition","notes"]);
        els.resultSubtitle.textContent = `${(DATA.guides.splicing_cycle || []).length} splicing-cycle state explanations`;
        return;
      }
      if(state.activeTab === "rnaElements") {
        renderGuideCards(els.rnaElementGuide, DATA.guides.rna_elements || [], "name", ["function","interactors","remodeling","helicases"], "category");
        els.resultSubtitle.textContent = `${(DATA.guides.rna_elements || []).length} RNA element explanations`;
        return;
      }
      if(state.activeTab === "complexes") {
        renderProteinComplexGuide();
        els.resultSubtitle.textContent = `${(DATA.guides.protein_complexes || []).length} protein complex explanations`;
        return;
      }
      if(state.activeTab === "documentation") {
        els.resultSubtitle.textContent = "Features, UI, and methodology";
        return;
      }
      if(state.activeTab === "help") {
        els.resultSubtitle.textContent = "Dashboard badges and conventions";
        return;
      }
      if(state.activeTab === "localCopy") {
        els.resultSubtitle.textContent = "Create a model-only offline copy, with optional primary-map add-on";
        return;
      }
      const rows = filtered();
      if(!rows.some(r=>r.pdb_id===state.selected)) state.selected = rows[0]?.pdb_id || "";
      renderStats(rows);
      renderCycle(filtered({ignoreFamily:true, ignoreCyclePdb:true}));
      renderActiveFilterChips();
      renderRows(rows);
      updateSortHeaders();
      renderDetail(records.find(r=>r.pdb_id===state.selected));
      if(molstarAutoPreviewEnabled) autoLoadMolstarForSelected();
    }

    function updateSortHeaders(){
      document.querySelectorAll("th[data-sort]").forEach(th=>{
        const active = th.dataset.sort === state.sortBy;
        th.classList.toggle("sorted-asc", active && state.sortDir === "asc");
        th.classList.toggle("sorted-desc", active && state.sortDir === "desc");
        th.setAttribute("aria-sort", active ? (state.sortDir === "asc" ? "ascending" : "descending") : "none");
        th.title = active ? `Sorted ${state.sortDir === "asc" ? "ascending" : "descending"}; activate to reverse` : "Activate to sort this column";
      });
    }
    function renderStats(rows){
      const species = unique(rows.map(r=>r.species)).length;
      const mean = rows.length ? rows.reduce((s,r)=>s+(parseFloat(r.resolution)||0),0) / rows.filter(r=>parseFloat(r.resolution)).length : 0;
      els.stats.innerHTML = `<div class="stat"><strong>${rows.length}</strong><span class="subtle">matching structures</span></div><div class="stat"><strong>${species}</strong><span class="subtle">species</span></div><div class="stat"><strong>${mean?mean.toFixed(1):"?"} A</strong><span class="subtle">mean resolution</span></div><div class="stat"><strong>${rows.reduce((m,r)=>Math.max(m,r.chain_count||0),0)}</strong><span class="subtle">max chains</span></div>`;
      els.resultSubtitle.textContent = `${rows.length} of ${records.length} deposited PDB entries`;
      els.tableCount.textContent = `${rows.length} shown`;
    }
    function cycleHotspots(){
      return [
        {label:"snRNP/protein pool", stages:["U1 snRNP","U2 snRNP","U6 snRNP","U6 snRNA biogenesis","U5/tri-snRNP","U5 recycling"], x:39.0, y:5.0, w:16.0, h:23.0},
        {stage:"E complex", label:"E complex", x:18.0, y:18.0, w:16.0, h:14.0},
        {stage:"A complex", label:"A complex", x:10.0, y:30.0, w:17.0, h:14.0},
        {stage:"pre-B", label:"pre-B", x:8.0, y:43.0, w:18.0, h:15.0},
        {stage:"B", label:"B complex", x:10.0, y:56.0, w:19.0, h:15.0},
        {stage:"pre-Bact", label:"pre-Bact", x:20.0, y:68.0, w:18.0, h:15.0},
        {stage:"Bact", label:"Bact", x:32.0, y:74.0, w:17.0, h:15.0},
        {stage:"B*", label:"B*", x:46.0, y:73.0, w:16.0, h:14.0},
        {stage:"B*D complex", label:"B*D quality-control discard", x:48.0, y:85.0, w:17.0, h:14.0},
        {stage:"C", label:"C complex", x:58.0, y:66.0, w:17.0, h:15.0},
        {stage:"C*", label:"C*", x:68.0, y:52.0, w:17.0, h:16.0},
        {stage:"P", label:"P complex", x:72.0, y:39.0, w:16.0, h:15.0},
        {stage:"ILS/disassembly", label:"ILS", x:69.0, y:25.0, w:17.0, h:15.0},
        {stage:"DIS", label:"DIS", x:60.0, y:14.0, w:16.0, h:15.0},
      ];
    }
    function cycleHotspotStyle(x){ return `left:${x.x}%; top:${x.y}%; width:${x.w}%; height:${x.h}%;`; }
    function cycleHotspotCount(item, rows){
      if(item.pdbs){ const visible=new Set(rows.map(r=>String(r.pdb_id||"").toLowerCase())); return item.pdbs.filter(id=>visible.has(id.toLowerCase())).length; }
      if(item.stages) return rows.filter(r=>item.stages.includes(r.state)).length;
      return rows.filter(r=>r.state===item.stage).length;
    }
    function cycleHotspotActive(item){
      if(item.pdbs || item.stages){
        const ids=item.pdbs ? item.pdbs.map(id=>id.toLowerCase()) : records.filter(r=>item.stages.includes(r.state)).map(r=>String(r.pdb_id).toLowerCase());
        return ids.sort().join("|") === state.cyclePdbIds.slice().sort().join("|");
      }
      return !state.cyclePdbIds.length && state.family===item.stage;
    }
    function activateCycleHotspot(item){
      if(item.pdbs || item.stages){
        const ids=item.pdbs ? item.pdbs.map(id=>id.toLowerCase()) : records.filter(r=>item.stages.includes(r.state)).map(r=>String(r.pdb_id).toLowerCase());
        const active=cycleHotspotActive(item);
        state.family="all"; els.family.value="all";
        state.cyclePdbIds=active?[]:ids;
        state.cyclePdbLabel=active?"":item.label;
      } else {
        state.cyclePdbIds=[]; state.cyclePdbLabel="";
        state.family = state.family===item.stage ? "all" : item.stage;
        els.family.value=state.family;
      }
      state.mobilePane="structures";
      render();
    }
    function cycleHoverInfo(item,count){
      if(item.stages) return {
        title:item.label,
        count,
        rna:"Isolated U1, U2, U6 and tri-snRNP particles plus recycling and biogenesis assemblies.",
        helicase:"Prp43/DHX15 returns reusable components during late disassembly.",
        change:"Mature particles enter assembly; released snRNPs and proteins return here."
      };
      const guide=stateGuideFor(item.stage) || {};
      return {
        title:item.label,
        count,
        rna:guide.hover_rna || guide.composition || "No concise RNA-network description is available.",
        helicase:guide.hover_helicase || "No principal ATPase assigned to this deposited state.",
        change:guide.hover_change || guide.transition || "See the state guide for transition details."
      };
    }
    function cycleTooltipHtml(item,count){
      const info=cycleHoverInfo(item,count);
      const side=item.x >= 55 ? " tooltip-left" : "";
      const vertical=item.y >= 65 ? " tooltip-above" : "";
      return `<span class="cycle-tooltip${side}${vertical}" role="tooltip"><span class="cycle-tooltip-title"><span>${esc(info.title)}</span></span><span class="cycle-tooltip-row"><span class="cycle-tooltip-label">RNA</span><span>${esc(info.rna)}</span></span><span class="cycle-tooltip-row"><span class="cycle-tooltip-label">Helicase</span><span>${esc(info.helicase)}</span></span><span class="cycle-tooltip-row"><span class="cycle-tooltip-label">Change</span><span>${esc(info.change)}</span></span></span>`;
    }
    function renderSvgCycle(rows){
      const svg=DATA.splicing_cycle_svg || "";
      if(!svg){ els.cycle.innerHTML='<div class="subtle">Splicing cycle SVG was not embedded during dashboard generation.</div>'; return; }
      const hotspots=cycleHotspots();
      els.cycle.innerHTML = `<div class="cycle-art" aria-label="Splicing cycle pathway filter">${svg}${hotspots.map((item,i)=>{ const count=cycleHotspotCount(item, rows); const active=cycleHotspotActive(item); const info=cycleHoverInfo(item,count); const label=`${info.title}, ${info.count} structures. RNA: ${info.rna} Helicase: ${info.helicase} Change: ${info.change}`; return `<button type="button" class="cycle-hotspot ${active?"active":""} ${count?"":"empty-stage"}" data-cycle-hotspot="${i}" style="${cycleHotspotStyle(item)}" aria-label="${attr(label)}">${cycleTooltipHtml(item,count)}</button>`; }).join("")}</div>`;
      fitCycleArt();
      for(const button of els.cycle.querySelectorAll("[data-cycle-hotspot]")) button.addEventListener("click",()=>activateCycleHotspot(hotspots[Number(button.dataset.cycleHotspot)]));
    }
    function renderCycle(rows){
      renderSvgCycle(rows);
      renderCycleContext(rows);
    }
    function stateGuideFor(stage){
      const aliases={"pre-b":"pre-b complex","b":"b complex","pre-bact":"pre-bact complex","bact":"bact complex","b*":"b* complex","b*d complex":"b*d complex","c":"c complex","c*":"c* complex","p":"p complex","ils/disassembly":"ils","dis":"dis","u5 recycling":"u5 recycling"};
      const value=String(stage||"").toLowerCase();
      if(!value) return null;
      const wanted=aliases[value] || value;
      const guides=DATA.guides.splicing_cycle || [];
      const fieldsForGuide=item=>[item.name,item.stage,item.complex,item.label].map(x=>String(x||"").toLowerCase()).filter(Boolean);
      return guides.find(item=>fieldsForGuide(item).includes(wanted)) || null;
    }
    function renderCycleContext(rows){
      if(!els.cycleContext) return;
      const shownRows = filtered();
      const explicitStage = state.family !== "all" ? state.family : "";
      const stage = explicitStage || state.cyclePdbLabel || "";
      const guide = explicitStage ? stateGuideFor(explicitStage) : null;
      const countLabel = `${shownRows.length} shown`;
      const title = stage || "All pathway states";
      const context = guide?.composition || guide?.notes || (state.cyclePdbLabel ? "Curated structures grouped in this pathway hotspot." : "Click a state in the cycle to filter the associated structures below; selecting a row opens the 3D viewer and ChimeraX controls.");
      const transition = guide?.transition || guide?.helicases || "";
      els.cycleContext.innerHTML = `<div class="context-title"><span>${esc(title)}</span><span class="subtle">${esc(countLabel)}</span></div><div class="context-label">Context</div><div class="context-line">${esc(context)}</div>${transition && transition !== context ? `<div class="context-label">Transition</div><div class="context-line">${esc(transition)}</div>` : ""}`;
    }
    function renderRows(rows){
      if(!rows.length){
        const message = hasActiveStructureFilters()
          ? "No deposited structures match the current filters. Remove an active filter chip or use Clear all to broaden the search."
          : "No deposited structures are available for this view.";
        els.rows.innerHTML = `<tr><td colspan="13" class="empty-state"><strong>No structures shown</strong>${esc(message)}</td></tr>`;
        return;
      }
      els.rows.innerHTML = rows.map(r=>{ const inCompare=state.compareIds.includes(r.pdb_id); const selected=r.pdb_id===state.selected; const pdbe=r.pdbe_url || `https://www.ebi.ac.uk/pdbe/entry/pdb/${r.pdb_id}`; const meta=[r.species, `${r.protein_count||0} protein`, `${r.rna_count||0} RNA`].filter(Boolean).join(" / "); const pdbColor=stateColor(r.state); const substrate=substrateTypeLabel(r); return `<tr class="${selected?"selected":""}" data-pdb="${attr(r.pdb_id)}" tabindex="0" aria-selected="${selected}" aria-label="Select ${attr(r.pdb_id.toUpperCase())}: ${attr(r.title)}"><td class="pdb"><a href="?structure=${attr(r.pdb_id)}" title="Select this structure" onclick="event.preventDefault()" style="--state-color:${attr(pdbColor)}">${esc(r.pdb_id)}</a></td><td class="preview-cell">${tableThumbnail(r)}</td><td>${esc(r.species)}</td><td class="title-cell"><div class="truncate" title="${attr(r.title)}">${esc(r.title)}</div><div class="row-card-meta">${esc(meta)}</div></td><td><div>${esc(r.state)}</div>${minorSpliceosomeBadge(r)}</td><td title="${attr(substrate)}">${esc(substrate)}</td><td>${esc(formatResolution(r.resolution))}</td><td>${esc(r.year||"")}</td><td>${r.chain_count||0}</td><td>${r.protein_count} protein<br>${r.rna_count} RNA</td><td class="rna-badge-cell">${rnaAnnotationBadges(r)}</td><td>${curationBadges(r, false)}</td><td><button type="button" class="compare-toggle ${inCompare?"active":""}" data-compare="${attr(r.pdb_id)}">${inCompare?"On":"Add"}</button></td></tr>`; }).join("");
      const selectRow = row => {
        if(state.openPanelInNewTab){ window.open(structurePanelUrl(row.dataset.pdb), "_blank", "noopener"); return; }
        state.selected = row.dataset.pdb;
        state.mobilePane = "detail";
        molstarAutoPreviewEnabled = true;
        render();
        autoLoadMolstarForSelected();
      };
      for (const row of els.rows.querySelectorAll("tr")) {
        row.addEventListener("click", event => {
          const button = event.target.closest("[data-compare]");
          if (button) { toggleCompare(button.dataset.compare); event.stopPropagation(); return; }
          selectRow(row);
        });
        row.addEventListener("keydown", event=>{
          if(event.target.closest("a,button,input,select") || !["Enter"," "].includes(event.key))return;
          event.preventDefault();
          selectRow(row);
        });
      }
    }
    function substrateTypeLabel(r){
      const values=unique((r.substrate_types||[]).map(item=>item.family||item.type).filter(Boolean));
      if(!values.length) return "none";
      return values.map(value=>value==="Other/unspecified substrate"?"Unspecified":value).join(", ");
    }
    function structurePanelUrl(pdbId){
      const url = new URL(window.location.href);
      url.searchParams.set("panel", String(pdbId || "").toLowerCase());
      return url.toString();
    }
    function stateColor(stage){
      return STATE_COLORS[String(stage || "")] || "#0b5cab";
    }
    const proximityLoadPromises = new Map();
    window.SPLICEOSOME_PROXIMITY = window.SPLICEOSOME_PROXIMITY || {};
    function proximityCatalogEntry(query){
      const needle = String(query||"").trim().toLowerCase();
      if(!needle) return null;
      const exact = (DATA.proximity.proteins||[]).find(p=>String(p.name).toLowerCase()===needle);
      if(exact) return exact;
      const aliases = [];
      for(const p of proteinLookup){
        const values = [p.human_gene,p.color_key,...(p.aliases||[])].filter(Boolean).map(x=>String(x).toLowerCase());
        if(!values.includes(needle)) continue;
        aliases.push(...(DATA.proximity.proteins||[]).filter(entry=>values.includes(String(entry.name).toLowerCase())));
      }
      if(aliases.length===1) return aliases[0];
      const matches = (DATA.proximity.proteins||[]).filter(p=>String(p.name).toLowerCase().includes(needle));
      return matches.length===1 ? matches[0] : null;
    }
    function loadProximityPayload(entry){
      if(window.SPLICEOSOME_PROXIMITY[entry.name]) return Promise.resolve(window.SPLICEOSOME_PROXIMITY[entry.name]);
      if(proximityLoadPromises.has(entry.name)) return proximityLoadPromises.get(entry.name);
      const promise = new Promise((resolve,reject)=>{
        const script=document.createElement("script");
        script.src=entry.path;
        script.onload=()=>{const payload=window.SPLICEOSOME_PROXIMITY[entry.name]; payload?resolve(payload):reject(new Error("Loaded proximity file did not register the selected protein."));};
        script.onerror=()=>reject(new Error(`Could not load ${entry.path}`));
        document.head.appendChild(script);
      });
      proximityLoadPromises.set(entry.name,promise);
      return promise;
    }
    async function runProximitySearch(){
      const entry = proximityCatalogEntry(els.proximityProtein.value);
      const startInput=Number(els.proximityStart.value);
      const endInput=Number(els.proximityEnd.value);
      const distance=Number(els.proximityDistance.value);
      const maxDistance=Number(DATA.proximity.max_distance_a||0);
      if(!entry){ els.proximityStatus.textContent="Choose one protein identity from the available list."; return; }
      if(!Number.isInteger(startInput)||!Number.isInteger(endInput)){ els.proximityStatus.textContent="Enter integer residue numbers for both ends of the range."; return; }
      if(!(distance>0)||distance>maxDistance){ els.proximityStatus.textContent=`Enter a distance greater than 0 and no more than ${maxDistance} A.`; return; }
      const start=Math.min(startInput,endInput), end=Math.max(startInput,endInput);
      const recordByPdb=new Map(records.map(r=>[r.pdb_id,r]));
      els.proximityProtein.value=entry.name;
      els.runProximitySearch.disabled=true;
      els.proximityStatus.textContent=`Loading ${entry.name} proximity index...`;
      try{
        const payload=await loadProximityPayload(entry);
        const best=new Map();
        for(const [pdbId, rows] of payload.pdbs||[]){
          if(!recordByPdb.has(pdbId)) continue;
          for(const row of rows){
            if(row[2]===null || row[2]===undefined) continue;
            const sourceNumber=Number(row[2]);
            const minDistance=Number(row[6]);
            if(sourceNumber<start || sourceNumber>end || minDistance>distance) continue;
            const key=`${pdbId}	${row[4]}`;
            const previous=best.get(key);
            if(!previous || minDistance<previous.min_distance_a){
              best.set(key,{query_protein:entry.name,query_start:start,query_end:end,cutoff_a:distance,pdb_id:pdbId,source_chain:row[0],source_auth_seq:row[1],source_label_seq:row[3],target_protein:row[4],target_chain:row[5],min_distance_a:minDistance,target_auth_seq:row[7],target_label_seq:row[8],record:recordByPdb.get(pdbId)});
            }
          }
        }
        state.proximityResults=[...best.values()].sort((a,b)=>a.min_distance_a-b.min_distance_a || String(a.target_protein).localeCompare(String(b.target_protein)) || String(a.pdb_id).localeCompare(String(b.pdb_id)));
        state.proximityQuerySummary=`${entry.name} residues ${start}-${end} within ${distance} A`;
        updateProximityResultPresentation();
      }catch(error){
        state.proximityResults=[];
        renderProximityResults();
        els.downloadProximityCsv.disabled=true;
        els.copyProximityCxc.disabled=true;
        els.proximityStatus.textContent=`Proximity index error: ${error.message}`;
      }finally{
        els.runProximitySearch.disabled=!DATA.proximity.available;
      }
    }
    function proximityDisplayResults(){
      const species=els.proximitySpecies.value;
      const filtered=species==="all" ? state.proximityResults : state.proximityResults.filter(x=>x.record?.species===species);
      if(!els.proximityDeduplicate.checked) return filtered.map(x=>({...x,associated_pdb_ids:[x.pdb_id],associated_pdb_count:1}));
      const byProtein=new Map();
      for(const item of filtered){
        const key=String(item.target_protein).toLowerCase();
        const group=byProtein.get(key)||{representative:item,pdbIds:new Set()};
        group.pdbIds.add(item.pdb_id);
        if(item.min_distance_a<group.representative.min_distance_a) group.representative=item;
        byProtein.set(key,group);
      }
      return [...byProtein.values()].map(g=>({...g.representative,associated_pdb_ids:[...g.pdbIds].sort(),associated_pdb_count:g.pdbIds.size})).sort((a,b)=>a.min_distance_a-b.min_distance_a || String(a.target_protein).localeCompare(String(b.target_protein)));
    }
    function updateProximityResultPresentation(){
      const rows=proximityDisplayResults();
      const shown=rows.length;
      els.downloadProximityCsv.disabled=!shown;
      els.copyProximityCxc.disabled=!shown;
      els.proximityStatus.textContent = state.proximityResults.length ? `${shown} shown for ${state.proximityQuerySummary}.` : `No proteins matched ${state.proximityQuerySummary}.`;
      renderProximityResults();
    }
    function renderProximityResults(){
      const rows=proximityDisplayResults();
      if(!rows.length){ els.proximityRows.innerHTML='<tr><td colspan="7" class="proximity-empty">No proteins matched this residue range and cutoff.</td></tr>'; return; }
      els.proximityRows.innerHTML=rows.map(item=>`<tr><td><strong>${esc(item.target_protein)}</strong>${item.associated_pdb_count>1?`<div class="subtle">${item.associated_pdb_count} PDBs: ${esc(item.associated_pdb_ids.join(", "))}</div>`:""}</td><td><span class="pdb">${esc(item.pdb_id.toUpperCase())}</span><br><span class="subtle">${esc(item.record?.state||"")}</span></td><td>${esc(item.record?.species||"")}</td><td class="proximity-distance">${item.min_distance_a.toFixed(3)} A</td><td>${esc(item.query_protein)} / ${esc(item.source_chain)}:${esc(item.source_auth_seq)}</td><td>${esc(item.target_protein)} / ${esc(item.target_chain)}:${esc(item.target_auth_seq)}</td><td><button class="button" type="button" data-proximity-pdb="${attr(item.pdb_id)}">View</button></td></tr>`).join("");
    }
    function downloadProximityCsv(){
      const fields=["query_protein","query_start","query_end","cutoff_A","nearby_protein","representative_pdb_id","associated_pdb_count","associated_pdb_ids","state","species","min_distance_A","query_chain","query_auth_residue","nearby_chain","nearby_auth_residue"];
      const lines=[fields.join(",")];
      for(const item of proximityDisplayResults()){
        lines.push([item.query_protein,item.query_start,item.query_end,item.cutoff_a,item.target_protein,item.pdb_id,item.associated_pdb_count,item.associated_pdb_ids.join("; "),item.record?.state||"",item.record?.species||"",item.min_distance_a,item.source_chain,item.source_auth_seq,item.target_chain,item.target_auth_seq].map(csvCell).join(","));
      }
      const blob=new Blob([lines.join("\n")+"\n"],{type:"text/csv;charset=utf-8"});
      const url=URL.createObjectURL(blob); const link=document.createElement("a"); link.href=url; link.download="spliceosome_proximity_results.csv"; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    }
    async function proximityChimeraXScript(){
      const ids=[...new Set(proximityDisplayResults().map(x=>x.pdb_id))].sort();
      const chunks=[];
      for(const id of ids){
        const record=records.find(r=>r.pdb_id===id);
        if(!record) continue;
        chunks.push(`# ===== BEGIN STANDARD CXC: ${id.toUpperCase()} =====
${await scriptFor(record,"no_maps")}
# ===== END STANDARD CXC: ${id.toUpperCase()} =====`);
      }
      return chunks.join("\n\n");
    }
    function csvCell(value){ const text=String(value??""); return /[",\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text; }
    function tableThumbnail(r){
      const image = r.thumbnail && r.thumbnail.image;
      if(!image) return '<span class="subtle">-</span>';
      return `<img class="table-thumbnail" src="${attr(image)}" alt="${attr(r.pdb_id.toUpperCase())} thumbnail" loading="lazy">`;
    }
    function rnaAnnotationBadges(r){
      const substrateCount = (r.substrate_features||[]).length;
      const snrnaCount = (r.snrna_features||[]).length;
      const bits = [];
      if(substrateCount) bits.push(`<span class="badge good">mRNA ${substrateCount}</span>`);
      if(snrnaCount) bits.push(`<span class="badge good">snRNA ${snrnaCount}</span>`);
      return `<div class="badge-row">${bits.join("") || '<span class="badge">none</span>'}</div>`;
    }
    function isMinorSpliceosome(r){
      return /\bminor\b/i.test([r?.title, r?.paper_title].filter(Boolean).join(" "));
    }
    function minorSpliceosomeBadge(r){
      return isMinorSpliceosome(r) ? '<span class="badge minor-spliceosome" title="Minor spliceosome">minor</span>' : "";
    }
    function flagSupportingMetric(flag,r){
      const value=String(flag||"").toLowerCase(),q=r.quality||{};
      if(value.includes("validation geometry") && q.geometry_quality) return `Geometry quality metric: ${q.geometry_quality}.`;
      if(value.includes("ramachandran") && q.rama_outliers_percent) return `Ramachandran outliers: ${q.rama_outliers_percent}%.`;
      if(value.includes("rna suite") && q.rna_suite_outliers_percent) return `RNA suite outliers: ${q.rna_suite_outliers_percent}%.`;
      if(value.includes("low resolution")) return `Reported resolution: ${formatResolution(r.resolution)||q.map_resolution_A||"not available"} A.`;
      if(value.includes("local/non-pdb")) return "This is a local or non-PDB model rather than a public deposited entry.";
      return "See Curation and Quality for the supporting audit values.";
    }
    function flagBadge(r,interactive=false){
      const flags=r.curation?.flags||[];
      if(!flags.length) return "";
      const label=`${flags.length} flag${flags.length===1?"":"s"}`;
      const hover=flags.map(flag=>`${flag}\n${flagSupportingMetric(flag,r)}`).join("\n\n");
      if(!interactive) return `<span class="badge bad" title="${attr(hover)}">${label}</span>`;
      return `<details class="flag-badge-details"><summary class="badge bad" title="${attr(hover)}">${label}</summary><div class="flag-popover"><strong>Curation and validation flags</strong><ul>${flags.map(flag=>`<li>${esc(flag)}<span class="flag-metric">${esc(flagSupportingMetric(flag,r))}</span></li>`).join("")}</ul></div></details>`;
    }
    function curationBadges(r, includeRna=true){
      const c=r.curation||{}; const flags=c.flags||[]; const confidence=c.overall_confidence||"";
      const bits=[];
      if(c.assignment_completeness) bits.push(`<span class="badge" title="Component naming and color coverage, not validation of biological identity.">Components: ${esc(c.assignment_completeness)}</span>`);
      if(confidence) bits.push(`<span class="badge ${confidence==="review"?"review":""}" title="Rule-based evidence assessment; not a calibrated probability or a model-quality score.">Evidence: ${esc(confidence)}</span>`);
      if(includeRna && c.provisional_rna_features) bits.push(`<span class="badge warn" title="${attr(c.annotation_scope)}">${c.provisional_rna_features} provisional RNA regions</span>`);
      if(includeRna && (r.substrate_features||[]).length) bits.push('<span class="badge good">(pre-)mRNA features annotated</span>');
      if(includeRna && (r.snrna_features||[]).length) bits.push('<span class="badge good">snRNA features annotated</span>');
      if(flags.length) bits.push(flagBadge(r,includeRna));
      return `<div class="badge-row">${bits.join("") || '<span class="badge">n/a</span>'}</div>`;
    }
    function toggleCompare(pdbId){
      const i=state.compareIds.indexOf(pdbId);
      if(i>=0) state.compareIds.splice(i,1); else state.compareIds.push(pdbId);
      if(state.compareIds.length>5) state.compareIds.shift();
      render();
    }
    function setChainMode(mode){
      state.chainMode = mode === "systematic" ? "systematic" : "original";
      const r = records.find(item => item.pdb_id === state.selected);
      if(r) renderScriptActions(r);
    }
    function externalLinks(r){
      const links = [];
      if(r.rcsb_url) links.push(`<a href="${attr(r.rcsb_url)}" target="_blank" rel="noreferrer" title="Open this entry at the RCSB PDB">RCSB PDB</a>`);
      if(r.pdbe_url) links.push(`<a href="${attr(r.pdbe_url)}" target="_blank" rel="noreferrer" title="Open this entry at PDBe">PDBe</a>`);
      if(r.pubmed_id) links.push(`<a href="https://pubmed.ncbi.nlm.nih.gov/${attr(r.pubmed_id)}/" target="_blank" rel="noreferrer" title="Open the associated publication at PubMed">PubMed</a>`);
      if(r.doi) links.push(`<a href="https://doi.org/${attr(r.doi)}" target="_blank" rel="noreferrer" title="Open the publication DOI">DOI</a>`);
      for(const emdb of r.emdb_ids || []){
        const digits = String(emdb).match(/\d+/);
        if(digits) links.push(`<a href="https://www.ebi.ac.uk/emdb/EMD-${attr(digits[0])}" target="_blank" rel="noreferrer" title="Open ${attr(emdb)} at EMDB">${esc(emdb.toUpperCase())}</a>`);
      }
      return links.length ? `<div class="actions external-links">${links.join("")}</div>` : '<div class="subtle">No external resources listed for this entry.</div>';
    }
    function reportIssueUrl(r){
      const title = `[curation] ${String(r.pdb_id || "").toUpperCase()} annotation/coloring issue`;
      const body = [
        "### Structure",
        `- PDB: ${String(r.pdb_id || "").toUpperCase()}`,
        `- State: ${r.state || "n/a"}`,
        `- Species: ${r.species || "n/a"}`,
        `- Title: ${r.title || "n/a"}`,
        `- Dashboard URL: ${window.location.href.split("#")[0]}`,
        "",
        "### Issue type",
        "- [ ] Protein coloring",
        "- [ ] Protein identity / homolog assignment",
        "- [ ] RNA identity",
        "- [ ] RNA feature annotation",
        "- [ ] Splicing-cycle state",
        "- [ ] Other",
        "",
        "### Observed problem",
        "Describe what looks wrong, including chain IDs, residue numbers, or feature names where possible.",
        "",
        "### Expected correction",
        "Describe the correction you think should be made.",
        "",
        "### Evidence",
        "Add paper, figure, PDB/mmCIF annotation, ChimeraX screenshot, or other supporting evidence."
      ].join("\n");
      return `https://github.com/plaschka-lab/SpliceVis/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    }
    function reportIssueLink(r){
      return `<a class="report-link" href="${attr(reportIssueUrl(r))}" target="_blank" rel="noreferrer" title="Open a prefilled GitHub issue for reporting annotation, homolog, RNA-feature, pathway, or coloring errors">Report annotation/coloring error</a>`;
    }
    function molstarLegend(r){
      const groups = [];
      const byKey = new Map();
      for(const x of (r.molstar_color_selections||[])){
        const key = `${x.label}|${x.color}`;
        let item = byKey.get(key);
        if(!item){
          item = {label: x.label || x.auth_asym_id, color: x.color, chains: []};
          byKey.set(key, item);
          groups.push(item);
        }
        if(x.auth_asym_id && !item.chains.includes(x.auth_asym_id)) item.chains.push(x.auth_asym_id);
      }
      return groups.map((x,index)=>`<button type="button" class="molstar-legend-chip" data-legend-index="${index}" onclick="selectMolstarComponentFromLegend(this)" title="${attr(`${x.label} ${x.color}; chains ${x.chains.join(', ')}`)}"><span class="component-swatch" style="background:${attr(x.color)}"></span><span>${esc(x.label)}</span></button>`).join("");
    }
    function molstarFeatureBrowser(r){
      const features = r.molstar_feature_selections || [];
      if(!features.length) return '<div class="subtle">No RNA feature selections are available for this structure.</div>';
      const groups = unique(features.map(x=>x.group));
      return `<div class="molstar-feature-box"><div class="molstar-feature-controls"><div class="field"><label for="molstarFeatureGroup">Feature group</label><select id="molstarFeatureGroup" onchange="renderMolstarFeatureButtons()"><option value="all">All feature groups</option>${groups.map(g=>`<option value="${attr(g)}">${esc(g)}</option>`).join("")}</select></div><div class="field"><label for="molstarFeatureSearch">Find feature</label><input id="molstarFeatureSearch" type="search" placeholder="branch, 5SS, U6" oninput="renderMolstarFeatureButtons()"></div><button type="button" onclick="clearMolstarFeature()" title="Clear Mol* feature highlight and refocus the full structure.">Clear feature</button></div><div class="molstar-feature-list" id="molstarFeatureList"></div></div>`;
    }
    function structureAlignmentItems(r){
      const byPath = new Map();
      for(const substrate of (r.substrate_types || [])){
        for(const alignment of (substrate.pairwise_alignments || [])){
          if(!alignment.alignment_html || byPath.has(alignment.alignment_html)) continue;
          byPath.set(alignment.alignment_html, {
            html: alignment.alignment_html,
            fasta: alignment.alignment_fasta || "",
            label: substrate.reference_label || substrate.family || substrate.type || "pre-mRNA",
          });
        }
      }
      return [...byPath.values()];
    }
    function alignmentViewerUrl(path){
      // Mol* always uses deposited IDs; ChimeraX scripts choose their own URL.
      return path;
    }
    function rnaAlignmentPanel(r){
      const items = structureAlignmentItems(r);
      if(!items.length) return "";
      const first = items[0];
      const firstUrl = alignmentViewerUrl(first.html);
      const chooser = items.length > 1 ? `<select class="rna-alignment-select" aria-label="Reference alignment" onchange="changeRnaAlignment(this)">${items.map((item,index)=>`<option value="${index}">${esc(item.label)}</option>`).join("")}</select>` : "";
      const help = `<span class="rna-alignment-help"><button type="button" aria-label="Sequence alignment help">?</button><span class="rna-alignment-help-text" role="tooltip"><strong>Sequence alignment</strong>Feature tracks are projected from the annotated reference. Blue bases are modelled; grey bases are present in the sequence record but unresolved. Click a modelled base, or drag a range within one chain, to focus it in Mol*.</span></span>`;
      return `<section class="rna-alignment-panel"><iframe id="rnaAlignmentFrame" class="rna-alignment-frame" src="${attr(firstUrl)}" title="${attr(`${r.pdb_id.toUpperCase()} pre-mRNA sequence alignment`)}" loading="eager"></iframe><div class="rna-alignment-footer">${chooser}${help}<a id="rnaAlignmentOpen" href="${attr(firstUrl)}" target="_blank" rel="noopener">Full alignment</a>${first.fasta?`<a id="rnaAlignmentFasta" href="${attr(first.fasta)}" download>FASTA</a>`:""}</div></section>`;
    }
    function changeRnaAlignment(control){
      const items=structureAlignmentItems(currentMolstarRecord()),item=items[Number(control.value)];
      if(!item) return;
      const viewerUrl=alignmentViewerUrl(item.html);
      document.getElementById("rnaAlignmentFrame").src=viewerUrl;
      document.getElementById("rnaAlignmentOpen").href=viewerUrl;
      const fasta=document.getElementById("rnaAlignmentFasta");
      if(fasta && item.fasta) fasta.href=item.fasta;
    }
    function structureSnrnaAlignmentItems(r){
      return (r?.snrna_alignments || []).filter(item=>item.alignment_html).map(item=>({
        html:item.alignment_html,
        fasta:item.alignment_fasta || "",
        label:String(item.snrna || "snRNA").replace(/\s+snRNA$/i,""),
        reference:item.reference_label || "snRNA reference",
        chains:item.chains || "",
      }));
    }
    function snrnaAlignmentControl(r){
      const items=structureSnrnaAlignmentItems(r);
      if(!items.length) return "";
      return `<label class="snrna-alignment-toggle"><input type="checkbox" onchange="toggleSnrnaAlignment(this)">Show snRNA reference alignments <span>(${items.length})</span></label><div id="snrnaAlignmentHost" class="snrna-alignment-host" hidden></div>`;
    }
    function snrnaAlignmentPanel(r){
      const items=structureSnrnaAlignmentItems(r);
      if(!items.length) return "";
      const first=items[0], firstUrl=alignmentViewerUrl(first.html);
      const chooser=items.length>1 ? `<select class="rna-alignment-select" aria-label="snRNA reference alignment" onchange="changeSnrnaAlignment(this)">${items.map((item,index)=>`<option value="${index}">${esc(item.label)}</option>`).join("")}</select>` : `<span>${esc(first.label)}</span>`;
      const help=`<span class="rna-alignment-help"><button type="button" aria-label="snRNA alignment help">?</button><span class="rna-alignment-help-text" role="tooltip"><strong>snRNA alignment</strong>The annotated ${esc(first.reference)} reference is aligned to deposited chain${first.chains.includes(";")?"s":""} ${esc(first.chains)}. Blue bases are modelled; grey bases are present in the sequence record but unresolved.</span></span>`;
      return `<section class="rna-alignment-panel"><div class="rna-alignment-footer snrna-alignment-footer">${chooser}${help}<a id="snrnaAlignmentOpen" href="${attr(firstUrl)}" target="_blank" rel="noopener">Full alignment</a>${first.fasta?`<a id="snrnaAlignmentFasta" href="${attr(first.fasta)}" download>FASTA</a>`:""}</div><iframe id="snrnaAlignmentFrame" class="rna-alignment-frame" src="${attr(firstUrl)}" title="${attr(`${r.pdb_id.toUpperCase()} snRNA sequence alignment`)}" loading="lazy"></iframe></section>`;
    }
    function toggleSnrnaAlignment(checkbox){
      const host=document.getElementById("snrnaAlignmentHost");
      if(!host) return;
      host.hidden=!checkbox.checked;
      host.innerHTML=checkbox.checked ? snrnaAlignmentPanel(currentMolstarRecord()) : "";
    }
    function changeSnrnaAlignment(control){
      const item=structureSnrnaAlignmentItems(currentMolstarRecord())[Number(control.value)];
      if(!item) return;
      const viewerUrl=alignmentViewerUrl(item.html);
      document.getElementById("snrnaAlignmentFrame").src=viewerUrl;
      document.getElementById("snrnaAlignmentOpen").href=viewerUrl;
      const fasta=document.getElementById("snrnaAlignmentFasta");
      if(fasta && item.fasta) fasta.href=item.fasta;
      const help=document.querySelector("#snrnaAlignmentHost .rna-alignment-help-text");
      if(help) help.innerHTML=`<strong>snRNA alignment</strong>The annotated ${esc(item.reference)} reference is aligned to deposited chain${item.chains.includes(";")?"s":""} ${esc(item.chains)}. Blue bases are modelled; grey bases are present in the sequence record but unresolved.`;
    }
    function molstarPanel(r){
      const count = (r.molstar_color_selections||[]).length;
      const legend = molstarLegend(r);
      const hasFeatures = Boolean((r.molstar_feature_selections || []).length);
      const hasLegend = Boolean(legend);
      const features = hasFeatures ? `<section class="molstar-selection-section" data-molstar-section="rna"><h3>RNA elements</h3><p class="section-note">Click a feature to zoom and highlight it in the 3D model.</p>${molstarFeatureBrowser(r)}</section>` : "";
      const legendBlock = hasLegend ? `<section class="molstar-selection-section" data-molstar-section="protein"><h3>Proteins</h3><p class="section-note">Click a component to zoom and highlight all matching chains.</p><div class="molstar-legend">${legend}</div></section>` : "";
      const sidebar = features || legendBlock ? `<aside class="molstar-selection-sidebar">${features}${legendBlock}</aside>` : "";
      return `<div class="molstar-panel"><div class="molstar-workbench"><div class="molstar-viewer" id="molstarViewer"></div>${sidebar}</div><div class="molstar-toolbar"><span class="molstar-status" id="molstarStatus">${count ? `${count} chain-color selections are applied automatically.` : "No chain-color selections are available for this entry."}</span></div>${rnaAlignmentPanel(r)}${snrnaAlignmentControl(r)}</div>`;
    }
    function switchMolstarSelectionTab(tab){
      const value = tab === "protein" ? "protein" : "rna";
      const sidebar = document.querySelector(".molstar-selection-sidebar");
      if(!sidebar) return;
      sidebar.dataset.activeSelection = value;
      for(const button of sidebar.querySelectorAll("[data-selection-tab]")) button.classList.toggle("active", button.dataset.selectionTab === value);
      renderMolstarFeatureButtons();
    }
    function pdbeMolstarReady(){
      return typeof PDBeMolstarPlugin === "function";
    }
    async function waitForMolstarComponent(){
      if(pdbeMolstarReady()) return;
      if(!molstarLoadPromise){
        molstarLoadPromise = new Promise((resolve,reject)=>{
          const started = Date.now();
          const timer = setInterval(()=>{
            if(pdbeMolstarReady()){ clearInterval(timer); resolve(); }
            else if(Date.now() - started > 15000){ clearInterval(timer); molstarLoadPromise=null; reject(new Error("The bundled Mol* library did not load. Reload the page or check the local installation.")); }
          },100);
        });
      }
      await molstarLoadPromise;
    }
    async function loadMolstarForSelected(button){
      const r = records.find(item=>item.pdb_id===state.selected);
      const target = document.getElementById("molstarViewer");
      const status = document.getElementById("molstarStatus");
      if(!r || !target) return;
      if(molstarPendingPdbId === r.pdb_id && molstarLoadTask) return molstarLoadTask;
      const box = target.getBoundingClientRect();
      if(box.width < 2 || box.height < 2) return;
      disposeMolstar();
      const generation = molstarGeneration;
      molstarAbort = new AbortController();
      const signal = molstarAbort.signal;
      molstarAutoPreviewEnabled = true;
      const requestedPdbId = r.pdb_id;
      molstarPendingPdbId = requestedPdbId;
      if(status) status.textContent = "Loading PDBe Mol* viewer...";
      if(button) button.disabled = true;
      try{
        await waitForMolstarComponent();
        if(state.selected !== requestedPdbId) return;
        const liveTarget = document.getElementById("molstarViewer");
        if(!liveTarget) return;
        liveTarget.innerHTML = "";
        state.molstarViewer = null;
        state.molstarPdbId = "";
        if(signal.aborted) return;
        const viewer = document.createElement("div");
        viewer.className = "molstar-instance";
        viewer.style.width = "100%";
        viewer.style.height = "100%";
        liveTarget.appendChild(viewer);
        state.molstarViewer = viewer;
        state.molstarPdbId = r.pdb_id;
        const instance = new PDBeMolstarPlugin();
        viewer.viewerInstance = instance;
        const options = {assemblyId:"1", hideStructure:["water"], hideControls:false,
          sequencePanel:false, pdbeLink:!DATA.offline, loadingOverlay:true,
          lighting:"flat", subscribeEvents:false, bgColor:{r:255,g:255,b:255},
          validationAnnotation:false, domainAnnotation:false, symmetryAnnotation:false};
        if(DATA.offline) options.customData={url:`pdb/${r.pdb_id.toLowerCase()}.cif`,format:"cif",binary:false};
        else options.moleculeId=r.pdb_id.toLowerCase();
        molstarLoadTask = SpliceVisViewer.load(instance, viewer, options, signal);
        await molstarLoadTask;
        if(signal.aborted || generation !== molstarGeneration) return;
        await applyMolstarIllustrativeStyle();
        try{
          await applyMolstarColors();
        }catch(colorError){
          const liveStatus = document.getElementById("molstarStatus");
          if(liveStatus) liveStatus.textContent = `Loaded ${r.pdb_id.toUpperCase()}, but the SpliceVis color overlay failed: ${colorError.message}`;
        }
        renderMolstarFeatureButtons();
      }catch(error){
        if(signal.aborted || generation !== molstarGeneration) return;
        const liveStatus = document.getElementById("molstarStatus");
        if(liveStatus) liveStatus.innerHTML = `Mol* preview error: ${esc(error.message)} <button type="button" onclick="loadMolstarForSelected(this)">Retry model</button>`;
      }finally{
        if(generation === molstarGeneration){
          molstarPendingPdbId = "";
          molstarLoadTask = null;
        }
        if(button) button.disabled = false;
      }
    }
    function disposeMolstar(){
      molstarGeneration++;
      molstarAbort?.abort();
      state.molstarViewer?.viewerInstance?.plugin?.dispose();
      state.molstarViewer = null;
      state.molstarPdbId = "";
      molstarPendingPdbId = "";
      molstarLoadTask = null;
    }
    function autoLoadMolstarForSelected(){
      const requestedPdbId = state.selected;
      window.setTimeout(()=>{
        if(state.selected !== requestedPdbId) return;
        const target = document.getElementById("molstarViewer");
        if(!target || target.getBoundingClientRect().width < 2 || target.getBoundingClientRect().height < 2) return;
        if(molstarPendingPdbId === requestedPdbId) return;
        if(state.molstarPdbId === requestedPdbId && target.querySelector(".molstar-instance")) return;
        loadMolstarForSelected();
      }, 0);
    }
    function currentMolstarViewerElement(){
      if(state.molstarViewer && !document.body.contains(state.molstarViewer)){
        state.molstarViewer = null;
        state.molstarPdbId = "";
      }
      const viewer = document.querySelector("#molstarViewer .molstar-instance");
      if(viewer) state.molstarViewer = viewer;
      return state.molstarViewer;
    }
    async function applyMolstarIllustrativeStyle(){
      const viewer = currentMolstarViewerElement();
      const plugin = viewer?.viewerInstance?.plugin;
      const component = plugin?.managers?.structure?.component;
      const canvas = plugin?.canvas3d;
      if(!component || !canvas) return false;
      try{
        const options = component.state?.options || {};
        await component.setOptions({...options, ignoreLight:true});
        const postprocessing = canvas.props?.postprocessing || {};
        const existingOutlineParams = postprocessing.outline?.name === "on" ? postprocessing.outline.params || {} : {};
        const existingOcclusionParams = postprocessing.occlusion?.name === "on" ? postprocessing.occlusion.params || {} : {};
        canvas.setProps({postprocessing:{
          outline:{
            name:"on",
            params:{...existingOutlineParams, scale:.65, color:0, threshold:existingOutlineParams.threshold ?? .33, includeTransparent:true}
          },
          occlusion:{
            name:"on",
            params:Object.keys(existingOcclusionParams).length ? existingOcclusionParams : {multiScale:{name:"off",params:{}},radius:5,bias:.8,blurKernelSize:15,blurDepthBias:.5,samples:32,resolutionScale:1,color:0,transparentThreshold:.4}
          },
          shadow:{name:"off",params:{}}
        }});
        return true;
      }catch(error){
        console.warn("Could not apply Mol* illustrative style", error);
        return false;
      }
    }
    async function applyMolstarColors(){
      const r = records.find(item=>item.pdb_id===state.molstarPdbId || item.pdb_id===state.selected);
      const status = document.getElementById("molstarStatus");
      const viewer = currentMolstarViewerElement();
      const instance = viewer && viewer.viewerInstance;
      const chainSelections = (r && r.molstar_color_selections || []).map(x=>({auth_asym_id:x.auth_asym_id, color:x.color}));
      const featureSelections = defaultMolstarFeatureSelections(r);
      const selections = [...chainSelections, ...featureSelections];
      if(!instance || !instance.visual){ if(status) status.textContent = "Mol* viewer is not ready yet."; return; }
      if(!selections.length){ if(status) status.textContent = "No SpliceVis color selections are available for this entry."; return; }
      await instance.visual.select({data: selections, nonSelectedColor: "#D8DDE4"});
      if(instance.canvas && instance.canvas.setBgColor) instance.canvas.setBgColor("white");
      if(status) status.textContent = `Applied ${chainSelections.length} chain colors and ${featureSelections.length} RNA feature overlays to ${r.pdb_id.toUpperCase()}.`;
    }
    function molstarFeatureColorPriority(feature){
      const f = String(feature?.feature || "").toLowerCase();
      if(f === "substrate") return -1;
      if(f.includes("exon_5") || f.includes("exon_3") || f.includes("ligated") || f.includes("exon_defined")) return 30;
      if(f.includes("branch_point_adenosine")) return 40;
      if(f.includes("splice_site") || f.includes("branch") || f.includes("polypyrimidine")) return 20;
      return 10;
    }
    function defaultMolstarFeatureSelections(r){
      return (r?.molstar_feature_selections || [])
        .filter(feature => String(feature.feature || "").toLowerCase() !== "substrate")
        .sort((a,b)=>molstarFeatureColorPriority(a)-molstarFeatureColorPriority(b))
        .flatMap(feature => (feature.queries || []).map(query=>({...query, color: feature.color || "#FFFF00"})));
    }
    function currentMolstarRecord(){
      return records.find(item=>item.pdb_id===state.selected) || records.find(item=>item.pdb_id===state.molstarPdbId);
    }
    function renderMolstarFeatureButtons(){
      const list = document.getElementById("molstarFeatureList");
      if(!list) return;
      const r = currentMolstarRecord();
      const group = document.getElementById("molstarFeatureGroup")?.value || "all";
      const query = (document.getElementById("molstarFeatureSearch")?.value || "").trim().toLowerCase();
      const features = (r?.molstar_feature_selections || []).filter((item, index)=>{
        const hay = [item.label,item.feature,item.group,item.kind,item.chain,item.residue_ranges,item.confidence].join(" ").toLowerCase();
        return (group==="all" || item.group===group) && (!query || hay.includes(query));
      });
      list.innerHTML = features.length ? features.slice(0,70).map((item,index)=>`<button type="button" class="molstar-feature-button" data-feature-index="${index}" onclick="selectMolstarFeatureFromButton(this)" title="${attr(`${item.group}: ${item.label} chain ${item.chain} residues ${item.residue_ranges}; ${item.confidence || "unrated"} confidence; ${item.method || "see RNA annotations"}`)}"><span class="component-swatch" style="background:${attr(item.color)}"></span>${esc(item.label)}${item.confidence !== "high" ? '<span class="feature-confidence" aria-label="Provisional annotation">?</span>' : ""} <span class="subtle">${esc(item.residue_ranges)}</span></button>`).join("") + (features.length>70 ? `<span class="subtle">+${features.length-70} more</span>` : "") : '<span class="subtle">No matching feature selections.</span>';
      list._molstarFeatures = features;
    }
    async function selectMolstarFeatureFromButton(button){
      const list = document.getElementById("molstarFeatureList");
      const featureIndex = Number(button.dataset.featureIndex);
      const feature = list?._molstarFeatures?.[featureIndex];
      if(!feature) return;
      await selectMolstarFeature(feature);
      const currentList = document.getElementById("molstarFeatureList");
      if(currentList) for(const item of currentList.querySelectorAll(".molstar-feature-button")) item.classList.toggle("active", Number(item.dataset.featureIndex) === featureIndex);
      clearMolstarLegendActive();
    }
    async function selectMolstarFeature(feature){
      const status = document.getElementById("molstarStatus");
      const requested = state.selected;
      if(!currentMolstarViewerElement() || state.molstarPdbId !== state.selected){
        await loadMolstarForSelected();
      }
      if(molstarLoadTask) await molstarLoadTask;
      if(state.selected !== requested) return;
      const viewer = currentMolstarViewerElement();
      const instance = viewer && viewer.viewerInstance;
      if(!instance || !instance.visual){ if(status) status.textContent = "Mol* viewer is not ready yet."; return; }
      const queries = (feature.queries || []).map(q=>({...q, color: feature.color || "#FFFF00", focus: true}));
      if(!queries.length){ if(status) status.textContent = "This feature has no selectable Mol* residue ranges."; return; }
      await instance.visual.focus(queries);
      await instance.visual.highlight({data: queries, color: feature.color || "#FFFF00"});
      if(status) status.textContent = `Focused ${feature.label} (${feature.chain}:${feature.residue_ranges}).`;
    }
    function compactNumericRanges(values){
      const ordered=[...new Set(values.map(Number).filter(Number.isFinite))].sort((a,b)=>a-b),ranges=[];
      if(!ordered.length) return ranges;
      let start=ordered[0],previous=ordered[0];
      for(const value of ordered.slice(1)){
        if(value===previous+1){ previous=value; continue; }
        ranges.push([start,previous]); start=previous=value;
      }
      ranges.push([start,previous]);
      return ranges;
    }
    async function focusMolstarAlignmentSelection(payload){
      const r=currentMolstarRecord(),status=document.getElementById("molstarStatus");
      if(!r || String(payload.pdb_id||"").toLowerCase()!==String(r.pdb_id||"").toLowerCase()) return;
      const validChains=new Set((r.rnas||[]).flatMap(item=>String(item.chains||"").split(/;\s*/)).filter(Boolean));
      if(!validChains.has(String(payload.chain||""))) return;
      const ranges=compactNumericRanges(Array.isArray(payload.auth_residues)?payload.auth_residues:[]);
      if(!ranges.length) return;
      if(!currentMolstarViewerElement() || state.molstarPdbId!==state.selected) await loadMolstarForSelected();
      if(molstarLoadTask) await molstarLoadTask;
      if(state.selected !== r.pdb_id) return;
      const viewer=currentMolstarViewerElement(),instance=viewer&&viewer.viewerInstance;
      if(!instance||!instance.visual){ if(status) status.textContent="Mol* viewer is not ready yet."; return; }
      const queries=ranges.map(([start,end])=>({auth_asym_id:payload.chain,beg_auth_seq_id:start,end_auth_seq_id:end,color:"#00A6C8",focus:true}));
      await instance.visual.focus(queries);
      await instance.visual.highlight({data:queries,color:"#00A6C8"});
      clearMolstarLegendActive();
      document.querySelectorAll(".molstar-feature-button").forEach(item=>item.classList.remove("active"));
      if(status) status.textContent=`Focused ${payload.label||`${r.pdb_id.toUpperCase()} chain ${payload.chain}`}.`;
    }
    window.addEventListener("message",event=>{
      const payload=event.data;
      const frame=[document.getElementById("rnaAlignmentFrame"),document.getElementById("snrnaAlignmentFrame")].find(item=>item && event.source===item.contentWindow);
      if(!frame || event.origin !== location.origin) return;
      if(payload?.source==="splicevis-rna-alignment-resize"){
        if(frame&&event.source===frame.contentWindow){
          const height=Math.max(150,Math.min(460,Number(payload.height)||300));
          frame.style.height=`${Math.ceil(height)}px`;
        }
        return;
      }
      if(!payload||payload.source!=="splicevis-rna-alignment") return;
      focusMolstarAlignmentSelection(payload).catch(error=>{
        const status=document.getElementById("molstarStatus");
        if(status) status.textContent=`Mol* alignment selection failed: ${error.message}`;
      });
    });
    function molstarLegendItems(r){
      const groups = [];
      const byKey = new Map();
      for(const x of (r?.molstar_color_selections || [])){
        const key = `${x.label}|${x.color}`;
        let item = byKey.get(key);
        if(!item){
          item = {label: x.label || x.auth_asym_id, color: x.color || "#FFFF00", chains: []};
          byKey.set(key, item);
          groups.push(item);
        }
        if(x.auth_asym_id && !item.chains.includes(x.auth_asym_id)) item.chains.push(x.auth_asym_id);
      }
      return groups;
    }
    function clearMolstarLegendActive(){
      for(const item of document.querySelectorAll(".molstar-legend-chip")) item.classList.remove("active");
    }
    async function selectMolstarComponentFromLegend(button){
      const r = currentMolstarRecord();
      const item = molstarLegendItems(r)[Number(button.dataset.legendIndex)];
      const status = document.getElementById("molstarStatus");
      if(!item || !item.chains.length) return;
      if(!currentMolstarViewerElement() || state.molstarPdbId !== state.selected){
        await loadMolstarForSelected();
      }
      if(molstarLoadTask) await molstarLoadTask;
      if(state.selected !== r.pdb_id) return;
      const viewer = currentMolstarViewerElement();
      const instance = viewer && viewer.viewerInstance;
      if(!instance || !instance.visual){ if(status) status.textContent = "Mol* viewer is not ready yet."; return; }
      const queries = item.chains.map(auth_asym_id=>({auth_asym_id, color: item.color, focus: true}));
      await instance.visual.focus(queries);
      await instance.visual.highlight({data: queries, color: item.color});
      for(const chip of document.querySelectorAll(".molstar-legend-chip")) chip.classList.toggle("active", chip===button);
      const featureList = document.getElementById("molstarFeatureList");
      if(featureList) for(const featureButton of featureList.querySelectorAll(".molstar-feature-button")) featureButton.classList.remove("active");
      if(status) status.textContent = `Focused ${item.label} chain${item.chains.length === 1 ? "" : "s"} ${item.chains.join(", ")}.`;
    }
    async function clearMolstarFeature(){
      const status = document.getElementById("molstarStatus");
      const viewer = currentMolstarViewerElement();
      const instance = viewer && viewer.viewerInstance;
      if(instance?.visual?.clearHighlight) await instance.visual.clearHighlight();
      if(instance?.visual?.reset) await instance.visual.reset({camera:true});
      const list = document.getElementById("molstarFeatureList");
      if(list) for(const item of list.querySelectorAll(".molstar-feature-button")) item.classList.remove("active");
      clearMolstarLegendActive();
      if(status) status.textContent = "Cleared Mol* feature highlight.";
    }
    function showStartTab(tab){
      state.activeTab = tab;
      for(const x of els.tabs.querySelectorAll("button")) x.classList.toggle("active",x.dataset.tab===tab);
      if(els.atlasNavButton) els.atlasNavButton.classList.toggle("active",tab==="structures");
      if(els.componentsNavButton) els.componentsNavButton.classList.toggle("active",tab==="proteins");
      const drawer=document.querySelector(".tools-drawer");
      if(drawer) drawer.open=false;
      render();
      window.scrollTo({top:0, behavior:"smooth"});
    }
    function focusSearch(){
      showStartTab("structures");
      els.search.focus();
    }
    function openInteractivePreview(){
      showStartTab("structures");
      for(const section of document.querySelectorAll("details.detail-section")){
        const summary = section.querySelector("summary");
        if(summary && summary.textContent.trim() === "Interactive 3D"){
          section.open = true;
          section.scrollIntoView({behavior:"smooth", block:"center"});
          molstarAutoPreviewEnabled = true;
          autoLoadMolstarForSelected();
          return;
        }
      }
    }
    function renderDetail(r){
      if(r && renderedDetailId === r.pdb_id && els.detail.querySelector('#molstarViewer')){
        renderScriptActions(r);
        for(const section of els.detail.querySelectorAll('details.detail-section')){
          if(section.querySelector('summary')?.textContent === 'Compare Structures') section.querySelector('.detail-section-body').innerHTML = comparisonPanel();
        }
        return;
      }
      disposeMolstar();
      renderedDetailId = r?.pdb_id || null;
      if(!r){ els.detail.innerHTML='<div class="subtle">No structure selected.</div>'; els.selectedScriptActions.innerHTML=""; return; }
      els.selectedId.textContent = r.pdb_id.toUpperCase();
      renderScriptActions(r);
      renderDetailBody(r);
    }
    function renderScriptActions(r){
      const systematicAvailable = Boolean(r.script_systematic_path);
      const selectedScriptMode = state.chainMode === "systematic" && systematicAvailable ? "systematic" : "original";
      if (state.chainMode === "systematic" && !systematicAvailable) state.chainMode = "original";
      const chainModeOption = `<label class="selected-header-chain-toggle" title="${attr(systematicAvailable ? `Rename ${r.systematic_chain_count || 0} mapped chains inside ChimeraX using safe-harbor IDs before coloring and named selections. Systematic IDs attempt to give identical or homologous proteins the same chain IDs across structures.` : "No systematic chain map is available for this entry.")}"><input type="checkbox" ${selectedScriptMode === "systematic" ? "checked" : ""} ${systematicAvailable ? "" : "disabled"} onchange="setChainMode(this.checked ? 'systematic' : 'original')">Use systematic chain IDs</label>`;
      const primaryMapAvailable = selectedScriptMode === "systematic" ? r.primary_map_script_systematic_path : r.primary_map_script_path;
      const primaryMapButton = primaryMapAvailable ? `<button class="script-copy" onclick="copyStructureScript('${attr(r.pdb_id)}', this, 'primary_map')" title="Copy a ChimeraX script that downloads the model and primary EMDB map, then aligns the model and brings the map when possible.">Copy ChimeraX script (model + map)</button>` : "";
      const compositeButtons = (r.composite_groups||[]).map(group => `<button class="script-copy" onclick="copyScriptFile('${attr(group.script_path)}', this)" title="${attr(group.note || 'Copy a combined ChimeraX script for this split deposited assembly.')} ${attr(group.label || group.composite_id || "")}">Copy assembly</button>`).join("");
      els.selectedScriptActions.innerHTML = `<span class="selected-header-actions-label">ChimeraX</span><button class="script-copy" onclick="copyStructureScript('${attr(r.pdb_id)}', this, 'no_maps')" title="Copy a model-only ChimeraX script that downloads the deposited PDB coordinates directly.">Copy ChimeraX script (model only)</button>${primaryMapButton}${compositeButtons}${chainModeOption}`;
    }
    function renderDetailBody(r){
      const abstractBlock = r.abstract ? `<details class="detail-section"><summary>Abstract</summary><div class="detail-section-body">${esc(r.abstract)}</div></details>` : "";
      const resourceBlock = `${externalLinks(r)}<div class="actions secondary-actions">${reportIssueLink(r)}</div>`;
      const substrateBadges=unique((r.substrate_types||[]).map(item=>item.family||item.type)).filter(value=>value!=="Other/unspecified substrate").slice(0,2).map(value=>`<span class="badge">${esc(value)}</span>`).join("");
      els.detail.innerHTML = `<p class="detail-title">${esc(r.title)}</p><div class="detail-meta"><span class="badge">${esc(r.state)}</span>${minorSpliceosomeBadge(r)}<span class="badge">${esc(r.species)}</span><span class="badge">${esc(formatResolution(r.resolution)||"?")} A</span><span class="badge">${esc(r.year||"")}</span><span class="badge">${r.chain_count||0} chains</span>${substrateBadges}${curationBadges(r)}</div>${detailSection("Interactive 3D", molstarPanel(r), true)}${detailSection("Resources", resourceBlock)}${detailSection("Curation, Quality, and Audits", curationPanel(r) + unassignedPanel(r.unassigned_components||[]) + qualityPanel(r.quality))}${detailSection("RNA Annotations", substrateTypePanel(r.substrate_types||[]) + rna2dPanel(r.rna_2d||{}) + snrnaPanel(r.snrna_features||[]), Boolean((r.rna_2d&&r.rna_2d.png) || (r.substrate_types||[]).length || (r.snrna_features||[]).length))}${detailSection("Compare Structures", comparisonPanel())}`;
      renderMolstarFeatureButtons();
    }
    function detailSection(title, body, open=false){
      return `<details class="detail-section"${open ? " open" : ""}><summary>${esc(title)}</summary><div class="detail-section-body">${body}</div></details>`;
    }
    function confidenceBadge(v){ const label=v||"n/a"; const cls=label==="high"?"good":label==="review"?"review":label==="low"?"bad":"warn"; return `<span class="badge ${cls}">${esc(label)}</span>`; }
    function curationPanel(r){
      const c=r.curation||{}; const flags=c.flags||[];
      return `<h3>Curation Provenance</h3><div class="detail-grid"><div class="detail-block"><div class="kv"><div>Stage evidence</div><div>${esc(c.stage_evidence||"n/a")}</div><div>Stage confidence</div><div>${confidenceBadge(c.stage_confidence)}</div><div>Homolog confidence</div><div>${confidenceBadge(c.homolog_confidence)}</div><div>Color confidence</div><div>${confidenceBadge(c.color_confidence)}</div><div>RNA ID confidence</div><div>${confidenceBadge(c.rna_identity_confidence)}</div></div></div><div class="detail-block"><div class="kv"><div>Badges</div><div>${(c.badges||[]).map(x=>`<span class="badge ${x==="needs review"?"review":"good"}">${esc(x)}</span>`).join(" ")||"n/a"}</div><div>Flags</div><div>${flags.length?flags.map(x=>`<span class="badge bad">${esc(x)}</span>`).join(" "):'<span class="badge good">none</span>'}</div><div>Protein colors</div><div>${esc(c.colored_proteins||"0")}/${esc(c.protein_count||"0")}</div><div>Unassigned</div><div>${esc(c.unassigned_components||"0")}</div><div>Summary</div><div>${esc(c.curation_summary||"n/a")}</div></div></div></div>`;
    }
    function unassignedPanel(items){
      if(!items.length) return `<h3>Unassigned Components</h3><div class="subtle">No unresolved components in the generated audit.</div>`;
      return `<h3>Unassigned Components (${items.length})</h3><div class="mini-list">${items.map(i=>`<div><strong>${esc(i.gene_name||i.molecule_name)}</strong> <span class="subtle">${esc(i.chains)} · ${esc(i.issue)}</span></div>`).join("")}</div>`;
    }
    function rna2dPanel(item){
      if(!item || !item.png) return "";
      const links = [`<a href="${attr(item.png)}">PNG</a>`];
      if(item.svg) links.push(`<a href="${attr(item.svg)}">SVG</a>`);
      const counts = [item.rna_chain_count ? `${item.rna_chain_count} RNA chains` : "", item.r2dt_chain_count ? `${item.r2dt_chain_count} R2DT layouts` : "", item.failed_chain_count && item.failed_chain_count !== "0" ? `${item.failed_chain_count} failed` : ""].filter(Boolean).join("; ");
      return `<details class="rna-2d-details"><summary>RNA secondary-structure rendering</summary><img class="rna-2d-img" src="${attr(item.png)}" alt="RNA secondary-structure panel for the selected PDB entry" loading="lazy"><div class="subtle">${esc(counts)} ${links.join(" ")}</div>${item.notes ? `<div class="subtle">${esc(item.notes)}</div>` : ""}</details>`;
    }
    function substrateTypePanel(items){
      if(!items.length) return "";
      const grouped=new Map();
      for(const item of items){
        const key=`${item.type}|${item.family}`;
        const group=grouped.get(key)||{...item,chains:[],names:[],pairwiseAlignments:[]};
        group.chains.push(item.chains||"");
        group.names.push(item.molecule_name||"");
        group.pairwiseAlignments.push(...(item.pairwise_alignments||[]));
        grouped.set(key,group);
      }
      return `<h3>Pre-mRNA substrate</h3><div class="mini-list">${[...grouped.values()].map(item=>{
        const pairwise=unique(item.pairwiseAlignments.map(value=>JSON.stringify(value))).map(value=>JSON.parse(value));
        const primaryLinks=[
          item.reference_genbank?`<a href="${attr(item.reference_genbank)}" download title="Download the annotated reference sequence and features for SnapGene.">Annotated reference (GenBank)</a>`:"",
          item.reference_alignment_html?`<a href="${attr(item.reference_alignment_html)}" target="_blank" rel="noopener" title="Open the family-wide reference alignment with modelled and unresolved residues distinguished.">Family alignment</a>`:"",
          ...pairwise.map(alignment=>alignment.alignment_html?`<a href="${attr(alignment.alignment_html)}" target="_blank" rel="noopener">Chain ${esc(alignment.chain)} vs reference</a>`:""),
          ...pairwise.map(alignment=>alignment.alignment_fasta?`<a href="${attr(alignment.alignment_fasta)}" download>Chain ${esc(alignment.chain)} aligned FASTA</a>`:"")
        ].filter(Boolean).join(" · ");
        const advancedLinks=[
          item.reference_alignment?`<a href="${attr(item.reference_alignment)}" download>Family MSA (Clustal)</a>`:"",
          item.reference_alignment_stockholm?`<a href="${attr(item.reference_alignment_stockholm)}" download>Model mask (Stockholm)</a>`:"",
          item.reference_modelled_coverage?`<a href="${attr(item.reference_modelled_coverage)}" download>Modelled-residue coverage</a>`:"",
          item.reference_feature_table?`<a href="${attr(item.reference_feature_table)}" download>Reference feature table</a>`:"",
          item.reference_projection_table?`<a href="${attr(item.reference_projection_table)}" download>All structure projections</a>`:""
        ].filter(Boolean).join(" · ");
        const reference=item.reference_label
          ? ` Curated reference: ${item.reference_url?`<a href="${attr(item.reference_url)}" target="_blank" rel="noopener">${esc(item.reference_label)}</a>`:esc(item.reference_label)}${item.reference_source?` (${esc(item.reference_source)})`:""}.`
          : " No curated construct-level reference is assigned.";
        return `<div><strong>${esc(item.type||item.family)}</strong> ${confidenceBadge(item.confidence)}${primaryLinks?` <span class="reference-links">${primaryLinks}</span>`:""}<br><span class="subtle">Family: ${esc(item.family||"unassigned")}; deposited chain(s): ${esc(unique(item.chains.flatMap(value=>String(value).split(/;\s*/))).join(", ")||"n/a")}. ${esc(item.evidence||"")}${reference}</span>${advancedLinks?`<br><label class="inline-toggle"><input type="checkbox" onchange="this.parentElement.nextElementSibling.hidden=!this.checked"> Advanced files</label><span class="reference-links" hidden>${advancedLinks}</span>`:""}</div>`;
      }).join("")}</div>`;
    }
    function snrnaPanel(items){
      if(!items.length) return "";
      return `<details class="snrna-feature-details"><summary>snRNA feature annotations (${items.length})</summary><div class="snrna-feature-details-body"><div class="subtle">A leading ? marks an uncertain assignment retained with validation warnings.</div><div class="mini-list">${items.map(i=>`<div><strong>${esc(i.snrna||"snRNA")} ${esc(i.label||i.feature)}</strong> <span class="subtle">deposited chain ${esc(i.original_chain_id||"")}, seq ${esc(i.seq_start)}-${esc(i.seq_end)}, residues ${esc(i.auth_residue_ranges||"n/a")}</span><br><code>${esc(i.feature_sequence||"")}</code></div>`).join("")}</div></div></details>`;
    }
    function comparisonPanel(){
      if(!state.compareIds.length) return `<h3>Compare Structures</h3><div class="subtle">Use the Compare column to add up to five structures.</div>`;
      const selected=state.compareIds.map(id=>records.find(r=>r.pdb_id===id)).filter(Boolean);
      return `<h3>Compare Structures (${selected.length})</h3><div class="mini-list"><div class="kv"><div>PDBs</div><div>${selected.map(r=>`<span class="badge">${esc(r.pdb_id.toUpperCase())}</span>`).join(" ")}</div><div>States</div><div>${selected.map(r=>`${esc(r.pdb_id.toUpperCase())}: ${esc(r.state)}`).join("<br>")}</div><div>Species</div><div>${selected.map(r=>`${esc(r.pdb_id.toUpperCase())}: ${esc(r.species)}`).join("<br>")}</div><div>Proteins/RNAs</div><div>${selected.map(r=>`${esc(r.pdb_id.toUpperCase())}: ${r.protein_count}/${r.rna_count}`).join("<br>")}</div><div>Flags</div><div>${selected.map(r=>`${esc(r.pdb_id.toUpperCase())}: ${(r.curation?.flags||[]).join("; ")||"none"}`).join("<br>")}</div></div></div>`;
    }
    function fmtMetric(value, suffix="", digits=2){
      if(value === null || value === undefined || value === "") return "n/a";
      const n = Number(value);
      if(!Number.isFinite(n)) return esc(value);
      return `${n.toFixed(digits)}${suffix}`;
    }
    function fmtInt(value){
      if(value === null || value === undefined || value === "") return "n/a";
      const n = Number(value);
      if(!Number.isFinite(n)) return esc(value);
      return n.toLocaleString();
    }
    function qualityPanel(q){
      if(!q || q.status === "missing") return `<h3>Quality Metrics</h3><div class="subtle">No extracted quality metrics.</div>`;
      const qscore = q.q_score ? `${fmtMetric(q.q_score, "", 3)}${q.q_score_source ? " (" + esc(q.q_score_source) + ")" : ""}` : "not available from PDBe/EMDB API";
      return `<h3>Quality Metrics</h3><div class="detail-grid"><div class="detail-block"><h3>Model Validation</h3><div class="kv"><div>Status</div><div>${esc(q.status||"n/a")}</div><div>Overall quality</div><div>${fmtMetric(q.overall_quality)}</div><div>Geometry quality</div><div>${fmtMetric(q.geometry_quality)}</div><div>Ramachandran outliers</div><div>${fmtMetric(q.rama_outliers_percent,"%")}</div><div>Rotamer outliers</div><div>${fmtMetric(q.rota_outliers_percent,"%")}</div><div>RNA suite outliers</div><div>${fmtMetric(q.rna_suite_outliers_percent,"%")}</div><div>Clashscore</div><div>${fmtMetric(q.clashscore)}</div><div>Q-score</div><div>${qscore}</div></div></div><div class="detail-block"><h3>Map And Experiment Metadata</h3><div class="kv"><div>Primary map</div><div>${esc(q.primary_emdb_id||"n/a")}</div><div>Map resolution</div><div>${fmtMetric(q.map_resolution_A," A")}</div><div>Pixel spacing</div><div>${fmtMetric(q.map_pixel_spacing_A," A",3)}</div><div>Map box</div><div>${esc(q.map_box_size||"n/a")}</div><div>Particles</div><div>${fmtInt(q.particles_used)}</div></div></div></div>`;
    }
    function renderRnaFeatureDefinitions(){
      const q = state.rnaDefinitionQuery;
      const rows = rnaFeatureDefinitions.filter(x=>!q || [x.feature,x.label,x.definition,x.method,x.notes].join(" ").toLowerCase().includes(q));
      els.rnaDefinitionRows.innerHTML = rows.map(x=>`<tr><td><strong>${esc(x.label||x.feature)}</strong><br><code>${esc(x.feature||"")}</code></td><td>${esc(x.definition||"")}</td><td>${esc(x.method||"")}</td><td>${esc(x.notes||"")}</td></tr>`).join("") || '<tr><td colspan="4" class="subtle">No RNA feature definitions match.</td></tr>';
    }
    function renderGuideCards(container, items, titleKey, fields, groupKey=""){
      const fieldLabel = field => ({stage:"Classification",composition:"Composition",transition:"Next transition",notes:"Scope",function:"Function",interactors:"Interactions",remodeling:"Remodeling",helicases:"ATPases / helicases"}[field] || field.replace(/_/g," "));
      const card = item => `<article class="doc-section"><h3>${esc(item[titleKey]||"")}</h3><div class="kv">${fields.map(field=>`<div>${esc(fieldLabel(field))}</div><div>${esc(item[field]||"n/a")}</div>`).join("")}</div></article>`;
      if(!items.length){ container.innerHTML='<div class="subtle">No guide entries available.</div>'; return; }
      if(!groupKey){ container.innerHTML=items.map(card).join(""); return; }
      const grouped=new Map();
      for(const item of items){ const group=item[groupKey]||"Other"; if(!grouped.has(group))grouped.set(group,[]); grouped.get(group).push(item); }
      container.innerHTML=[...grouped.entries()].map(([group,rows])=>`<h3 class="guide-group-heading">${esc(group)}</h3>${rows.map(card).join("")}`).join("");
    }
    function renderProteinComplexGuide(){
      const fields = ["joins","leaves","role","remodeling","key_factors"];
      els.proteinComplexGuide.innerHTML = (DATA.guides.protein_complexes || []).map(item=>`<div class="doc-section"><h3>${esc(item.name||"")}</h3><div class="kv">${fields.map(field=>`<div>${esc(field.replace(/_/g," "))}</div><div>${esc(item[field]||"n/a")}</div>`).join("")}</div>${proteinComplexPaletteHtml(item.name||"")}</div>`).join("") || '<div class="subtle">No guide entries available.</div>';
    }
    function proteinComplexPaletteHtml(name){
      const rows = proteinLookup.filter(p=>p.color_hex && proteinMatchesComplexName(p,name)).sort((a,b)=>String(a.class_family||"").localeCompare(String(b.class_family||"")) || String(a.display_name||a.color_key||a.human_gene||"").localeCompare(String(b.display_name||b.color_key||b.human_gene||"")));
      if(!rows.length) return '<div class="subtle" style="margin-top:10px">No protein colors currently assigned to this guide category.</div>';
      return `<div class="palette-row" aria-label="Color palette used for ${attr(name)}">${rows.slice(0,28).map(p=>`<span class="palette-chip" title="${attr([p.display_name||p.color_key||p.human_gene||"",p.class_family||"",p.color_hex].join(" "))}"><span class="swatch" style="background:${attr(p.color_hex)}"></span><span>${esc(p.display_name||p.color_key||p.human_gene||"")}</span></span>`).join("")}${rows.length>28?`<span class="subtle">+${rows.length-28} more</span>`:""}</div>`;
    }
    function proteinMatchesComplexName(p, name){
      const hay = proteinAssociationText(p);
      const label = String(name || "").toLowerCase();
      const groups = [
        {needles:["u1 snrnp"], terms:["u1 snrnp","u1-associated","u1 associated","snrnp70","snrpc","snrpa"]},
        {needles:["u2 snrnp","sf3b"], terms:["u2 snrnp","sf3","sf3a","sf3b","u2-associated","u2 associated"]},
        {needles:["u4/u6.u5","tri-snrnp"], terms:["tri-snrnp","u4/u6","u4 snrnp","u6 snrnp","u5 snrnp","lsm","snrnp200","prpf3","prpf4","prpf31"]},
        {needles:["u5 snrnp"], terms:["u5 snrnp","prpf8","prp8","snrnp200","eftud2","prpf6","txnl4a","cd2bp2"]},
        {needles:["ntc-related","ntr complex"], terms:["ntc/ntr related","aquarius","aqr","bud31","ppie","syf1","syf2","isy1","crnkl1","snw1","rbm22","cwc2"]},
        {needles:["ntc"], terms:["ntc/prp19","prpf19","cdc5l","plrg1","bcas2","spf27"]},
        {needles:["catalytic atpases","step factors","activation"], terms:["dhx16","dhx38","dhx8","dhx15","cwc25","ccdc49","ccdc94","aquarius","prp2","prp16","prp22","prp43","remodel"]},
        {needles:["ejc"], terms:["ejc","mrnp","eif4a3","magoh","rbm8a","casc3","mln51"]},
        {needles:["disassembly","recycling"], terms:["disassembly","recycling","dhx15","prp43","tfip11","gcfc","paxbp1","gpatch1","dhx35","c19l"]},
      ];
      const group = groups.find(g=>g.needles.some(n=>label.includes(n)));
      return group ? group.terms.some(t=>hay.includes(t)) : hay.includes(label);
    }
    function rnaConsistencyBadge(status){
      if(status==="consistent") return '<span class="badge good">consistent</span>';
      if(status==="partial_resolved") return '<span class="badge warn">partial resolved</span>';
      if(status==="not_resolved") return '<span class="badge">not resolved</span>';
      if(status==="inconsistent") return '<span class="badge bad">inconsistent</span>';
      return `<span class="badge">${esc(status||"n/a")}</span>`;
    }
    function renderRnaConsistency(){
      const rank = {inconsistent:0, partial_resolved:1, not_resolved:2, consistent:3};
      const rows = [...rnaFeatureConsistency].sort((a,b)=>(rank[a.status]??9)-(rank[b.status]??9) || String(a.family_label).localeCompare(String(b.family_label)) || String(a.feature).localeCompare(String(b.feature))).slice(0,170);
      els.rnaConsistencyRows.innerHTML = rows.map(x=>`<tr><td><strong>${esc(x.family_label||"")}</strong><br><span class="subtle">${esc(x.sequence_length||"")} nt</span></td><td>${esc(x.label||x.feature)}<br><code>${esc(x.expected_seq_start)}-${esc(x.expected_seq_end)} ${esc(x.expected_sequence||"")}</code></td><td>${rnaConsistencyBadge(x.status)}</td><td>${esc(x.observed_count||"0")} / ${esc(x.missing_count||"0")} / ${esc(x.conflict_count||"0")}</td><td><span class="subtle">seen:</span> ${esc(x.observed_members||"none")}<br>${x.missing_members?`<span class="subtle">missing:</span> ${esc(x.missing_members)}<br>`:""}${x.conflicting_members?`<span class="subtle">conflicts:</span> ${esc(x.conflicting_members)}`:""}</td></tr>`).join("") || '<tr><td colspan="5" class="subtle">No repeated RNA feature audit rows.</td></tr>';
    }
    function renderProteins(){
      const q = state.proteinQuery;
      const rows = proteinLookup.filter(p=>proteinComplexMatches(p) && (!q || [p.display_name,p.human_gene,p.protein_name,p.class_family,p.aliases?.join(" "),systematicChainText(p),homologItems(p).map(h=>`${h.species_code} ${h.gene} ${h.entry||""}`).join(" ")].join(" ").toLowerCase().includes(q)));
      const resolved = rows.filter(p=>(p.seen_in_pdb_ids||[]).length);
      const referenceOnly = rows.filter(p=>!(p.seen_in_pdb_ids||[]).length);
      els.resultSubtitle.textContent = q ? `${rows.length} matching components` : `${proteinLookup.length} component and homolog records`;
      els.proteinCount.textContent = `${resolved.length} resolved; ${referenceOnly.length} reference-only`;
      const rowHtml = p=>{ const color=p.color_hex||""; const homologs=homologItems(p).map(h=>`${esc(h.species_code)}: ${esc(h.gene)}`).join("<br>"); const sysIds=systematicChainHtml(p); return `<tr><td><strong>${esc(p.display_name||p.human_gene||p.color_key||"")}</strong><br><span class="subtle">${esc(p.protein_name||"")}</span></td><td>${esc(p.class_family||"")}</td><td>${esc((p.aliases||[]).join("; "))}</td><td>${color?`<span class="swatch" style="background:${attr(color)}"></span>${esc(color)} <button class="copy-button" onclick="copyText('${attr(color)}', this)">Copy</button>`:""}</td><td>${sysIds || '<span class="subtle">n/a</span>'}</td><td>${homologs}</td><td>${esc((p.seen_in_pdb_ids||[]).slice(0,10).join("; "))}</td></tr>`; };
      els.proteinRows.innerHTML = resolved.map(rowHtml).join("") + (referenceOnly.length ? `<tr><td colspan="7"><details><summary><strong>${referenceOnly.length} reference-only proteins</strong> <span class="subtle">listed in reference/color tables but not resolved in the current PDB set</span></summary><table class="mini-table"><tbody>${referenceOnly.map(rowHtml).join("")}</tbody></table></details></td></tr>` : "");
    }
    function systematicChainIds(p){
      return unique((p.canonical_chain_ids || []).map(c=>c.chain_id || c.canonical_base_id || c.canonical_chain_id));
    }
    function systematicChainText(p){
      return (p.canonical_chain_ids || []).map(c=>`${c.identity || c.canonical_identity || ""} ${c.subcomplex || ""} ${c.chain_id || c.canonical_base_id || c.canonical_chain_id || ""}`).join(" ");
    }
    function systematicChainHtml(p){
      const rows = p.canonical_chain_ids || [];
      if(!rows.length) return "";
      return rows.map(c=>{
        const id = c.chain_id || c.canonical_base_id || c.canonical_chain_id || "";
        const identity = c.identity || c.canonical_identity || "";
        const context = c.subcomplex || "";
        const label = identity && identity !== (p.color_key || p.human_gene || "") ? identity : context;
        return `<div class="systematic-id-row"><code>${esc(id)}</code>${label?`<span class="subtle">${esc(label)}</span>`:""}</div>`;
      }).join("");
    }
    function homologItems(p){
      const homologs = p.homologs || [];
      if (Array.isArray(homologs)) return homologs;
      return Object.values(homologs).flat();
    }
    function proteinComplexMatches(p){
      if(state.proteinComplex === "all") return true;
      const hay=proteinAssociationText(p);
      const groups={
        snrnp_u1:["u1 snrnp","u1-associated","snrnp70","snrpc","snrpa"],
        snrnp_u2:["u2 snrnp","u2/sf3b","sf3a","sf3b","u2-associated","17s u2"],
        snrnp_tri:["tri-snrnp","u4/u6","u4 snrnp","u6 snrnp","prpf3","prpf4","prpf31"],
        snrnp_u5:["u5 snrnp","prpf8","prp8","snrnp200","eftud2","prpf6","txnl4a","cd2bp2"],
        sm_lsm:["sm ring","lsm"," u1 sm "," u2 sm "," u4 sm "," u5 sm "],
        ntc:["ntc","prp19","prpf19","cdc5l","plrg1","bcas2","spf27"],
        ntr:["ntr","dhx16","dhx38","dhx8","dhx15","cwc25","ccdc49","ccdc94","prp2","prp16","prp22","aquarius","remodel"],
        res:["res complex","bud13","rbmx2","snip1"],
        step2:["second step","second-step","slu7","prp18","cactin"],
        ejc:["ejc","mrnp","eif4a3","magoh","rbm8a","casc3","mln51"],
        disassembly:["disassembly","recycling","tfip11","gcfc","paxbp1","gpatch1","dhx35","c19l"]
      };
      const matches = terms => (terms||[]).some(term=>hay.includes(term));
      if(state.proteinComplex === "other") return !Object.values(groups).some(matches);
      return matches(groups[state.proteinComplex]);
    }
    function proteinAssociationText(p){
      return [p.display_name,p.human_gene,p.protein_name,p.class_family,p.color_key,(p.aliases||[]).join(" "),(p.canonical_chain_ids||[]).map(c=>[c.identity||c.canonical_identity,c.subcomplex,c.chain_id].join(" ")).join(" ")].join(" ").toLowerCase();
    }
    init().catch(error => {
      document.body.innerHTML = `<main style="padding:24px;font:14px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.45;max-width:760px"><h1>Could not load dashboard data</h1><p>${esc(error.message)}</p><p>This dashboard loads structure metadata, Mol* color selections, and clickable RNA feature definitions from <code>data/structures.json</code>. Open it through a local web server from the repository root, not directly as a <code>file://</code> URL.</p><pre style="padding:12px;background:#f3f5f7;border:1px solid #d8dee6;border-radius:8px;overflow:auto">cd /Users/matthias.vorlaender/Library/CloudStorage/OneDrive-VBC/spliceosome-cryoem-dashboard
python3 -m http.server 8765 --bind 127.0.0.1</pre><p>Then open <code>http://127.0.0.1:8765/</code>.</p></main>`;
    });
    
