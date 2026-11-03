
    const EMBEDDED_SPLICING_CYCLE_SVG = "";
    const DATA = { records: [], protein_lookup: [], primary_map_scripts: {}, proximity: {available:false, proteins:[]}, splicing_cycle_svg: "", guides: {rna_elements: [], protein_complexes: [], splicing_cycle: []}, universal_systematic_coloring_script: "", scriptCache: {} };
    let records = [];
    let proteinLookup = [];
    let rnaFeatureDefinitions = [];
    let rnaFeatureConsistency = [];
    const state = { activeTab:"structures", structureQuery:"", proteinQuery:"", mode:"all", family:"all", species:"all", substrateType:"all", rnaFeature:"all", rnaFeatureSearch:"", cyclePdbIds:[], cyclePdbLabel:"", rnaDefinitionQuery:"", proteinComplex:"all", helperSource:"github", localRepoPath:"", proximityResults:[], proximityQuerySummary:"", sortBy:"pathway", sortDir:"asc", chainMode:"original", selected: records[0]?.pdb_id || "", compareIds: [], molstarPdbId:"", molstarViewer:null, sidebarCollapsed:false, depthCue:true, panelOnly:false, mobilePane:"cycle" };
    const comparisonView = { onlyDifferences: true, tab: '3d' };
    const els = {};
    for (const id of ["sidebarToggle","atlasNavButton","componentsNavButton","mobileViewSwitch","search","searchMode","family","species","substrateTypeFilter","rnaFeatureFilter","rnaFeatureQuickSearch","rnaFeatureQuickResults","rnaQuickFilters","activeFilterPanel","activeFilterChips","filterHint","rnaDefinitionSearch","rnaDefinitionRows","cycleStateGuide","rnaElementGuide","proteinComplexGuide","proteinComplexFilter","helperSource","localRepoPath","proximityView","proximityProtein","proximityProteinOptions","proximityStart","proximityEnd","proximityScope","proximityDistance","proximitySpecies","runProximitySearch","downloadProximityCsv","copyProximityCxc","proximityDeduplicate","proximityCoverage","proximityStatus","proximityRows","localCopyView","sortBy","reset","tabs","structuresView","rnaFeaturesView","cycleStatesView","rnaElementsView","complexesView","proteinsView","documentationView","helpView","stats","cycle","cycleContext","rows","detail","tableCount","resultSubtitle","selectedId","selectedScriptActions","proteinRows","proteinCount"]) els[id] = document.getElementById(id);
    const STAGES = ["U1 snRNP","U11 snRNP","U2 snRNP","U6 snRNP","U6 snRNA biogenesis","E complex","A complex","U5/tri-snRNP","pre-B","B","pre-Bact","Bact","B*","B*D complex","C","C*","P","ILS/disassembly","DIS","U5 recycling"];
    const ORDER = Object.fromEntries(STAGES.map((s,i)=>[s,i]));
    const STATE_COLORS = {
      "U1 snRNP":"#187A4A", "U11 snRNP":"#187A4A", "U2 snRNP":"#187A4A", "U6 snRNP":"#187A4A", "U6 snRNA biogenesis":"#187A4A", "U5/tri-snRNP":"#187A4A", "U5 recycling":"#006A2B",
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
    let molstarVisibilityObserver = null;
    let renderedDetailId = null;
    function esc(v){return String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
    function attr(v){return esc(v);}
    function unique(values){return [...new Set(values.filter(Boolean))].sort();}
    function formatResolution(value){
      if(value === null || value === undefined || value === "") return "";
      const number = Number.parseFloat(value);
      return Number.isFinite(number) ? number.toFixed(1) : String(value);
    }
    let hideAnnotationHelp = () => {};
    async function init(){
      initBadgeHelp();
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
      state.panelOnly = Boolean(panelRecord && !params.has("atlas"));
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
      updateProximityScope();
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
      document.querySelector('.search-cluster').hidden = state.activeTab === 'comparison';
      els.search.value = componentView ? state.proteinQuery : state.structureQuery;
      els.search.placeholder = componentView ? "Protein, homolog, alias, chain ID" : "PDB, title, state, author, species";
      els.search.setAttribute("aria-label", componentView ? "Find components" : "Find structures");
      const refine = document.querySelector(".refine-drawer");
      if(refine){ refine.hidden = componentView; if(componentView) refine.open = false; }
    }
    function setMobilePane(pane){
      state.mobilePane = state.panelOnly ? "detail" : ["cycle","structures","detail"].includes(pane) ? pane : "cycle";
      document.body.classList.remove("mobile-pane-cycle","mobile-pane-structures","mobile-pane-detail");
      document.body.classList.add(`mobile-pane-${state.mobilePane}`);
      if(els.mobileViewSwitch) for(const button of els.mobileViewSwitch.querySelectorAll("button")){
        const active = button.dataset.mobilePane === state.mobilePane;
        button.classList.toggle("active", active);
        if(active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      }
      reconcileMolstarVisibility();
      requestAnimationFrame(fitCycleArt);
    }
    function activateSort(header){
      const key=header.dataset.sort;
      if(!key)return;
      if(state.sortBy===key) state.sortDir=state.sortDir==="asc"?"desc":"asc";
      else { state.sortBy=key; state.sortDir=["year","chains","proteins"].includes(key)?"desc":"asc"; }
      if([...els.sortBy.options].some(option=>option.value===key)) els.sortBy.value = key;
      render();
    }
    function populateProximityProteins(){
      const proteins = DATA.proximity.proteins || [];
      els.proximityProteinOptions.innerHTML = proteins.map(p=>`<option value="${attr(p.name)}">${esc(p.name)} (${p.pdbs} PDBs)</option>`).join("");
      const maxDistance = Number(DATA.proximity.max_distance_a || 0);
      els.proximityDistance.max = maxDistance || "";
      els.proximityCoverage.textContent = DATA.proximity.available ? `${DATA.proximity.structures_indexed || 0} indexed structures · ${proteins.length} proteins · ≤${maxDistance} Å` : "Proximity index not bundled";
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
      // Run before Mol*'s debounced resize handler can allocate a zero-sized framebuffer.
      window.addEventListener("resize",()=>{ reconcileMolstarVisibility(); requestAnimationFrame(fitCycleArt); },{capture:true});
      els.search.addEventListener("input",()=>{
        // Keep the input verbatim: trimming on each keystroke deletes spaces
        // before the next word can be typed. Normalize only for matching.
        const query=els.search.value;
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
      els.sortBy.addEventListener("change",()=>{state.sortBy=els.sortBy.value; state.sortDir = ["year","chains","proteins"].includes(state.sortBy) ? "desc" : "asc"; render();});
      els.tabs.addEventListener("click",event=>{const b=event.target.closest("button"); if(!b)return; if(b.dataset.tab==='comparison' && state.activeTab!=='comparison')comparisonView.tab='3d'; state.activeTab=b.dataset.tab; for(const x of els.tabs.querySelectorAll("button")) x.classList.toggle("active",x===b); if(els.atlasNavButton) els.atlasNavButton.classList.toggle("active",state.activeTab==="structures"); if(els.componentsNavButton) els.componentsNavButton.classList.toggle("active",state.activeTab==="proteins"); const drawer=b.closest(".tools-drawer"); if(drawer) drawer.open=false; render();});
      document.addEventListener("click", event=>{const th=event.target.closest("th[data-sort]"); if(th) activateSort(th);});
      document.addEventListener("keydown", event=>{const th=event.target.closest("th[data-sort]"); if(!th || !["Enter"," "].includes(event.key))return; event.preventDefault(); activateSort(th);});
      if(els.mobileViewSwitch) els.mobileViewSwitch.addEventListener("click",event=>{const button=event.target.closest("button[data-mobile-pane]"); if(button)setMobilePane(button.dataset.mobilePane);});
      els.runProximitySearch.addEventListener("click", runProximitySearch);
      els.copyProximityCxc.addEventListener("click",copyProximityChimeraX);
      els.downloadProximityCsv.addEventListener("click", downloadProximityCsv);
      els.proximityDeduplicate.addEventListener("change", updateProximityResultPresentation);
      els.proximitySpecies.addEventListener("change", updateProximityResultPresentation);
      for(const input of [els.proximityProtein, els.proximityStart, els.proximityEnd, els.proximityDistance]) input.addEventListener("keydown", event=>{if(event.key==="Enter"){event.preventDefault(); runProximitySearch();}});
      els.proximityScope.addEventListener("change",updateProximityScope);
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
    function normalizeSearch(value){
      return String(value || "").toLowerCase().replace(/[′’‘`]/g,"'").replace(/[_‐‑–—-]/g," ")
        .replace(/\b([35])\s*(?:'|prime)?\s*(?:splice\s*site|ss)\b/g,"$1ss")
        .replace(/\bsplice site ([35])\b/g,"$1ss")
        .replace(/\bhomo sapiens\b/g,"human").replace(/\bsaccharomyces cerevisiae\b/g,"budding yeast")
        .replace(/\bschizosaccharomyces pombe\b/g,"fission yeast").replace(/\s+/g," ").trim();
    }
    function matchesSearch(query, text){
      const hay=normalizeSearch(text);
      // Spaces require every term; commas separate alternatives. Empty clauses do not match everything.
      const alternatives=String(query || "").split(",").map(normalizeSearch).filter(Boolean);
      return !alternatives.length || alternatives.some(part=>part.split(" ").every(term=>hay.includes(term)));
    }
    function exactStageForQuery(query){
      const needle=String(query||"").trim().toLowerCase();
      if(!needle)return "";
      return STAGES.find(stage=>{const label=stage.toLowerCase(); return needle===label || needle===label.replace(/\s+complex$/,"") || needle===label.split("/")[0];}) || "";
    }
    function parseStructureSearchClause(clause){
      const exact=exactStageForQuery(clause);
      if(exact) return {stages:new Set([exact]),text:""};
      let remaining=normalizeSearch(clause);
      const aliases=STAGES.flatMap(stage=>{
        const label=normalizeSearch(stage);
        // A bare U5 in a multi-term query can name the RNA component. Only
        // use its full stage label here; preserve legacy exact-query aliases.
        return [...new Set([label,label.replace(/\s+complex$/,""),...(label.startsWith("ils/")?["ils"]:[])])].map(alias=>({stage,alias}));
      }).sort((a,b)=>b.alias.length-a.alias.length);
      const stages=new Set();
      for(const {stage,alias} of aliases){
        // Do not interpret the ordinary article "a" as A complex.
        if(alias==="a" && !/(?:^|\s)A(?:\s|$)/.test(clause) && !/(?:^|\s)a\s+complex(?:\s|$)/i.test(clause)) continue;
        const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
        const expression=new RegExp(`(^|\\s)${escaped}(?:\\s+complex)?(?=\\s|$)`,"g");
        remaining=remaining.replace(expression,(_match,prefix)=>{stages.add(stage);return prefix;}).replace(/\s+/g," ").trim();
      }
      return {stages,text:remaining};
    }
    function parseStructureSearch(query){
      return String(query || "").split(",").map(part=>part.trim()).filter(Boolean).map(parseStructureSearchClause);
    }
    function matchesStructureSearch(query, record, hay, parsed=null){
      const clauses=parsed || parseStructureSearch(query);
      return !clauses.length || clauses.some(({stages,text})=>stages.size<=1 && (!stages.size || stages.has(record.state)) && matchesSearch(text,hay));
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
      const query = state.structureQuery.trim().toLowerCase();
      const searchClauses=parseStructureSearch(state.structureQuery);
      return records.filter(r=>{
        const fields = fieldsFor(r);
        const parts = state.mode === "all" ? fields.all : [...fields.structure, ...(fields[state.mode] || [])];
        const hay = parts.join(" ").toLowerCase();
        const familyOk = options.ignoreFamily || state.family==="all" || r.state===state.family;
        const cycleOk = options.ignoreCyclePdb || !state.cyclePdbIds.length || state.cyclePdbIds.includes(String(r.pdb_id || "").toLowerCase());
        const queryOk = !query || matchesStructureSearch(state.structureQuery,r,hay,searchClauses);
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
      hideAnnotationHelp();
      renderComparison();
      updateSearchContext();
      setMobilePane(state.mobilePane);
      if(els.atlasNavButton){ const active=state.activeTab === "structures"; els.atlasNavButton.classList.toggle("active",active); els.atlasNavButton.setAttribute("aria-pressed",String(active)); }
      if(els.componentsNavButton){ const active=state.activeTab === "proteins"; els.componentsNavButton.classList.toggle("active",active); els.componentsNavButton.setAttribute("aria-pressed",String(active)); }
      els.structuresView.hidden = state.activeTab !== "structures";
      document.getElementById('comparisonView').hidden = state.activeTab !== 'comparison';
      els.proximityView.hidden = state.activeTab !== "proximity";
      els.rnaFeaturesView.hidden = state.activeTab !== "rnaFeatures";
      els.cycleStatesView.hidden = state.activeTab !== "cycleStates";
      els.rnaElementsView.hidden = state.activeTab !== "rnaElements";
      els.complexesView.hidden = state.activeTab !== "complexes";
      els.proteinsView.hidden = state.activeTab !== "proteins";
      els.documentationView.hidden = state.activeTab !== "documentation";
      els.helpView.hidden = state.activeTab !== "help";
      els.localCopyView.hidden = state.activeTab !== "localCopy";
      if(state.activeTab === 'comparison'){
        els.resultSubtitle.textContent = 'Compare selected structures';
        return;
      }
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
        {label:"snRNP/protein pool", stages:["U1 snRNP","U11 snRNP","U2 snRNP","U6 snRNP","U6 snRNA biogenesis","U5/tri-snRNP","U5 recycling"], x:39.0, y:5.0, w:16.0, h:23.0},
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
        rna:"Isolated U1, U11, U2, U6 and tri-snRNP particles plus recycling and biogenesis assemblies.",
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
      els.cycle.innerHTML = `<div class="cycle-art" aria-label="Splicing cycle pathway filter">${svg}${hotspots.map((item,i)=>{ const count=cycleHotspotCount(item, rows); const active=cycleHotspotActive(item); const info=cycleHoverInfo(item,count); const label=`${info.title}, ${info.count} structures. RNA: ${info.rna} Helicase: ${info.helicase} Change: ${info.change}`; return `<button type="button" class="cycle-hotspot ${active?"active":""} ${count?"":"empty-stage"}" data-cycle-hotspot="${i}" aria-pressed="${active}" style="${cycleHotspotStyle(item)}" aria-label="${attr(label)}">${cycleTooltipHtml(item,count)}</button>`; }).join("")}</div>`;
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
      els.rows.innerHTML = rows.map(r=>{ const inCompare=state.compareIds.includes(r.pdb_id); const selected=r.pdb_id===state.selected; const pdbe=r.pdbe_url || `https://www.ebi.ac.uk/pdbe/entry/pdb/${r.pdb_id}`; const meta=[r.species, `${r.protein_count||0} protein`, `${r.rna_count||0} RNA`].filter(Boolean).join(" / "); const pdbColor=stateColor(r.state); const substrate=substrateTypeLabel(r); return `<tr class="${selected?"selected":""}" data-pdb="${attr(r.pdb_id)}" tabindex="0" aria-selected="${selected}" aria-label="Select ${attr(r.pdb_id.toUpperCase())}: ${attr(r.title)}"><td class="pdb"><a href="?structure=${attr(r.pdb_id)}" title="Select this structure" onclick="event.preventDefault()" style="--state-color:${attr(pdbColor)}">${esc(r.pdb_id)}</a></td><td class="preview-cell">${tableThumbnail(r)}</td><td>${esc(r.species)}</td><td class="title-cell"><div class="truncate" title="${attr(r.title)}">${esc(r.title)}</div><div class="row-card-meta">${esc(meta)}</div></td><td><div>${esc(r.state)}</div>${minorSpliceosomeBadge(r)}${transSpliceosomeBadge(r)}</td><td title="${attr(substrate)}">${esc(substrate)}</td><td>${esc(formatResolution(r.resolution))}</td><td>${esc(r.year||"")}</td><td>${r.chain_count||0}</td><td>${r.protein_count} protein<br>${r.rna_count} RNA</td><td class="rna-badge-cell">${rnaAnnotationBadges(r)}</td><td>${curationBadges(r, false)}</td><td><button type="button" class="compare-toggle ${inCompare?"active":""}" data-compare="${attr(r.pdb_id)}" aria-pressed="${inCompare}" aria-label="${inCompare ? "Remove" : "Add"} ${attr(r.pdb_id.toUpperCase())} ${inCompare ? "from" : "to"} comparison" ${!inCompare && state.compareIds.length>=5 ? "disabled" : ""}>${inCompare?"Added":"Add"}</button></td></tr>`; }).join("");
      const selectRow = row => {
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
      url.searchParams.delete("atlas");
      url.searchParams.set("panel", String(pdbId || "").toLowerCase());
      return url.toString();
    }
    function atlasUrl(pdbId){
      const url=new URL(window.location.href);url.searchParams.delete('panel');url.searchParams.set('structure',pdbId);url.searchParams.set('atlas','1');return url.toString();
    }
    function stateColor(stage){
      return STATE_COLORS[String(stage || "")] || "#0b5cab";
    }
    const proximityLoadPromises = new Map();
    let proximitySearchIntent=0;
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
      promise.catch(()=>proximityLoadPromises.delete(entry.name));
      return promise;
    }
    function updateProximityScope(){
      const whole=els.proximityScope.value==='whole';
      for(const input of [els.proximityStart,els.proximityEnd]){input.disabled=whole;input.closest('.field').hidden=whole;}
    }
    function proximityRange(scope,startValue,endValue){
      if(scope==='whole')return null;
      if(!String(startValue).trim() || !String(endValue).trim() || !Number.isInteger(Number(startValue)) || !Number.isInteger(Number(endValue)))throw new Error('Enter integer residue numbers for both ends, or choose Whole protein.');
      const values=[Number(startValue),Number(endValue)].sort((a,b)=>a-b);return {start:values[0],end:values[1]};
    }
    function proximityMatches(payload,recordByPdb,protein,range,distance){
      const best=new Map();
      for(const [pdbId,rows] of payload.pdbs || []){
        if(!recordByPdb.has(pdbId))continue;
        for(const row of rows){
          const sourceNumber=row[2],minDistance=row[6]===null || row[6]===undefined ? NaN : Number(row[6]);
          if(!Number.isFinite(minDistance) || minDistance<0 || minDistance>distance)continue;
          if(range && (sourceNumber===null || sourceNumber===undefined || !Number.isFinite(Number(sourceNumber)) || Number(sourceNumber)<range.start || Number(sourceNumber)>range.end))continue;
          const key=`${pdbId}\t${row[4]}`,previous=best.get(key);
          if(!previous || minDistance<previous.min_distance_a)best.set(key,{query_protein:protein,query_scope:range?'residue range':'whole protein',query_start:range?.start??'',query_end:range?.end??'',cutoff_a:distance,pdb_id:pdbId,source_chain:row[0],source_auth_seq:row[1],source_label_seq:row[3],target_protein:row[4],target_chain:row[5],min_distance_a:minDistance,target_auth_seq:row[7],target_label_seq:row[8],record:recordByPdb.get(pdbId)});
        }
      }
      return [...best.values()].sort((a,b)=>a.min_distance_a-b.min_distance_a || String(a.target_protein).localeCompare(String(b.target_protein)) || String(a.pdb_id).localeCompare(String(b.pdb_id)));
    }
    async function runProximitySearch(){
      // Every attempt supersedes earlier loads, including invalid newer input.
      const intent=++proximitySearchIntent;
      els.runProximitySearch.disabled=!DATA.proximity.available;
      if(!DATA.proximity.available){els.proximityStatus.textContent="The proximity index is unavailable in this release.";return;}
      const entry = proximityCatalogEntry(els.proximityProtein.value);
      let range;
      try{range=proximityRange(els.proximityScope.value,els.proximityStart.value,els.proximityEnd.value);}
      catch(error){els.proximityStatus.textContent=error.message;return;}
      const distance=Number(els.proximityDistance.value);
      const maxDistance=Number(DATA.proximity.max_distance_a||0);
      if(!entry){ els.proximityStatus.textContent="Choose one protein identity from the available list."; return; }
      if(!(distance>0)||distance>maxDistance){ els.proximityStatus.textContent=`Enter a distance greater than 0 and no more than ${maxDistance} A.`; return; }
      const recordByPdb=new Map(records.map(r=>[r.pdb_id,r]));
      els.proximityProtein.value=entry.name;
      els.runProximitySearch.disabled=true;
      els.proximityStatus.textContent=`Loading ${entry.name} proximity index...`;
      try{
        const payload=await loadProximityPayload(entry);
        if(intent!==proximitySearchIntent)return;
        state.proximityResults=proximityMatches(payload,recordByPdb,entry.name,range,distance);
        state.proximityQuerySummary=`${entry.name} ${range?`residues ${range.start}-${range.end}`:'whole protein (indexed modelled residues)'} within ${distance} Å`;
        updateProximityResultPresentation();
      }catch(error){
        if(intent!==proximitySearchIntent)return;
        state.proximityResults=[];
        renderProximityResults();
        els.downloadProximityCsv.disabled=true;
        els.copyProximityCxc.disabled=true;
        els.proximityStatus.textContent=`Proximity index error: ${error.message}`;
      }finally{
        if(intent===proximitySearchIntent)els.runProximitySearch.disabled=!DATA.proximity.available;
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
      const modelCount=new Set(rows.map(row=>row.pdb_id)).size;
      els.copyProximityCxc.textContent=shown?`Copy CXC (${modelCount} models)`:'Copy CXC';
      els.copyProximityCxc.title=shown?`Copies scripts for all ${modelCount} representative models shown. Paste into ChimeraX to open them; restrict the species or residue range for fewer models.`:'Copy model-only ChimeraX scripts for the results';
      els.proximityStatus.textContent = state.proximityResults.length ? `${shown} shown for ${state.proximityQuerySummary}.` : `No proteins matched ${state.proximityQuerySummary}.`;
      renderProximityResults();
    }
    function renderProximityResults(){
      const rows=proximityDisplayResults();
      if(!rows.length){ els.proximityRows.innerHTML='<tr><td colspan="7" class="proximity-empty">No proteins matched this query and cutoff.</td></tr>'; return; }
      els.proximityRows.innerHTML=rows.map(item=>`<tr><td>${comparisonSwatch((item.record?.molstar_color_selections||[]).find(component=>component.auth_asym_id===item.target_chain)?.color)}<strong>${esc(item.target_protein)}</strong>${item.associated_pdb_count>1?`<div class="subtle">${item.associated_pdb_count} PDBs: ${esc(item.associated_pdb_ids.slice(0,5).join(", "))}${item.associated_pdb_count>5?` +${item.associated_pdb_count-5} more (CSV)`:""}</div>`:""}</td><td><span class="pdb">${esc(item.pdb_id.toUpperCase())}</span><br><span class="subtle">${esc(item.record?.state||"")}</span></td><td>${esc(item.record?.species||"")}</td><td class="proximity-distance">${item.min_distance_a.toFixed(3)} A</td><td>${esc(item.query_protein)} / ${esc(item.source_chain)}:${esc(item.source_auth_seq)}</td><td>${esc(item.target_protein)} / ${esc(item.target_chain)}:${esc(item.target_auth_seq)}</td><td><button class="button" type="button" data-proximity-pdb="${attr(item.pdb_id)}">View</button></td></tr>`).join("");
    }
    function downloadProximityCsv(){
      const fields=["query_protein","query_scope","query_start","query_end","cutoff_A","nearby_protein","representative_pdb_id","associated_pdb_count","associated_pdb_ids","state","species","min_distance_A","query_chain","query_auth_residue","nearby_chain","nearby_auth_residue"];
      const lines=[fields.join(",")];
      for(const item of proximityDisplayResults()){
        lines.push([item.query_protein,item.query_scope,item.query_start,item.query_end,item.cutoff_a,item.target_protein,item.pdb_id,item.associated_pdb_count,item.associated_pdb_ids.join("; "),item.record?.state||"",item.record?.species||"",item.min_distance_a,item.source_chain,item.source_auth_seq,item.target_chain,item.target_auth_seq].map(csvCell).join(","));
      }
      const blob=new Blob([lines.join("\n")+"\n"],{type:"text/csv;charset=utf-8"});
      const url=URL.createObjectURL(blob); const link=document.createElement("a"); link.href=url; link.download="spliceosome_proximity_results.csv"; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    }
    async function copyProximityChimeraX(){
      const button=els.copyProximityCxc;
      button.disabled=true;
      try{await copyText(await proximityChimeraXScript(),button);}
      catch(error){
        els.proximityStatus.textContent=`Could not copy the ChimeraX script: ${error.message}. Try again when the scripts and clipboard are available.`;
      }finally{button.disabled=!proximityDisplayResults().length;}
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
    function initBadgeHelp(){
      const popup=document.createElement("div");
      popup.id="annotationBadgeHelp";
      popup.className="annotation-badge-help";
      popup.setAttribute("role", "tooltip");
      popup.hidden=true;
      document.body.appendChild(popup);
      let current=null, closeTimer;
      const hide=()=>{
        clearTimeout(closeTimer);
        current?.removeAttribute("aria-describedby");
        current=null;
        popup.hidden=true;
      };
      hideAnnotationHelp=hide;
      const badgeFor=target=>target instanceof Element ? target.closest(".badge[data-badge-help]") : null;
      const show=badge=>{
        // Flags already have an immediate hover panel which can also be pinned open.
        if(!badge || badge.closest(".flag-badge-details")) return;
        hide();
        current=badge;
        popup.textContent=badge.dataset.badgeHelp;
        badge.setAttribute("aria-describedby", popup.id);
        popup.hidden=false;
        const box=badge.getBoundingClientRect(), help=popup.getBoundingClientRect();
        const left=Math.max(8, Math.min(box.left, innerWidth-help.width-8));
        const top=box.bottom+6+help.height<=innerHeight-8 ? box.bottom+6 : Math.max(8, box.top-help.height-6);
        popup.style.left=`${left}px`;
        popup.style.top=`${top}px`;
      };
      document.addEventListener("pointerover", event=>{
        if(popup.contains(event.target)){ clearTimeout(closeTimer); return; }
        const badge=badgeFor(event.target);
        if(badge && badge!==current) show(badge);
        else if(badge) clearTimeout(closeTimer);
      });
      document.addEventListener("focusin", event=>show(badgeFor(event.target)));
      document.addEventListener("pointerout", event=>{
        if(current?.contains(event.target) || popup.contains(event.target)){
          if(current?.contains(event.relatedTarget) || popup.contains(event.relatedTarget)) return;
          clearTimeout(closeTimer);
          closeTimer=setTimeout(hide, 120);
        }
      });
      document.addEventListener("focusout", event=>{ if(current?.contains(event.target)) hide(); });
      document.addEventListener("keydown", event=>{ if(event.key==="Escape") hide(); });
      document.addEventListener("scroll", event=>{ if(!popup.contains(event.target)) hide(); }, true);
      window.addEventListener("resize", hide);
    }
    function annotationBadge(label, cls, help){
      return `<span class="badge ${attr(cls)}" data-badge-help="${attr(help)}" tabindex="0" aria-label="${attr(label)}">${esc(label)}</span>`;
    }
    function rnaAnnotationHelp(kind, count){
      return `${count} labelled regions of ${kind==="snRNA"?"spliceosomal RNA":"the RNA being spliced"} are available to explore. This counts regions, not RNA molecules; some labels may still need checking.`;
    }
    function evidenceHelp(level, subject="Assignment"){
      const meaning = {
        high:"The available information supports this label well. It is not a guarantee that everything is correct.",
        medium:"This label has some support, but parts are uncertain. Check the details before relying on it.",
        low:"There is little support for this label. It needs checking.",
        review:"Some components or the splicing state need checking. Open the curation details to see why.",
      };
      return `${subject}: ${meaning[level] || "This has not been assessed yet."}`;
    }
    function curationTagHelp(label){
      return {
        publication:"A paper is linked to this structure. Find Paper beside the structure details.",
        quality:"Model-quality information is available in the details. This badge does not mean that every check passed.",
        "primary map":"The main experimental density map is linked. It is downloaded only when requested.",
        "linked maps":"Additional experimental density maps are linked to this structure.",
        "all proteins colored":"Every protein has a display color. This does not confirm that all protein names are correct.",
        "needs review":"Some labels need checking. Open the curation details for the reasons.",
        "chains renamed":"Shared chain names are available for comparing structures in ChimeraX. Enable systematic chain IDs to use them.",
      }[label] || `See the curation details for more about this label: ${label}.`;
    }
    function rnaAnnotationBadges(r){
      const substrateCount = (r.substrate_features||[]).length;
      const snrnaCount = (r.snrna_features||[]).length;
      const bits = [];
      if(substrateCount) bits.push(annotationBadge(`mRNA ${substrateCount}`, "good", rnaAnnotationHelp("(pre-)mRNA", substrateCount)));
      if(snrnaCount) bits.push(annotationBadge(`snRNA ${snrnaCount}`, "good", rnaAnnotationHelp("snRNA", snrnaCount)));
      return `<div class="badge-row">${bits.join("") || annotationBadge("none", "", "No RNA regions have been labelled for this entry. RNA may still be present in the structure.")}</div>`;
    }
    function isMinorSpliceosome(r){
      return /\bminor\b/i.test([r?.title, r?.paper_title].filter(Boolean).join(" "));
    }
    function isTransSpliceosome(r){
      return /\btrans[- ](?:spliceosom|[CP]\b)/i.test([r?.title,r?.paper_title].filter(Boolean).join(" "));
    }
    function transSpliceosomeBadge(r){
      return isTransSpliceosome(r) ? annotationBadge("trans", "trans-spliceosome", "Trans-spliceosome: joins a spliced-leader RNA exon to a separate pre-mRNA.") : "";
    }
    function minorSpliceosomeBadge(r){
      return isMinorSpliceosome(r) ? annotationBadge("minor", "minor-spliceosome", "Part of the minor spliceosome, which removes a less common class of introns called U12-type introns.") : "";
    }
    function flagSupportingMetric(flag,r){
      const value=String(flag||"").toLowerCase(),q=r.quality||{};
      if(value.includes("validation geometry") && q.geometry_quality) return `Some atom positions or bond arrangements need checking. Reported geometry score: ${q.geometry_quality}.`;
      if(value.includes("ramachandran") && q.rama_outliers_percent) return `${q.rama_outliers_percent}% of assessed protein backbone angles are unusual. These regions may need closer inspection.`;
      if(value.includes("rna suite") && q.rna_suite_outliers_percent) return `${q.rna_suite_outliers_percent}% of assessed RNA backbone arrangements are unusual and may need checking.`;
      if(value.includes("low resolution")) return `Reported resolution: ${formatResolution(r.resolution)||q.map_resolution_A||"not available"} A.`;
      if(value.includes("local/non-pdb")) return "This is a local or non-PDB model rather than a public deposited entry.";
      return "Open the curation and quality details for the reason behind this warning.";
    }
    function flagBadge(r,interactive=false){
      const flags=r.curation?.flags||[];
      if(!flags.length) return "";
      const label=`${flags.length} flag${flags.length===1?"":"s"}`;
      const hover=flags.map(flag=>`${flag}\n${flagSupportingMetric(flag,r)}`).join("\n\n");
      if(!interactive) return annotationBadge(label, "bad", hover);
      return `<details class="flag-badge-details"><summary class="badge bad" data-badge-help="${attr(hover)}" aria-label="${attr(label)}">${label}</summary><div class="flag-popover"><strong>Things to check</strong><ul>${flags.map(flag=>`<li>${esc(flag)}<span class="flag-metric">${esc(flagSupportingMetric(flag,r))}</span></li>`).join("")}</ul></div></details>`;
    }
    function curationBadges(r, includeRna=true){
      const c=r.curation||{}; const flags=c.flags||[]; const confidence=c.overall_confidence||"";
      const bits=[];
      if(c.assignment_completeness) bits.push(annotationBadge(`Components: ${c.assignment_completeness}`, "", `${c.assignment_completeness==="complete"?"All components have names and color assignments in the database.":`${c.unassigned_components||"Some"} component(s) still need a name or color assignment. See Unassigned Components.`} This does not mean every part of the structure was resolved.`));
      if(confidence) bits.push(annotationBadge(`Evidence: ${confidence}`, confidence==="review"?"review":"", evidenceHelp(confidence, "Support for the structure labels")));
      if(includeRna && c.provisional_rna_features) bits.push(annotationBadge(`${c.provisional_rna_features} provisional RNA regions`, "warn", "Some RNA labels are approximate and need checking. Use them as a guide, not as proof of an RNA interaction."));
      if(includeRna && (r.substrate_features||[]).length) bits.push(annotationBadge("(pre-)mRNA features annotated", "good", rnaAnnotationHelp("(pre-)mRNA", r.substrate_features.length)));
      if(includeRna && (r.snrna_features||[]).length) bits.push(annotationBadge("snRNA features annotated", "good", rnaAnnotationHelp("snRNA", r.snrna_features.length)));
      if(flags.length) bits.push(flagBadge(r,includeRna));
      return `<div class="badge-row">${bits.join("") || annotationBadge("n/a", "", "This entry has not been assessed yet.")}</div>`;
    }
    function toggleCompare(pdbId){
      const i=state.compareIds.indexOf(pdbId);
      if(i>=0) state.compareIds.splice(i,1);
      else if(state.compareIds.length<5 && records.some(r=>r.pdb_id===pdbId)) state.compareIds.push(pdbId);
      refreshComparisonControls();
    }
    function clearComparison(){
      state.compareIds = [];
      refreshComparisonControls();
    }
    function refreshComparisonControls(){
      renderComparison();
      for(const button of els.rows.querySelectorAll('[data-compare]')){
        const selected = state.compareIds.includes(button.dataset.compare);
        button.textContent = selected ? "Added" : "Add";
        button.classList.toggle("active", selected);
        button.setAttribute("aria-pressed", String(selected));
        button.setAttribute("aria-label", `${selected ? "Remove" : "Add"} ${button.dataset.compare.toUpperCase()} ${selected ? "from" : "to"} comparison`);
        button.disabled = !selected && state.compareIds.length >= 5;
      }
    }
    function setChainMode(mode){
      state.chainMode = mode === "systematic" ? "systematic" : "original";
      const r = records.find(item => item.pdb_id === state.selected);
      if(r) renderScriptActions(r);
    }
    function externalLinks(r,compact=false){
      const links = [];
      if(r.doi) links.push(`<a href="https://doi.org/${attr(r.doi)}" target="_blank" rel="noreferrer" title="Open the associated paper">Paper ↗</a>`);
      else if(r.pubmed_id) links.push(`<a href="https://pubmed.ncbi.nlm.nih.gov/${attr(r.pubmed_id)}/" target="_blank" rel="noreferrer">Paper ↗</a>`);
      if(r.rcsb_url) links.push(`<a href="${attr(r.rcsb_url)}" target="_blank" rel="noreferrer" title="Open this entry at the RCSB PDB">RCSB PDB</a>`);
      if(!compact && r.pdbe_url) links.push(`<a href="${attr(r.pdbe_url)}" target="_blank" rel="noreferrer" title="Open this entry at PDBe">PDBe</a>`);
      if(!compact && r.empiar_id) links.push(`<a href="https://www.ebi.ac.uk/empiar/${attr(r.empiar_id)}/" target="_blank" rel="noreferrer" title="Open the raw cryo-EM dataset at EMPIAR">${esc(r.empiar_id)}</a>`);
      if(!compact && r.pubmed_id) links.push(`<a href="https://pubmed.ncbi.nlm.nih.gov/${attr(r.pubmed_id)}/" target="_blank" rel="noreferrer" title="Open the associated publication at PubMed">PubMed</a>`);
      for(const emdb of r.emdb_ids || []){
        const digits = String(emdb).match(/\d+/);
        if(digits) links.push(`<a href="https://www.ebi.ac.uk/emdb/EMD-${attr(digits[0])}" target="_blank" rel="noreferrer" title="Open ${attr(emdb)} at EMDB">EMDB ${esc(emdb.toUpperCase())}</a>`);
      }
      return links.length ? `<div class="actions external-links">${links.join("")}</div>` : '<div class="subtle">No paper or database links listed for this entry.</div>';
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
    function molstarLegend(r, query=""){
      return molstarLegendItems(r).map((x,index)=>({x,index})).filter(({x})=>matchesSearch(query,`${x.label} ${x.searchText || ""} ${x.chains.join(" ")}`)).map(({x,index})=>`<div class="molstar-protein-row"><input type="checkbox" data-protein-index="${index}" ${molstarProteinSelection.has(index)?'checked':''} onchange="toggleMolstarProtein(this)" aria-label="${attr(`Include ${x.label} in display selection`)}"><button type="button" class="molstar-legend-chip ${molstarProteinSelection.has(index)?'active':''}" data-legend-index="${index}" onclick="selectMolstarComponentFromLegend(this)" title="${attr(`Focus ${x.label}; deposited chains ${x.chains.join(', ')}. Replaces the current selection.`)}"><span class="component-swatch" style="background:${attr(x.color)}"></span><span>${esc(x.label)} <small>chain ${esc(x.chains.join(', '))}</small></span></button></div>`).join("") || '<span class="subtle">No matching components.</span>';
    }
    function searchMolstarProteins(input){
      document.getElementById("molstarProteinList").innerHTML=molstarLegend(currentMolstarRecord(),input.value);
    }
    function molstarFeatureBrowser(r){
      const features = r.molstar_feature_selections || [];
      if(!features.length) return '<div class="subtle">No RNA feature selections are available for this structure.</div>';
      const groups = unique(features.map(x=>x.group));
      return `<div class="molstar-feature-box"><div class="molstar-feature-controls"><div class="field"><label for="molstarFeatureGroup">Feature group</label><select id="molstarFeatureGroup" onchange="renderMolstarFeatureButtons()"><option value="all">All feature groups</option>${groups.map(g=>`<option value="${attr(g)}">${esc(g)}</option>`).join("")}</select></div><div class="field"><label for="molstarFeatureSearch">Find feature</label><input id="molstarFeatureSearch" type="search" placeholder="branch, 5SS, U6" oninput="renderMolstarFeatureButtons()"></div></div><div class="molstar-feature-list" id="molstarFeatureList"></div></div>`;
    }
    function structureAlignmentItems(r){
      const byPath = new Map((r.rna_sequence_views || []).map(item=>[item.html,item]));
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
      return `${path}${path.includes("?")?"&":"?"}v=20261103-hover`;
    }
    function rnaAlignmentPanel(r){
      const items = structureAlignmentItems(r);
      if(!items.length) return "";
      const first = items[0];
      const firstUrl = alignmentViewerUrl(first.html);
      const chooser = items.length > 1 ? `<select class="rna-alignment-select" aria-label="Reference alignment" onchange="changeRnaAlignment(this)">${items.map((item,index)=>`<option value="${index}">${esc(item.label)}</option>`).join("")}</select>` : "";
      const help = `<span class="rna-alignment-help"><button type="button" aria-label="Sequence alignment help">?</button><span class="rna-alignment-help-text" role="tooltip"><strong>Sequence alignment</strong>Feature tracks are projected from the annotated reference. Blue bases are modelled; grey bases are present in the sequence record but unresolved. Click a modelled base, or drag a range within one chain, to focus it in Mol*.</span></span>`;
      return `<section class="rna-alignment-panel"><iframe id="rnaAlignmentFrame" class="rna-alignment-frame" src="${attr(firstUrl)}" title="${attr(`${r.pdb_id.toUpperCase()} pre-mRNA sequence alignment`)}" loading="eager"></iframe><div class="rna-alignment-footer">${chooser}${first.help?`<span class="subtle rna-sequence-note">${esc(first.help)}</span>`:help}<a id="rnaAlignmentOpen" href="${attr(firstUrl)}" target="_blank" rel="noopener">Full alignment</a>${first.fasta?`<a id="rnaAlignmentFasta" href="${attr(first.fasta)}" download>FASTA</a>`:""}<a id="rnaAlignmentGenbank" href="${attr(first.genbank || "")}" download ${first.genbank?"":"hidden"}>GenBank</a></div></section>`;
    }
    function changeRnaAlignment(control){
      const items=structureAlignmentItems(currentMolstarRecord()),item=items[Number(control.value)];
      if(!item) return;
      const viewerUrl=alignmentViewerUrl(item.html);
      document.getElementById("rnaAlignmentFrame").src=viewerUrl;
      document.getElementById("rnaAlignmentOpen").href=viewerUrl;
      const fasta=document.getElementById("rnaAlignmentFasta");
      if(fasta && item.fasta) fasta.href=item.fasta;
      const gb=document.getElementById("rnaAlignmentGenbank");
      if(gb){gb.hidden=!item.genbank;gb.href=item.genbank || "";}
      document.getElementById("rnaAlignmentFrame").title=item.label + " annotated sequence";
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
      const features = hasFeatures ? `<section class="molstar-selection-section" id="selection-rna" role="tabpanel" aria-labelledby="selection-tab-rna" data-molstar-section="rna"><h3>RNA elements</h3><p class="section-note">Click a feature to zoom and highlight it in the 3D model.</p>${molstarFeatureBrowser(r)}</section>` : "";
      const legendBlock = hasLegend ? `<section class="molstar-selection-section" id="selection-protein" role="tabpanel" aria-labelledby="selection-tab-protein" data-molstar-section="protein" ${hasFeatures?'hidden':''}><h3>Proteins</h3><p class="section-note">Tick proteins to combine them for Display actions. Click a name to select only that protein and zoom.</p><label for="molstarProteinSearch">Find protein or chain</label><input id="molstarProteinSearch" type="search" placeholder="PRPF8, chain ID" oninput="searchMolstarProteins(this)"><div class="molstar-protein-selection"><span id="molstarProteinCount" role="status" aria-live="polite">0 proteins selected</span><button type="button" id="molstarProteinClear" disabled onclick="clearMolstarFeature(false)">Clear selection</button></div><div class="molstar-legend" id="molstarProteinList">${legend}</div></section>` : "";
      const sidebar = features || legendBlock ? `<aside class="molstar-selection-sidebar"><div class="molstar-selection-tabs" role="tablist" aria-label="Model components">${[["rna","RNA elements",hasFeatures],["protein","Proteins",hasLegend]].filter(x=>x[2]).map(([id,label],index)=>`<button class="molstar-selection-tab ${index===0?'active':''}" type="button" role="tab" id="selection-tab-${id}" aria-controls="selection-${id}" aria-selected="${index===0}" tabindex="${index===0?'0':'-1'}" data-selection-tab="${id}" onclick="switchMolstarSelectionTab('${id}')" onkeydown="selectionTabKey(event,this)">${label}</button>`).join('')}</div>${features}${legendBlock}</aside>` : "";
      return `<div class="molstar-panel"><div class="molstar-workbench"><div class="molstar-viewer" id="molstarViewer" aria-label="3D structure viewer" tabindex="0" aria-describedby="molstarGestureHint"></div>${sidebar}</div><div class="molstar-toolbar"><span id="molstarGestureHint" class="subtle">${state.panelOnly?'Drag to rotate · scroll to zoom':'Drag to rotate · Alt + scroll to zoom'}</span><button type="button" onclick="zoomMolstar(.8)" aria-label="Zoom in">+</button><button type="button" onclick="zoomMolstar(1.25)" aria-label="Zoom out">−</button><button type="button" onclick="clearMolstarFeature()">Reset view</button><div class="viewer-display" role="group" aria-label="Display controls"><div class="viewer-display-actions"><button type="button" data-requires-selection disabled onclick="changeMolstarVisibility('hide')">Hide selection</button><button type="button" data-requires-selection disabled onclick="changeMolstarVisibility('showOnly')">Show only selection</button><button type="button" onclick="changeMolstarVisibility('showAll')">Show all</button></div><label><input id="molstarDepthCue" type="checkbox" ${state.depthCue?'checked':''} disabled onchange="setMolstarDepthCue(this)">Depth cue (fade distant parts)</label></div><span class="molstar-status" id="molstarStatus" role="status" aria-live="polite">${count ? `${count} chain-color selections are applied automatically.` : "No chain-color selections are available for this entry."}</span></div>${rnaAlignmentPanel(r)}${snrnaAlignmentControl(r)}</div>`;
    }
    function switchMolstarSelectionTab(tab){
      const value = tab === "protein" ? "protein" : "rna";
      const sidebar = document.querySelector(".molstar-selection-sidebar");
      if(!sidebar) return;
      sidebar.dataset.activeSelection = value;
      for(const button of sidebar.querySelectorAll("[data-selection-tab]")){
        const active=button.dataset.selectionTab===value;
        button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
      }
      for(const panel of sidebar.querySelectorAll('[data-molstar-section]'))panel.hidden=panel.dataset.molstarSection!==value;
      renderMolstarFeatureButtons();
    }
    function selectionTabKey(event,button){
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      const buttons=[...button.parentElement.querySelectorAll('[data-selection-tab]')];
      event.preventDefault();const index=buttons.indexOf(button);
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+1)%buttons.length;
      switchMolstarSelectionTab(buttons[next].dataset.selectionTab);buttons[next].focus();
    }
    function zoomMolstar(factor){
      const camera=currentMolstarViewerElement()?.viewerInstance?.plugin?.canvas3d?.camera;
      if(!camera)return;
      const snapshot=camera.getSnapshot();
      camera.setState({position:snapshot.position.map((v,i)=>snapshot.target[i]+(v-snapshot.target[i])*factor)},150);
    }
    function refreshMolstarVisibilityControls(){
      const viewer=currentMolstarViewerElement();
      const ready=Boolean(!molstarLoadTask && viewer?.viewerInstance?.plugin?.canvas3d && state.molstarPdbId===state.selected);
      const busy=Boolean(molstarVisibilityOperation && molstarVisibilityOperation.viewer===viewer);
      for(const button of document.querySelectorAll('.viewer-display-actions button')){
        button.disabled=busy || !ready || (button.hasAttribute('data-requires-selection') && !molstarSelectionQueries.length);
      }
    }
    async function changeMolstarVisibility(action){
      const viewer=currentMolstarViewerElement(),instance=viewer?.viewerInstance;
      if(!['hide','showOnly','showAll'].includes(action))return;
      if(molstarLoadTask)return;
      // Controls are disabled while mutating opacity. Also guard duplicate
      // calls so a second action cannot race a pending transparency update.
      if(molstarVisibilityOperation?.viewer===viewer)return;
      const operation={viewer,intent:molstarSelectionIntent};
      const queries=molstarSelectionQueries.map(query=>({...query}));
      molstarVisibilityOperation=operation;
      refreshMolstarVisibilityControls();
      try{
        if(action==='showAll')await SpliceVisInteractions.showAll(instance);
        else await SpliceVisInteractions[action](instance,queries);
        if(viewer!==currentMolstarViewerElement() || operation.intent!==molstarSelectionIntent)return;
        document.getElementById('molstarStatus').textContent=action==='showAll'?'Showing all components.':action==='hide'?'Selection hidden. Use Show all to restore.':'Showing only the selected component or residues. Use Show all to restore.';
      }catch(error){if(viewer===currentMolstarViewerElement() && operation.intent===molstarSelectionIntent)document.getElementById('molstarStatus').textContent=error.message;}
      finally{
        if(molstarVisibilityOperation===operation){molstarVisibilityOperation=null;refreshMolstarVisibilityControls();}
      }
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
      if(!molstarTargetIsVisible(target)) return;
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
        if(signal.aborted || generation !== molstarGeneration || state.selected !== requestedPdbId) return;
        const liveTarget = document.getElementById("molstarViewer");
        if(liveTarget !== target || !molstarTargetIsVisible(liveTarget)) return;
        liveTarget.innerHTML = "";
        if(!state.panelOnly)liveTarget.addEventListener('wheel',event=>{
          // Keep ordinary wheel gestures available for page scrolling.
          if(!event.altKey)event.stopImmediatePropagation();
        },{capture:true,passive:true,signal});
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
        const options = {assemblyId:"1", hideStructure:["water"], hideControls:!state.panelOnly, selectInteraction:false,
          hideCanvasControls:state.panelOnly?["animation","trajectory","expand"]:["animation","trajectory","controlToggle","controlInfo","selection","expand"],
          sequencePanel:false, pdbeLink:!DATA.offline, loadingOverlay:true,
          lighting:"flat", subscribeEvents:false, bgColor:{r:255,g:255,b:255},
          validationAnnotation:false, domainAnnotation:false, symmetryAnnotation:false};
        if(DATA.offline) options.customData={url:`pdb/${r.pdb_id.toLowerCase()}.cif`,format:"cif",binary:false};
        else options.moleculeId=r.pdb_id.toLowerCase();
        molstarLoadTask = SpliceVisViewer.load(instance, viewer, options, signal);
        await molstarLoadTask;
        if(signal.aborted || generation !== molstarGeneration) return;
        if(!molstarTargetIsVisible(target)){ disposeMolstar(); return; }
        await applyMolstarIllustrativeStyle();
        if(signal.aborted || generation !== molstarGeneration) return;
        SpliceVisInteractions.setDepthCue(instance,state.depthCue);
        const depthCue=document.getElementById("molstarDepthCue");if(depthCue){depthCue.checked=state.depthCue;depthCue.disabled=false;}
        try{
          await applyMolstarColors();
        }catch(colorError){
          const liveStatus = document.getElementById("molstarStatus");
          if(liveStatus) liveStatus.textContent = `Loaded ${r.pdb_id.toUpperCase()}, but the SpliceVis color overlay failed: ${colorError.message}`;
        }
        if(signal.aborted || generation !== molstarGeneration) return;
        renderMolstarFeatureButtons();
      }catch(error){
        if(signal.aborted || generation !== molstarGeneration) return;
        const liveStatus = document.getElementById("molstarStatus");
        if(liveStatus) liveStatus.innerHTML = `Mol* preview error: ${esc(error.message)} <button type="button" onclick="loadMolstarForSelected(this)">Retry model</button>`;
      }finally{
        if(generation === molstarGeneration){
          molstarPendingPdbId = "";
          molstarLoadTask = null;
          refreshMolstarVisibilityControls();
        }
        if(button) button.disabled = false;
      }
    }
    function disposeMolstar(){
      molstarSelectionIntent++;
      molstarSelectionQueries=[];
      molstarProteinSelection=new Set();
      refreshMolstarProteinSelection();
      molstarVisibilityOperation=null;
      molstarGeneration++;
      molstarAbort?.abort();
      state.molstarViewer?.viewerInstance?.plugin?.dispose();
      state.molstarViewer?.remove?.();
      state.molstarViewer = null;
      state.molstarPdbId = "";
      molstarPendingPdbId = "";
      molstarLoadTask = null;
      document.querySelectorAll('.viewer-display-actions button').forEach(button=>button.disabled=true);
    }
    function molstarTargetIsVisible(target=document.getElementById("molstarViewer")){
      if(state.activeTab !== "structures" || !target || !target.isConnected) return false;
      // A closed details element can retain a measurable child box in some browsers.
      if(target.closest('details:not([open])')) return false;
      const box=target.getBoundingClientRect();
      return box.width >= 2 && box.height >= 2 && target.getClientRects().length > 0;
    }
    function reconcileMolstarVisibility(){
      if(!molstarTargetIsVisible()){
        if(state.molstarViewer || molstarPendingPdbId) disposeMolstar();
        return;
      }
      if(molstarAutoPreviewEnabled) autoLoadMolstarForSelected();
    }
    function observeMolstarVisibility(){
      molstarVisibilityObserver?.disconnect();
      const target=document.getElementById("molstarViewer");
      if(!target) return;
      target.closest('details')?.addEventListener('toggle',reconcileMolstarVisibility);
      // Covers details collapse, responsive CSS, and container-only size changes.
      // Keep observing after disposal so reopening automatically restores the preview.
      if(typeof ResizeObserver !== 'undefined'){
        molstarVisibilityObserver=new ResizeObserver(reconcileMolstarVisibility);
        molstarVisibilityObserver.observe(target);
      }
    }
    function autoLoadMolstarForSelected(){
      const requestedPdbId = state.selected;
      window.setTimeout(()=>{
        if(state.selected !== requestedPdbId) return;
        const target = document.getElementById("molstarViewer");
        if(!molstarTargetIsVisible(target)) return;
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
        return (group==="all" || item.group===group) && matchesSearch(query,hay);
      });
      list.innerHTML = features.length ? features.slice(0,70).map((item,index)=>`<button type="button" class="molstar-feature-button" data-feature-index="${index}" onclick="selectMolstarFeatureFromButton(this)" title="${attr(`${item.group}: ${item.label} chain ${item.chain} residues ${item.residue_ranges}; ${item.confidence || "unrated"} confidence; ${item.method || "see RNA annotations"}`)}"><span class="component-swatch" style="background:${attr(item.color)}"></span>${esc(item.label)}${item.confidence !== "high" ? '<span class="feature-confidence" aria-label="Provisional annotation">?</span>' : ""} <span class="subtle">${esc(item.residue_ranges)}</span></button>`).join("") + (features.length>70 ? `<span class="subtle">+${features.length-70} more</span>` : "") : '<span class="subtle">No matching feature selections.</span>';
      list._molstarFeatures = features;
    }
    async function selectMolstarFeatureFromButton(button){
      const list = document.getElementById("molstarFeatureList");
      const featureIndex = Number(button.dataset.featureIndex);
      const feature = list?._molstarFeatures?.[featureIndex];
      if(!feature) return;
      const intent=await selectMolstarFeature(feature);
      if(!intent || intent!==molstarSelectionIntent) return;
      const currentList = document.getElementById("molstarFeatureList");
      if(currentList) for(const item of currentList.querySelectorAll(".molstar-feature-button")) item.classList.toggle("active", currentList._molstarFeatures?.[Number(item.dataset.featureIndex)] === feature);
      clearMolstarLegendActive();
    }
    let molstarSelectionQueries=[];
    let molstarProteinSelection=new Set();
    let molstarSelectionIntent=0;
    let molstarVisibilityOperation=null;
    async function prepareMolstarSelection(requested){
      let intent=++molstarSelectionIntent;
      if(!currentMolstarViewerElement() || state.molstarPdbId!==requested){
        const task=loadMolstarForSelected();
        // Starting a new model disposes its predecessor synchronously. This
        // action owns that load, but later selections/reset must supersede it.
        intent=molstarSelectionIntent;
        await task;
      }
      if(molstarLoadTask) await molstarLoadTask;
      if(intent!==molstarSelectionIntent || state.selected!==requested || state.molstarPdbId!==requested) return null;
      const instance=currentMolstarViewerElement()?.viewerInstance;
      if(!instance?.visual) return null;
      return {instance,intent,requested};
    }
    function molstarSelectionIsCurrent(selection){
      return Boolean(selection && selection.intent===molstarSelectionIntent && state.selected===selection.requested && state.molstarPdbId===selection.requested && currentMolstarViewerElement()?.viewerInstance===selection.instance);
    }
    async function markMolstarSelection(selection,queries,{focus=true,proteinIndices=null}={}){
      if(!molstarSelectionIsCurrent(selection)) return false;
      try{
        SpliceVisInteractions.select(selection.instance,queries,{focus});
        molstarSelectionQueries=queries.map(q=>({...q}));
        molstarProteinSelection=proteinIndices ? new Set(proteinIndices) : new Set();
        refreshMolstarProteinSelection();
        refreshMolstarVisibilityControls();
        return true;
      }catch(error){
        const status=document.getElementById('molstarStatus');
        if(status) status.textContent=error.message;
        return false;
      }
    }
    function setMolstarDepthCue(input){
      const instance=currentMolstarViewerElement()?.viewerInstance;
      try{SpliceVisInteractions.setDepthCue(instance,input.checked);state.depthCue=input.checked;document.getElementById("molstarStatus").textContent=input.checked?"Depth cue on: distant parts fade into the background.":"Depth cue off: all depths use full colour.";}
      catch(error){input.checked=!input.checked;document.getElementById('molstarStatus').textContent=error.message;}
    }
    async function selectMolstarFeature(feature){
      const requested = state.selected;
      const selection=await prepareMolstarSelection(requested);
      if(!molstarSelectionIsCurrent(selection)) return;
      const status = document.getElementById("molstarStatus");
      const queries = (feature.queries || []).map(q=>({...q, color: feature.color || "#FFFF00", focus: true}));
      if(!queries.length){ if(status) status.textContent = "This feature has no selectable Mol* residue ranges."; return; }
      if(!await markMolstarSelection(selection,queries) || !molstarSelectionIsCurrent(selection)) return;
      if(status) status.textContent = `Focused ${feature.label} (${feature.chain}:${feature.residue_ranges}).`;
      return selection.intent;
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
      const r=currentMolstarRecord();
      if(!r || String(payload.pdb_id||"").toLowerCase()!==String(r.pdb_id||"").toLowerCase()) return;
      const validChains=new Set((r.rnas||[]).flatMap(item=>String(item.chains||"").split(/;\s*/)).filter(Boolean));
      if(!validChains.has(String(payload.chain||""))) return;
      const residues=Array.isArray(payload.auth_residues)?payload.auth_residues:[];
      if(!residues.length || residues.some(value=>!Number.isSafeInteger(value))) return;
      const ranges=compactNumericRanges(residues);
      if(!ranges.length) return;
      const selection=await prepareMolstarSelection(r.pdb_id);
      if(!molstarSelectionIsCurrent(selection)) return;
      const status=document.getElementById("molstarStatus");
      const queries=ranges.map(([start,end])=>({auth_asym_id:payload.chain,beg_auth_seq_id:start,end_auth_seq_id:end,color:"#00A6C8",focus:true}));
      if(!await markMolstarSelection(selection,queries) || !molstarSelectionIsCurrent(selection)) return;
      clearMolstarLegendActive();
      document.querySelectorAll(".molstar-feature-button").forEach(item=>item.classList.remove("active"));
      if(status) status.textContent=`Focused ${payload.label||`${r.pdb_id.toUpperCase()} chain ${payload.chain}`}.`;
      return true;
    }
    window.addEventListener("message",event=>{
      const payload=event.data;
      const frame=[document.getElementById("rnaAlignmentFrame"),document.getElementById("snrnaAlignmentFrame"),document.querySelector(".rna-2d-viewer")].find(item=>item && event.source===item.contentWindow);
      if(!frame || event.origin !== location.origin) return;
      if(payload?.source==="splicevis-rna-alignment-resize" && !frame.classList.contains("rna-2d-viewer")){
        if(frame&&event.source===frame.contentWindow){
          const height=Math.max(150,Math.min(460,Number(payload.height)||300));
          frame.style.height=`${Math.ceil(height)}px`;
        }
        return;
      }
      if(!payload||!["splicevis-rna-alignment","splicevis-rna-secondary"].includes(payload.source)) return;
      focusMolstarAlignmentSelection(payload).then(ok=>{
        if(payload.source==="splicevis-rna-secondary")frame.contentWindow.postMessage({source:"splicevis-rna-secondary-result",pdb_id:payload.pdb_id,message:ok?`Focused ${payload.label} in 3D (${payload.auth_residues.length} modelled residues).`:"Could not focus this selection. Open the 3D viewer and try again."},location.origin);
      }).catch(error=>{
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
      const rnaChains=new Set((r?.rnas || []).flatMap(item=>String(item.chains || "").split(/;\s*/)));
      for(const item of groups){
        const related=(r?.comparison_components || []).filter(c=>c.chains.some(chain=>item.chains.includes(chain)));
        const deposited=(r?.proteins || []).filter(c=>String(c.chains || "").split(/;\s*/).some(chain=>item.chains.includes(chain)));
        item.searchText=[...related.map(c=>c.label),...deposited.map(c=>`${c.gene || ""} ${c.name || ""}`)].join(" ");
      }
      return groups.filter(item=>!item.chains.every(chain=>rnaChains.has(chain))).sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true,sensitivity:"base"}));
    }
    function refreshMolstarProteinSelection(){
      for(const checkbox of document.querySelectorAll('[data-protein-index]')) checkbox.checked=molstarProteinSelection.has(Number(checkbox.dataset.proteinIndex));
      for(const chip of document.querySelectorAll('.molstar-legend-chip')) chip.classList.toggle('active',molstarProteinSelection.has(Number(chip.dataset.legendIndex)));
      const count=document.getElementById('molstarProteinCount');
      if(count) count.textContent=`${molstarProteinSelection.size} protein${molstarProteinSelection.size===1?'':'s'} selected`;
      const clear=document.getElementById('molstarProteinClear');
      if(clear) clear.disabled=!molstarProteinSelection.size;
    }
    function clearMolstarLegendActive(){
      molstarProteinSelection=new Set();
      refreshMolstarProteinSelection();
    }
    function molstarProteinQueries(r,indices){
      const items=molstarLegendItems(r),seen=new Set(),queries=[];
      for(const index of indices) for(const auth_asym_id of items[index]?.chains || []){
        if(seen.has(auth_asym_id)) continue;
        seen.add(auth_asym_id);
        queries.push({auth_asym_id,color:items[index].color});
      }
      return queries;
    }
    async function toggleMolstarProtein(checkbox){
      const r=currentMolstarRecord(),index=Number(checkbox.dataset.proteinIndex);
      if(!r || !Number.isInteger(index) || !molstarLegendItems(r)[index]) return;
      const selected=new Set(molstarProteinSelection);
      if(checkbox.checked) selected.add(index); else selected.delete(index);
      if(!selected.size){ await clearMolstarFeature(false); return; }
      // Start loading first: a new model disposes the previous selection synchronously.
      const pending=prepareMolstarSelection(r.pdb_id);
      molstarProteinSelection=selected;
      molstarSelectionQueries=[];
      refreshMolstarProteinSelection();
      refreshMolstarVisibilityControls();
      let selection;
      try{ selection=await pending; }
      catch(error){
        if(molstarProteinSelection===selected){
          clearMolstarLegendActive();
          const status=document.getElementById('molstarStatus');
          if(status) status.textContent=`Protein selection failed: ${error.message}`;
        }
        return;
      }
      if(!molstarSelectionIsCurrent(selection) || molstarProteinSelection!==selected){
        if(molstarProteinSelection===selected) clearMolstarLegendActive();
        return;
      }
      const ok=await markMolstarSelection(selection,molstarProteinQueries(r,selected),{focus:false,proteinIndices:selected});
      if(!molstarSelectionIsCurrent(selection)) return;
      if(!ok){
        clearMolstarLegendActive();
        // Keep the error from markMolstarSelection, but remove any older outline.
        await SpliceVisInteractions.clear(selection.instance,{resetCamera:false});
        return;
      }
      document.querySelectorAll('.molstar-feature-button').forEach(item=>item.classList.remove('active'));
      const status=document.getElementById('molstarStatus');
      if(status) status.textContent=`${selected.size} protein${selected.size===1?'':'s'} selected. Use Display to hide them or show only this selection.`;
    }
    async function selectMolstarComponentFromLegend(button){
      const r = currentMolstarRecord();
      const item = molstarLegendItems(r)[Number(button.dataset.legendIndex)];
      if(!item || !item.chains.length) return;
      const selection=await prepareMolstarSelection(r.pdb_id);
      if(!molstarSelectionIsCurrent(selection)) return;
      const status=document.getElementById("molstarStatus");
      const queries = item.chains.map(auth_asym_id=>({auth_asym_id, color: item.color, focus: true}));
      if(!await markMolstarSelection(selection,queries,{proteinIndices:[Number(button.dataset.legendIndex)]}) || !molstarSelectionIsCurrent(selection)) return;
      const featureList = document.getElementById("molstarFeatureList");
      if(featureList) for(const featureButton of featureList.querySelectorAll(".molstar-feature-button")) featureButton.classList.remove("active");
      if(status) status.textContent = `Focused ${item.label} chain${item.chains.length === 1 ? "" : "s"} ${item.chains.join(", ")}.`;
    }
    async function clearMolstarFeature(resetCamera=true){
      const intent=++molstarSelectionIntent;
      const status = document.getElementById("molstarStatus");
      const viewer = currentMolstarViewerElement();
      const instance = viewer && viewer.viewerInstance;
      molstarSelectionQueries=[];
      refreshMolstarVisibilityControls();
      const list = document.getElementById("molstarFeatureList");
      if(list) for(const item of list.querySelectorAll(".molstar-feature-button")) item.classList.remove("active");
      clearMolstarLegendActive();
      if(status) status.textContent = resetCamera ? "Reset view and cleared selection." : "Cleared selection; component visibility is unchanged.";
      if(instance?.plugin?.canvas3d){
        await SpliceVisInteractions.clear(instance,{resetCamera:false});
        if(resetCamera && intent===molstarSelectionIntent && currentMolstarViewerElement()?.viewerInstance===instance) await instance.visual?.reset?.({camera:true});
      }
    }
    function showStartTab(tab){
      if(tab==='comparison' && state.activeTab!=='comparison')comparisonView.tab='3d';
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
        return;
      }
      disposeMolstar();
      renderedDetailId = r?.pdb_id || null;
      if(!r){ els.detail.innerHTML='<div class="subtle">No structure selected.</div>'; els.selectedScriptActions.innerHTML=""; return; }
      els.selectedId.textContent = r.pdb_id.toUpperCase();
      renderScriptActions(r);
      renderDetailBody(r);
      observeMolstarVisibility();
    }
    function renderScriptActions(r){
      const systematicAvailable = Boolean(r.script_systematic_path);
      const selectedScriptMode = state.chainMode === "systematic" && systematicAvailable ? "systematic" : "original";
      if (state.chainMode === "systematic" && !systematicAvailable) state.chainMode = "original";
      const chainModeOption = `<label class="selected-header-chain-toggle" title="${attr(systematicAvailable ? `Rename ${r.systematic_chain_count || 0} mapped chains inside ChimeraX using safe-harbor IDs before coloring and named selections. Systematic IDs attempt to give identical or homologous proteins the same chain IDs across structures.` : "No systematic chain map is available for this entry.")}"><input type="checkbox" ${selectedScriptMode === "systematic" ? "checked" : ""} ${systematicAvailable ? "" : "disabled"} onchange="setChainMode(this.checked ? 'systematic' : 'original')">Use systematic chain IDs</label>`;
      const primaryMapAvailable = selectedScriptMode === "systematic" ? r.primary_map_script_systematic_path : r.primary_map_script_path;
      const primaryMapButton = primaryMapAvailable ? `<button class="script-copy" onclick="copyStructureScript('${attr(r.pdb_id)}', this, 'primary_map')" title="Copy a ChimeraX script that downloads the model and primary EMDB map, then aligns the model and brings the map when possible.">Copy script: model + map</button>` : "";
      const compositeButtons = (r.composite_groups||[]).map(group => `<button class="script-copy" onclick="copyScriptFile('${attr(group.script_path)}', this)" title="${attr(group.note || 'Copy a combined ChimeraX script for this split deposited assembly.')} ${attr(group.label || group.composite_id || "")}">Copy assembly</button>`).join("");
      els.selectedScriptActions.innerHTML = `${state.panelOnly?`<a class="button" href="${attr(atlasUrl(r.pdb_id))}">Back to atlas</a>`:`<a class="button" href="${attr(structurePanelUrl(r.pdb_id))}" target="_blank" rel="noopener">Open in new tab ↗</a>`}<details class="chimerax-options"><summary>ChimeraX scripts</summary><div class="chimerax-options-body"><button class="script-copy" onclick="copyStructureScript('${attr(r.pdb_id)}', this, 'no_maps')" title="Copy a model-only ChimeraX script that downloads the deposited PDB coordinates directly.">Copy script: model only</button>${primaryMapButton}${compositeButtons}${chainModeOption}<p>Paste the copied script into the ChimeraX command line. Model-only loads fastest; maps can be large and take several minutes. Feature clicks in the named-selection browser use thin Detail ribbons; Overview and Reset view restore the wider view.</p><div class="actions"><a href="https://www.rbvi.ucsf.edu/chimerax/download.html" target="_blank" rel="noreferrer">Download ChimeraX</a><a href="https://www.rbvi.ucsf.edu/chimerax/docs/quickstart/index.html" target="_blank" rel="noreferrer">Quick start</a><a href="https://www.rbvi.ucsf.edu/chimerax/tutorials.html" target="_blank" rel="noreferrer">Tutorials</a></div></div></details>`;
    }
    function renderDetailBody(r){
      const abstractBlock = r.abstract ? `<details class="detail-section"><summary>Abstract</summary><div class="detail-section-body">${esc(r.abstract)}</div></details>` : "";
      const resourceBlock = `<nav class="structure-links" aria-label="Structure links">${externalLinks(r,true)}</nav>`;
      const substrateBadges=unique((r.substrate_types||[]).map(item=>item.family||item.type)).filter(value=>value!=="Other/unspecified substrate").slice(0,2).map(value=>annotationBadge(value, "", "The RNA used in the experiment, or its sequence family. Find the sequence and supporting information under RNA Annotations.")).join("");
      els.detail.innerHTML = `<p class="detail-title">${esc(r.title)}</p><div class="detail-meta">${annotationBadge(r.state, "", `Where this structure belongs in the splicing pathway. See the cycle overview for what happens at this stage.`)}${minorSpliceosomeBadge(r)}${transSpliceosomeBadge(r)}${annotationBadge(r.species, "", "The organism this structure comes from. The RNA used in the experiment may have a different source.")}${annotationBadge(`${formatResolution(r.resolution)||"?"} A`, "", "How much detail the experiment reveals, in angstroms. Smaller values usually mean finer detail; ? means unavailable.")}${annotationBadge(r.year||"n/a", "", "The year listed for this structure.")}${annotationBadge(`${r.chain_count||0} chains`, "", "Number of protein and RNA chains in the deposited structure. Several chains can be copies of the same molecule.")}${substrateBadges}${curationBadges(r)}</div>${resourceBlock}${detailSection("Interactive 3D", molstarPanel(r), true)}${detailSection("Curation, Quality, and Audits", externalLinks(r) + reportIssueLink(r) + curationPanel(r) + proteinEvidencePanel(r) + unassignedPanel(r.unassigned_components||[]) + qualityPanel(r.quality))}${detailSection("RNA Annotations", substrateTypePanel(r.substrate_types||[]) + rna2dPanel(r.rna_2d||{},r.pdb_id) + snrnaPanel(r.snrna_features||[]), Boolean((r.rna_2d&&r.rna_2d.png) || (r.substrate_types||[]).length || (r.snrna_features||[]).length))}`;
      renderMolstarFeatureButtons();
    }
    function detailSection(title, body, open=false){
      return `<details class="detail-section"${open ? " open" : ""}><summary>${esc(title)}</summary><div class="detail-section-body">${body}</div></details>`;
    }
    function confidenceBadge(v, subject="Assignment"){
      const label=v||"n/a";
      const cls=label==="high"?"good":label==="review"?"review":label==="low"?"bad":"warn";
      let help=evidenceHelp(v, subject);
      if(subject==="Color coverage") help="Color coverage: high means all proteins have colors, medium means some do, and low means none do. Colors do not confirm protein identity.";
      if(subject==="RNA identity") help="High means all RNAs have been identified by the current checks. Medium means some still need identifying. Individual RNA labels may still need checking.";
      if(!v) help=`${subject}: this has not been assessed yet.`;
      return annotationBadge(label, cls, help);
    }
    function proteinEvidencePanel(r){
      const proteins=(r.proteins||[]).filter(p=>p.homolog_relationship);
      if(!proteins.length) return "";
      const rows=proteins.map(p=>`<tr><td><strong>${esc(p.display_name||p.gene||p.name)}</strong><br>${esc(p.chains)}</td><td>${esc(p.homolog_relationship)}${p.homolog_target?`<br>${esc(p.homolog_target)}`:""}</td><td>${esc(p.annotation_note||"")}${p.annotation_source?` <a href="${attr(p.annotation_source)}" target="_blank" rel="noreferrer">Source</a>`:""}</td></tr>`).join("");
      return `<h3>Protein assignments and evidence</h3><p class="section-note">Author-assigned homologs, structural or functional analogs, and unresolved identities are distinguished below. Shared position or color alone does not establish homology.</p><div class="table-wrap"><table class="mini-table"><thead><tr><th>Protein / chains</th><th>Relationship / comparison</th><th>Evidence and limitations</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    function curationPanel(r){
      const c=r.curation||{}; const flags=c.flags||[];
      return `<h3>Curation Provenance</h3><div class="detail-grid"><div class="detail-block"><div class="kv"><div>Stage evidence</div><div>${esc(c.stage_evidence||"n/a")}</div><div>Stage confidence</div><div>${confidenceBadge(c.stage_confidence, "Splicing state")}</div><div>Homolog confidence</div><div>${confidenceBadge(c.homolog_confidence, "Protein identification across species")}</div><div>Color confidence</div><div>${confidenceBadge(c.color_confidence, "Color coverage")}</div><div>RNA ID confidence</div><div>${confidenceBadge(c.rna_identity_confidence, "RNA identity")}</div></div></div><div class="detail-block"><div class="kv"><div>Badges</div><div>${(c.badges||[]).map(x=>annotationBadge(x, x==="needs review"?"review":"good", curationTagHelp(x))).join(" ")||"n/a"}</div><div>Flags</div><div>${flags.length?flags.map(x=>annotationBadge(x, "bad", `${x}: ${flagSupportingMetric(x,r)}`)).join(" "):annotationBadge("none", "good", "The available checks found no warnings. This does not rule out problems they did not test.")}</div><div>Protein colors</div><div>${esc(c.colored_proteins||"0")}/${esc(c.protein_count||"0")}</div><div>Unassigned</div><div>${esc(c.unassigned_components||"0")}</div><div>Summary</div><div>${esc(c.curation_summary||"n/a")}</div></div></div></div>`;
    }
    function unassignedPanel(items){
      if(!items.length) return `<h3>Unassigned Components</h3><div class="subtle">No unresolved components in the generated audit.</div>`;
      return `<h3>Unassigned Components (${items.length})</h3><div class="mini-list">${items.map(i=>`<div><strong>${esc(i.gene_name||i.molecule_name)}</strong> <span class="subtle">${esc(i.chains)} · ${esc(i.issue)}</span></div>`).join("")}</div>`;
    }
    function rna2dPanel(item,pdbId){
      if(!item || (!item.png && !item.svg)) return "";
      const links = item.png ? [`<a href="${attr(item.png)}">PNG</a>`] : [];
      const interactiveUrl=item.svg?`web/rna-viewer.html?svg=${encodeURIComponent("../"+item.svg)}&pdb=${encodeURIComponent(pdbId)}`:"";
      if(interactiveUrl) links.unshift(`<a href="${attr(interactiveUrl)}" target="_blank" rel="noopener">Open interactive viewer ↗</a>`);
      if(item.svg) links.push(`<a href="${attr(item.svg)}">SVG</a>`);
      const counts = [item.rna_chain_count ? `${item.rna_chain_count} RNA chains` : "", item.r2dt_chain_count ? `${item.r2dt_chain_count} R2DT layouts` : "", item.failed_chain_count && item.failed_chain_count !== "0" ? `${item.failed_chain_count} failed` : ""].filter(Boolean).join("; ");
      const r2dt=Boolean(item.r2dt_chain_count && item.r2dt_chain_count!=="0");
      const legend=r2dt ? "Grey backbone: deposited sequence; dashed backbone: unresolved interval. Thin black lines: base pairs. Dashed curves between RNAs: clustered FR3D interactions; thicker curves represent more reported interactions (capped width), not stronger binding or higher confidence. Coloured overlays mark annotated features." : "Coloured tracks: deposited RNA chains. Thin arcs: reported intrachain base pairs. Dashed links: annotation-derived feature relationships; line width does not encode interaction strength.";
      return `<details class="rna-2d-details"><summary>RNA secondary-structure rendering</summary>${interactiveUrl?`<iframe class="rna-2d-viewer" src="${attr(interactiveUrl)}" title="Interactive RNA secondary-structure viewer" loading="lazy"></iframe>`:`<img class="rna-2d-img" src="${attr(item.png)}" alt="RNA secondary-structure panel for the selected PDB entry" loading="lazy">`}<div class="subtle">${esc(counts)} ${links.join(" ")}</div><p class="rna-2d-legend">${esc(legend)} Choose an RNA and zoom to inspect individual interactions. Layout sizes are schematic and are not comparable between RNAs.</p>${item.notes ? `<div class="subtle">${esc(item.notes)}</div>` : ""}</details>`;
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
    function componentDifferenceRows(selected){
      const rows = new Map();
      for(const record of selected){
        for(const component of record.comparison_components || []){
          if(!rows.has(component.key)) rows.set(component.key, {...component, entries: new Map(), colors: new Map()});
          const row = rows.get(component.key);
          row.colors.set(record.pdb_id, component.color_hex || '');
          const previous = row.entries.get(record.pdb_id) || [];
          row.entries.set(record.pdb_id, [...new Set([...previous, ...component.chains])]);
        }
      }
      return [...rows.values()].map(row=>{
        const counts = selected.map(r=>row.entries.has(r.pdb_id) ? row.entries.get(r.pdb_id).length : -1);
        return {...row, different: new Set(counts).size > 1};
      }).sort((a,b)=>Number(b.different)-Number(a.different) || a.type.localeCompare(b.type) || a.label.localeCompare(b.label, undefined, {numeric:true}));
    }
    function comparisonSwatch(color){
      return /^#[0-9a-f]{6}$/i.test(color || '') ? `<span class="comparison-swatch" style="background:${color}" aria-hidden="true"></span>` : '';
    }
    function comparisonTable(selected, title, rows){
      return `<div class="comparison-table-wrap" tabindex="0" role="region" aria-label="${attr(title)}"><table class="comparison-table comparison-count-${selected.length}"><caption class="sr-only">${esc(title)}</caption><thead><tr><th scope="col">${esc(title)}</th>${selected.map(r=>`<th scope="col"><a href="${attr(structurePanelUrl(r.pdb_id))}" target="_blank" rel="noopener">${esc(r.pdb_id.toUpperCase())}</a><span class="comparison-kind">${esc(r.species)} · ${esc(r.state)}</span></th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr><th scope="row">${row.label}</th>${row.values.map(value=>`<td>${value}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${selected.length+1}">No rows to show. If Differences only is enabled, uncheck it to see shared proteins.</td></tr>`}</tbody></table></div>`;
    }
    function comparisonComponentTable(selected, kind){
      const allRows = componentDifferenceRows(selected).filter(row=>row.type===kind);
      const rows = kind==='protein' && comparisonView.onlyDifferences ? allRows.filter(row=>row.different) : allRows;
      const controls = kind==='protein' ? `<div class="comparison-options"><label><input type="checkbox" data-comparison-differences ${comparisonView.onlyDifferences?'checked':''}> Differences only</label><span class="subtle">${rows.length} of ${allRows.length} protein identities · presence or deposited chain count</span></div>` : '';
      return controls + comparisonTable(selected, kind==='protein'?'Proteins':'RNA components', rows.map(row=>({
        label: `${comparisonSwatch(row.color_hex)}${esc(row.label)}${row.matched?'':'<span class="comparison-kind">Identity unassigned; not matched across entries</span>'}`,
        values: selected.map(r=>row.entries.has(r.pdb_id) ? `${comparisonSwatch(row.colors.get(r.pdb_id))}<strong>Reported</strong><span class="comparison-chains">${row.entries.get(r.pdb_id).length ? 'Chain'+(row.entries.get(r.pdb_id).length>1?'s':'')+' '+esc(row.entries.get(r.pdb_id).join(', ')) : 'Chain ID unavailable'}</span>` : '<span class="component-not-reported">Not reported</span>')
      })));
    }
    function comparisonFeatureRows(selected){
      const features = new Map();
      for(const r of selected){
        for(const item of r.molstar_feature_selections || []){
          const key = `${item.kind}:${item.feature}`;
          if(!features.has(key)) features.set(key, {label:item.label, color:item.color, entries:new Map()});
          const feature = features.get(key);
          if(!feature.entries.has(r.pdb_id)) feature.entries.set(r.pdb_id, []);
          feature.entries.get(r.pdb_id).push(item);
        }
      }
      return [...features.values()].sort((a,b)=>a.label.localeCompare(b.label)).map(feature=>({
        label: `${comparisonSwatch(feature.color)}${esc(feature.label)}`,
        values: selected.map(r=>feature.entries.has(r.pdb_id) ? feature.entries.get(r.pdb_id).map(item=>`<div>${comparisonSwatch(item.color)}<strong>${item.confidence==='high'?'Annotated':'Provisional annotation'}</strong><span class="comparison-chains">${esc(item.chain)}:${esc(item.residue_ranges)} · ${esc(item.confidence||'unrated')} confidence</span></div>`).join('') : '<span class="subtle">Not annotated</span>')
      }));
    }
    function comparisonRnaPanel(selected){
      const substrate = [
        {label:'Substrate / construct', values:selected.map(r=>(r.substrate_types||[]).map(s=>`<strong>${esc(s.type||s.family||'Unspecified')}</strong><span class="comparison-chains">${esc(s.reference_label||s.molecule_name||'')} · chain ${esc(s.chains||'unspecified')} · ${esc(s.confidence||'unrated')} confidence</span>`).join('<br>') || 'No substrate assignment')},
        {label:'Assignment evidence', values:selected.map(r=>(r.substrate_types||[]).map(s=>esc(s.evidence||'Not recorded')).join('<br>') || 'Not recorded')}
      ];
      const features = comparisonFeatureRows(selected);
      return `<p class="comparison-note">Compare substrate assignments, reported RNA components and annotated features. “Not annotated” does not mean the RNA or interaction is absent. Residue numbers belong to each deposition and are not aligned positions.</p>${comparisonTable(selected,'Substrate',substrate)}<h3>RNA components</h3>${comparisonComponentTable(selected,'rna')}<h3>Annotated features (${features.length})</h3>${features.length?comparisonTable(selected,'Feature annotations',features):'<p>No selectable RNA feature annotations in these entries.</p>'}`;
    }
    function comparisonOverview(selected){
      const text = value => value===undefined || value===null || value==='' ? 'Not available' : esc(value);
      const fields = [
        ['Splicing state',r=>r.state], ['Species',r=>r.species],
        ['Reported resolution (Å)',r=>r.resolution], ['Publication year',r=>r.year],
        ['Total deposited chains',r=>r.chain_count], ['Protein entities',r=>r.protein_count],
        ['RNA entities',r=>r.rna_count], ['Structure title',r=>r.title],
        ['Publication',r=>r.paper_title], ['Journal',r=>r.journal]
      ];
      return '<p class="comparison-note">Entity counts and chain counts differ: an entity can have multiple chains. Reported resolution is a global value, not local quality at a feature.</p>' + comparisonTable(selected,'Structure details',fields.map(([label,read])=>({label:esc(label),values:selected.map(r=>text(read(r)))})));
    }
    function comparisonEvidence(selected){
      const text = value=>value===undefined || value===null || value==='' ? 'Not available' : esc(value);
      const fields = [
        ['Annotation confidence',r=>text(r.curation?.overall_confidence)],
        ['Component assignment',r=>text(r.curation?.assignment_completeness)],
        ['Curation warnings',r=>(r.curation?.flags||[]).map(esc).join('<br>') || 'None recorded'],
        ['Primary EMDB map',r=>text(r.quality?.primary_emdb_id)],
        ['Map resolution (Å)',r=>text(r.quality?.map_resolution_A)],
        ['Clashscore',r=>text(r.quality?.clashscore)],
        ['Ramachandran outliers (%)',r=>text(r.quality?.rama_outliers_percent)],
        ['RNA suite outliers (%)',r=>text(r.quality?.rna_suite_outliers_percent)],
        ['Publication and data links',r=>externalLinks(r)]
      ];
      return '<p class="comparison-note">Use these values and source links to assess comparability. Missing metrics are unavailable, not zero; annotation confidence is not experimental model quality.</p>' + comparisonTable(selected,'Evidence & links',fields.map(([label,read])=>({label:esc(label),values:selected.map(read)})));
    }
    const comparison3d = {reference:'',mobile:'',mode:'side',columns:'auto',manifest:null,controller:null,abort:null};
    function disposeComparison3d(){
      comparison3d.abort?.abort();
      comparison3d.controller?.dispose();
      comparison3d.controller=null;
      comparison3d.abort=null;
    }
    function comparison3dRecords(){
      const ids=comparison3d.mode==='overlay'?[comparison3d.reference,comparison3d.mobile]:[comparison3d.reference,...state.compareIds.filter(id=>id!==comparison3d.reference)];
      return ids.map(id=>records.find(r=>r.pdb_id===id)).filter(Boolean);
    }
    function comparisonSelectionItems(r,kind){
      if(kind==='protein') return molstarLegendItems(r).map(x=>({...x,detail:'chain '+x.chains.join(', '),queries:x.chains.map(auth_asym_id=>({auth_asym_id}))}));
      return (r.molstar_feature_selections||[]).map(x=>({...x,label:(x.label||x.feature)+(x.confidence&&x.confidence!=='high'?' ?':''),detail:[x.chain,x.residue_ranges].filter(Boolean).join(': ')+(x.confidence&&x.confidence!=='high'?' · provisional annotation':'')}));
    }
    function comparisonSelectionPanel(r,index){
      return `<aside class="comparison-components" data-view-index="${index}" aria-label="${attr(r.pdb_id.toUpperCase())} components"><h4>${esc(r.pdb_id.toUpperCase())} components</h4><div class="molstar-selection-tabs" role="group" aria-label="Component type"><button type="button" data-component-kind="protein" aria-pressed="true" class="molstar-selection-tab active">Proteins</button><button type="button" data-component-kind="rna" aria-pressed="false" class="molstar-selection-tab">RNA elements</button></div><input type="search" aria-label="Find component in ${attr(r.pdb_id.toUpperCase())}" placeholder="Find protein, RNA feature or chain"><div class="comparison-component-actions"><button type="button" data-component-action="only" disabled>Show only selected</button><button type="button" data-component-action="all">Show all / clear</button><span class="subtle" data-component-count>0 selected</span></div><div class="comparison-component-list"></div><p class="subtle">Click a name to focus; tick entries to combine selections.</p></aside>`;
    }
    function bindComparisonComponents(){
      for(const previous of document.querySelectorAll('.comparison-components')){
        const panel=previous.cloneNode(true);previous.replaceWith(panel);
        const index=Number(panel.dataset.viewIndex),record=comparison3dRecords()[index];
        let kind='protein',selected=new Set();
        const list=panel.querySelector('.comparison-component-list'),search=panel.querySelector('input[type="search"]');
        const update=()=>{
          const items=comparisonSelectionItems(record,kind);
          list.innerHTML=items.map((item,i)=>({item,i})).filter(({item})=>matchesSearch(search.value,`${item.label} ${item.detail} ${item.searchText||''}`)).map(({item,i})=>`<div class="molstar-protein-row"><input type="checkbox" data-item="${i}" ${selected.has(i)?'checked':''} aria-label="${attr('Include '+item.label+' in selection')}"><button type="button" class="molstar-legend-chip ${selected.has(i)?'active':''}" data-item="${i}" title="${attr(item.detail||'')}"><span class="component-swatch" style="background:${attr(item.color||'#999999')}"></span><span>${esc(item.label)} <small>${esc(item.detail||'')}</small></span></button></div>`).join('')||'<p class="subtle">No matching components or annotations.</p>';
          panel.querySelector('[data-component-count]').textContent=`${selected.size} selected`;
          panel.querySelector('[data-component-action="only"]').disabled=!selected.size;
        };
        const apply=async(options={})=>{
          const controller=comparison3d.controller;if(!controller)return;
          document.getElementById('comparisonSharedProtein').value='';document.getElementById('comparisonOnlyProtein').checked=false;
          const items=comparisonSelectionItems(record,kind),queries=[...selected].flatMap(i=>items[i]?.queries||[]);
          panel.querySelectorAll('button,input').forEach(el=>el.disabled=true);
          try{await controller.selectInView(index,queries,options);}
          catch(error){if(controller===comparison3d.controller)document.getElementById('comparison3dStatus').textContent=error.message;}
          finally{if(panel.isConnected){panel.querySelectorAll('button,input').forEach(el=>el.disabled=false);update();}}
        };
        panel.querySelectorAll('[data-component-kind]').forEach(button=>button.addEventListener('click',()=>{
          kind=button.dataset.componentKind;selected.clear();search.value='';
          panel.querySelectorAll('[data-component-kind]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});
          update();void apply({focus:false});
        }));
        search.addEventListener('input',update);
        list.addEventListener('click',event=>{const button=event.target.closest('button[data-item]');if(!button)return;selected=new Set([Number(button.dataset.item)]);update();void apply();});
        list.addEventListener('change',event=>{const input=event.target.closest('input[data-item]');if(!input)return;const i=Number(input.dataset.item);if(input.checked)selected.add(i);else selected.delete(i);update();void apply({focus:false});});
        panel.querySelector('[data-component-action="only"]').addEventListener('click',()=>void apply({only:true}));
        panel.querySelector('[data-component-action="all"]').addEventListener('click',()=>{selected.clear();update();void apply({focus:false});});
        panel.addEventListener('comparison-clear',()=>{selected.clear();update();});
        update();
      }
    }
    function comparison3dPanel(selected){
      if(!selected.some(r=>r.pdb_id===comparison3d.reference)) comparison3d.reference=selected[0].pdb_id;
      if(!selected.some(r=>r.pdb_id===comparison3d.mobile) || comparison3d.mobile===comparison3d.reference) comparison3d.mobile=selected.find(r=>r.pdb_id!==comparison3d.reference).pdb_id;
      const chooser=(id,value,label)=>`<label>${label}<select id="${id}">${selected.map(r=>`<option value="${attr(r.pdb_id)}" ${r.pdb_id===value?'selected':''}>${esc(r.pdb_id.toUpperCase())} · ${esc(r.state)} · ${esc(r.species)}</option>`).join('')}</select></label>`;
      const compared=comparison3dRecords(),[reference,mobile]=compared;
      const common=componentDifferenceRows(compared).filter(row=>row.type==='protein' && row.matched && row.entries.size===compared.length);
      return `<p class="comparison-note">Align deposited models using a shared protein anchor. This helps inspect structural changes; the Proteins tab remains the quickest way to identify reported gains or losses.</p><div class="comparison-3d-controls">${chooser('compare3dReference',comparison3d.reference,'Reference')}${comparison3d.mode==='overlay'?chooser('compare3dMobile',comparison3d.mobile,'Compare with'):''}<label>View<select id="compare3dMode"><option value="side" ${comparison3d.mode==='side'?'selected':''}>Side by side</option><option value="overlay" ${comparison3d.mode==='overlay'?'selected':''}>Overlay</option></select></label>${comparison3d.mode==='side'?`<label>Columns<select id="compare3dColumns">${['auto','1','2','3','4','5'].map(value=>`<option value="${value}" ${comparison3d.columns===value?'selected':''}>${value==='auto'?'Auto':value}</option>`).join('')}</select></label>`:''}<button class="comparison-load-primary" type="button" id="loadComparison3d">Align and view</button></div><p id="comparison3dStatus" role="status">Loading the selected structures automatically…</p><div id="comparison3dTools" class="comparison-3d-tools" hidden><label><input id="comparisonCameraSync" type="checkbox" checked>Synchronize views</label><label>Shared protein<select id="comparisonSharedProtein"><option value="">Choose a protein</option>${common.map(row=>`<option value="${attr(row.key)}">${esc(row.label)}</option>`).join('')}</select></label><label><input id="comparisonOnlyProtein" type="checkbox">Show only this protein</label><button type="button" id="resetComparison3d">Reset views</button></div><div class="comparison-canvases ${comparison3d.mode==='overlay'?'overlay':''}" id="comparisonCanvases" hidden>${(comparison3d.mode==='overlay'?[reference]:compared).map((r,i)=>`<section><h3>${esc(r.pdb_id.toUpperCase())} · ${esc(r.state || "State unspecified")}${comparison3d.mode==='overlay'?` + ${esc(mobile.pdb_id.toUpperCase())} · ${esc(mobile.state || "State unspecified")}`:i===0?' · reference':''}</h3><div id="${i===0?'comparisonLeft':i===1?'comparisonRight':`comparisonExtra${i}`}" class="comparison-canvas"></div>${comparison3d.mode==='overlay'?compared.map((entry,index)=>comparisonSelectionPanel(entry,index)).join(''):comparisonSelectionPanel(r,i)}</section>`).join('')}</div><p class="subtle">For detailed fitting, maps and measurements, use ChimeraX: ${compared.map(r=>`<a href="${attr(r.script_path || '')}" download>${esc(r.pdb_id.toUpperCase())} script</a>`).join(' · ')}. Side-by-side shows all selected structures (up to five), each fitted to the reference. Overlay retains component colours; use Show only this protein to reduce overlap.</p>`;
    }
    async function loadComparison3d(){
      disposeComparison3d();
      const abort=new AbortController();comparison3d.abort=abort;
      const status=document.getElementById('comparison3dStatus'),button=document.getElementById('loadComparison3d');
      const compared=comparison3dRecords(),[reference,mobile]=compared;
      button.textContent="Aligning…";button.disabled=true;status.textContent='Checking shared alignment evidence…';
      document.getElementById('comparison3dTools').hidden=true;
      document.getElementById('comparisonCameraSync').checked=true;
      document.getElementById('comparisonSharedProtein').value='';
      document.getElementById('comparisonOnlyProtein').checked=false;
      try{
        if(!comparison3d.manifest){
          const response=await fetch('data/comparison-alignments.json?v=3',{signal:abort.signal,cache:'no-cache'});
          if(!response.ok) throw new Error('Alignment evidence is unavailable in this release. Use the tables or ChimeraX scripts below.');
          comparison3d.manifest=await response.json();
        }
        if(abort.signal.aborted)return;
        const fits=compared.slice(1).map(record=>{
          const pair=comparison3d.manifest.pairs[[reference.pdb_id,record.pdb_id].sort().join(':')];
          if(!pair?.supported)throw new Error(`No reliable alignment for ${record.pdb_id.toUpperCase()} against ${reference.pdb_id.toUpperCase()}: ${pair?.reason || 'no validated protein anchor'}. Choose another reference or remove this structure from the basket.`);
          return {record,pair,matrix:pair.reference===reference.pdb_id?pair.matrix:SpliceVisComparisonViewer.invertMatrix(pair.matrix)};
        });
        const matrix=fits[0].matrix;
        const evidence=fits.map(({record,pair})=>`${record.pdb_id.toUpperCase()}: ${pair.anchor} · ${pair.fit_residues}/${pair.matched_residues} Cα atoms · RMSD ${pair.rmsd.toFixed(2)} Å (all matched ${pair.all_matched_rmsd.toFixed(2)} Å; ${(100*pair.sequence_identity).toFixed(0)}% identity)${pair.warning ? ` — ${pair.warning}` : ""}`).join(' | ') + '. Each fit uses its stated anchor against the reference, not the whole spliceosome.';
        document.getElementById('comparisonCanvases').hidden=false;
        const controller=await SpliceVisComparisonViewer.create({leftElement:document.getElementById('comparisonLeft'),rightElement:document.getElementById('comparisonRight'),reference,mobile,referenceProbes:comparison3d.manifest.probes?.[reference.pdb_id],mobileProbes:comparison3d.manifest.probes?.[mobile.pdb_id],matrix,additional:fits.slice(1).map((fit,i)=>({element:document.getElementById(`comparisonExtra${i+2}`),record:fit.record,transform:fit.matrix,probes:comparison3d.manifest.probes?.[fit.record.pdb_id]})),overlay:comparison3d.mode==='overlay',offline:!!DATA.offline,signal:abort.signal,onStatus:message=>{if(!abort.signal.aborted)status.textContent=message;}});
        if(abort.signal.aborted){controller.dispose();return;}
        comparison3d.controller=controller;
        bindComparisonComponents();
        status.textContent=evidence;
        document.getElementById('comparison3dTools').hidden=false;
        document.getElementById('comparisonCameraSync').closest('label').hidden=comparison3d.mode==='overlay';
      }catch(error){
        if(!abort.signal.aborted){status.textContent=error.message;document.getElementById('comparisonCanvases').hidden=true;document.getElementById('comparison3dTools').hidden=true;}
      }finally{if(!abort.signal.aborted){button.disabled=false;button.textContent=comparison3d.controller?"Reload aligned views":"Retry alignment";}}
    }
    async function selectComparisonProtein(){
      const controller=comparison3d.controller;if(!controller)return;
      const compared=comparison3dRecords(),[reference,mobile]=compared,key=document.getElementById('comparisonSharedProtein').value;
      const row=componentDifferenceRows(compared).find(r=>r.key===key);
      if(!row)return;
      const queries=r=>row.entries.get(r.pdb_id).map(auth_asym_id=>({auth_asym_id}));
      const controls=[document.getElementById('comparisonSharedProtein'),document.getElementById('comparisonOnlyProtein'),document.getElementById('resetComparison3d')];
      const only=controls[1].checked;controls.forEach(control=>control.disabled=true);
      document.querySelectorAll('.comparison-components').forEach(panel=>panel.dispatchEvent(new Event('comparison-clear')));
      try{await controller.selectComponent(queries(reference),queries(mobile),{only,additionalQueries:compared.slice(2).map(queries)});}
      catch(error){if(controller===comparison3d.controller){const status=document.getElementById('comparison3dStatus');if(status)status.textContent=error.message;}}
      finally{if(controller===comparison3d.controller)controls.forEach(control=>control.disabled=false);}
    }
    function applyComparisonColumns(){
      const grid=document.getElementById('comparisonCanvases');
      if(!grid)return;
      const count=Math.min(Number(comparison3d.columns),comparison3dRecords().length);
      grid.style.gridTemplateColumns=comparison3d.mode==='side' && Number.isInteger(count) && count>=1 ? `repeat(${count}, minmax(0, 1fr))` : '';
      comparison3d.controller?.resize();
    }
    function bindComparison3d(){
      applyComparisonColumns();
      document.getElementById('compare3dColumns')?.addEventListener('change',event=>{comparison3d.columns=event.target.value;applyComparisonColumns();});
      for(const [id,key] of [['compare3dReference','reference'],['compare3dMobile','mobile'],['compare3dMode','mode']]){
        document.getElementById(id)?.addEventListener('change',event=>{comparison3d[key]=event.target.value;renderComparison();});
      }
      document.getElementById('loadComparison3d')?.addEventListener('click',loadComparison3d);
      if(state.activeTab==='comparison' && document.getElementById('loadComparison3d'))void loadComparison3d();
      document.getElementById('comparisonCameraSync')?.addEventListener('change',event=>comparison3d.controller?.setSync(event.target.checked));
      document.getElementById('comparisonSharedProtein')?.addEventListener('change',selectComparisonProtein);
      document.getElementById('comparisonOnlyProtein')?.addEventListener('change',selectComparisonProtein);
      document.getElementById('resetComparison3d')?.addEventListener('click',async()=>{
        const controller=comparison3d.controller;if(!controller)return;
        try{await controller.reset();if(controller!==comparison3d.controller)return;
          document.getElementById('comparisonSharedProtein').value='';document.getElementById('comparisonOnlyProtein').checked=false;
          document.querySelectorAll('.comparison-components').forEach(panel=>panel.dispatchEvent(new Event('comparison-clear')));
        }catch(error){if(controller===comparison3d.controller)document.getElementById('comparison3dStatus').textContent=error.message;}
      });
    }
    function comparisonPanel(){
      const selected = state.compareIds.map(id=>records.find(r=>r.pdb_id===id)).filter(Boolean);
      const chips = selected.map(r=>`<span class="comparison-chip"><a href="${attr(structurePanelUrl(r.pdb_id))}" target="_blank" rel="noopener" title="Open ${attr(r.pdb_id.toUpperCase())} in a separate viewer">${esc(r.pdb_id.toUpperCase())}</a><button type="button" data-remove-comparison="${attr(r.pdb_id)}" aria-label="Remove ${attr(r.pdb_id.toUpperCase())} from comparison">×</button></span>`).join('');
      const controls = `<div class="comparison-heading"><h2>Compare structures</h2><button class="button" type="button" data-comparison-back>Back to atlas</button></div><div class="comparison-selection">${chips}${selected.length ? '<button class="button" type="button" data-clear-comparison>Clear comparison</button>' : ''}<span class="subtle">${selected.length}/5 selected${selected.length===5 ? ' · remove one to add another' : ''}</span></div>`;
      if(selected.length<2) return controls + '<p>Add at least two structures using the Compare column in the atlas. Selections stay when you search or filter.</p>';
      const tabs = [['3d','Aligned 3D'],['proteins','Proteins'],['rna','RNA & substrate'],['overview','Overview'],['evidence','Evidence & links']];
      let content;
      if(comparisonView.tab==='3d') content=comparison3dPanel(selected);
      else if(comparisonView.tab==='overview') content = comparisonOverview(selected);
      else if(comparisonView.tab==='evidence') content = comparisonEvidence(selected);
      else if(selected.some(r=>!Array.isArray(r.comparison_components))) content = '<p>Component comparison data is unavailable for an entry.</p>';
      else if(comparisonView.tab==='rna') content = comparisonRnaPanel(selected);
      else content = '<p class="comparison-note">Matched by curated identity, including Sm-ring context. Colours follow the SpliceVis component code. “Not reported” does not establish biological absence.</p>' + comparisonComponentTable(selected,'protein');
      return controls + `<div class="comparison-tabs" role="tablist" aria-label="Comparison categories">${tabs.map(([id,label])=>`<button type="button" role="tab" id="comparison-tab-${id}" aria-controls="comparison-content" aria-selected="${comparisonView.tab===id}" tabindex="${comparisonView.tab===id?'0':'-1'}" data-comparison-tab="${id}">${label}</button>`).join('')}</div><div id="comparison-content" role="tabpanel" aria-labelledby="comparison-tab-${comparisonView.tab}">${content}</div>`;
    }
    function renderComparisonBasket(){
      const basket=document.getElementById('comparisonBasket');
      if(!basket)return;
      const selected=state.compareIds.map(id=>records.find(r=>r.pdb_id===id)).filter(Boolean);
      basket.hidden=!selected.length;
      basket.innerHTML=selected.length?`<span class="basket-label">Comparison basket <span class="subtle">${selected.length}/5</span></span>${selected.map(r=>`<span class="comparison-chip" title="${attr(`${r.species} · ${r.state}`)}"><span>${esc(r.pdb_id.toUpperCase())}</span><button type="button" data-basket-remove="${attr(r.pdb_id)}" aria-label="Remove ${attr(r.pdb_id.toUpperCase())} from comparison basket">×</button></span>`).join('')}<button class="basket-clear" type="button" data-basket-clear>Clear all</button>${selected.length===5?'<span class="subtle">Basket full · remove one to add another</span>':''}`:'';
      basket.querySelectorAll('[data-basket-remove]').forEach(button=>button.addEventListener('click',()=>toggleCompare(button.dataset.basketRemove)));
      basket.querySelector('[data-basket-clear]')?.addEventListener('click',clearComparison);
    }
    function renderComparison(){
      renderComparisonBasket();
      disposeComparison3d();
      const launch = document.getElementById('openComparison');
      if(launch){ launch.textContent = `Compare selected (${state.compareIds.length})`; launch.disabled = !state.compareIds.length; }
      const panel = document.getElementById('comparison');
      if(!panel) return;
      panel.innerHTML = comparisonPanel();
      if(comparisonView.tab==='3d')bindComparison3d();
      panel.querySelector('[data-comparison-back]')?.addEventListener('click',()=>showStartTab('structures'));
      panel.querySelectorAll('[data-remove-comparison]').forEach(button=>button.addEventListener('click',()=>{
        toggleCompare(button.dataset.removeComparison);
        (panel.querySelector('[data-remove-comparison]') || panel.querySelector('[data-comparison-back]'))?.focus();
      }));
      panel.querySelector('[data-clear-comparison]')?.addEventListener('click',()=>{clearComparison(); panel.querySelector('[data-comparison-back]')?.focus();});
      panel.querySelector('[data-comparison-differences]')?.addEventListener('change',event=>{
        comparisonView.onlyDifferences = event.target.checked;
        renderComparison();
        panel.querySelector('[data-comparison-differences]')?.focus();
      });
      const tabs = [...panel.querySelectorAll('[data-comparison-tab]')];
      tabs.forEach((button,index)=>{
        const activate = id=>{comparisonView.tab=id; renderComparison(); panel.querySelector(`[data-comparison-tab="${id}"]`)?.focus();};
        button.addEventListener('click',()=>activate(button.dataset.comparisonTab));
        button.addEventListener('keydown',event=>{
          if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
          event.preventDefault();
          const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
          activate(tabs[next].dataset.comparisonTab);
        });
      });
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
      const descriptions={
        consistent:["good", "This RNA region is labelled the same way in the compared structures. Shared labels can still need checking."],
        partial_resolved:["warn", "This RNA region is labelled in some compared structures but not others. Missing labels do not necessarily mean missing RNA."],
        not_resolved:["", "This RNA region has not been labelled in any of the compared structures. It may still be visible in the model."],
        inconsistent:["bad", "The compared structures have different labels or sequences for this RNA region. Check whether this is a real difference or a labelling error."],
      };
      const [cls,help]=descriptions[status]||["", "This RNA comparison has not been assessed yet."];
      return annotationBadge((status||"n/a").replaceAll("_", " "), cls, help);
    }
    function renderRnaConsistency(){
      const rank = {inconsistent:0, partial_resolved:1, not_resolved:2, consistent:3};
      const rows = [...rnaFeatureConsistency].sort((a,b)=>(rank[a.status]??9)-(rank[b.status]??9) || String(a.family_label).localeCompare(String(b.family_label)) || String(a.feature).localeCompare(String(b.feature))).slice(0,170);
      els.rnaConsistencyRows.innerHTML = rows.map(x=>`<tr><td><strong>${esc(x.family_label||"")}</strong><br><span class="subtle">${esc(x.sequence_length||"")} nt</span></td><td>${esc(x.label||x.feature)}<br><code>${esc(x.expected_seq_start)}-${esc(x.expected_seq_end)} ${esc(x.expected_sequence||"")}</code></td><td>${rnaConsistencyBadge(x.status)}</td><td>${esc(x.observed_count||"0")} / ${esc(x.missing_count||"0")} / ${esc(x.conflict_count||"0")}</td><td><span class="subtle">seen:</span> ${esc(x.observed_members||"none")}<br>${x.missing_members?`<span class="subtle">missing:</span> ${esc(x.missing_members)}<br>`:""}${x.conflicting_members?`<span class="subtle">conflicts:</span> ${esc(x.conflicting_members)}`:""}</td></tr>`).join("") || '<tr><td colspan="5" class="subtle">No repeated RNA feature audit rows.</td></tr>';
    }
    function renderProteins(){
      const q = state.proteinQuery.trim().toLowerCase();
      const rows = proteinLookup.filter(p=>proteinComplexMatches(p) && (!q || matchesSearch(q,[p.display_name,p.human_gene,p.protein_name,p.class_family,p.aliases?.join(" "),systematicChainText(p),homologItems(p).map(h=>`${h.species_code} ${h.gene} ${h.entry||""}`).join(" ")].join(" "))));
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
    
