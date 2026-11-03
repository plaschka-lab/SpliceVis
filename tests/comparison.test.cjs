const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = fs.existsSync(path.join(__dirname, '../web/dashboard.js')) ? path.resolve(__dirname, '..') : path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'web/dashboard.js'), 'utf8');
const context = vm.createContext({});
const match = source.match(/^    function componentDifferenceRows\([\s\S]*?(?=^    function )/m);
vm.runInContext(match[0], context);
for (const name of ['esc','attr','comparisonSwatch','comparisonTable','comparisonFeatureRows','comparisonOverview']) {
  const helper = source.match(new RegExp(`^    function ${name}\\([\\s\\S]*?(?=^    (?:async )?function |^    let )`, 'm'));
  vm.runInContext(helper[0], context);
}
vm.runInContext('function structurePanelUrl(id){return "?panel="+id;}', context);
const component = (key, chains) => ({key, chains, label:key, type:'protein', matched:true});
const record = (pdb_id, ...comparison_components) => ({pdb_id, comparison_components});

test('chain renaming does not imply a component difference; copy counts do', () => {
  const rows = context.componentDifferenceRows([
    record('a', component('PRPF8', ['A']), component('SNRPB', ['B', 'C'])),
    record('b', component('PRPF8', ['Z']), component('SNRPB', ['Y']))
  ]);
  assert.equal(rows.find(r=>r.key==='PRPF8').different, false);
  assert.equal(rows[0].key, 'SNRPB');
  assert.equal(rows[0].different, true);
});

test('presence is distinct from missing chain metadata and duplicate chains are not counted twice', () => {
  const rows = context.componentDifferenceRows([
    record('a', component('A', []), component('B', ['X']), component('B', ['X'])),
    record('b', component('B', ['Y']))
  ]);
  assert.equal(rows.find(r=>r.key==='A').different, true);
  assert.equal(rows.find(r=>r.key==='B').different, false);
});

test('shared components and an empty comparison do not create false differences', () => {
  assert.equal(context.componentDifferenceRows([]).length, 0);
  assert.equal(context.componentDifferenceRows([record('a', component('A', ['X']))])[0].different, false);
});

test('comparison uses per-entry component colours and rejects invalid CSS values', () => {
  const rows=context.componentDifferenceRows([record('a',{...component('PRPF8',['A']),color_hex:'#123456'}), record('b',{...component('PRPF8',['B']),color_hex:'#654321'})]);
  assert.equal(rows[0].colors.get('a'),'#123456');
  assert.equal(rows[0].colors.get('b'),'#654321');
  assert.match(context.comparisonSwatch('#123456'), /background:#123456/);
  assert.equal(context.comparisonSwatch('red;position:fixed'), '');
});

test('RNA comparison distinguishes provisional annotations from missing annotation', () => {
  const rows=context.comparisonFeatureRows([{pdb_id:'a',molstar_feature_selections:[{kind:'snRNA',feature:'U6_ISL',label:'U6 ISL',color:'#EF4444',chain:'F',residue_ranges:'56-79',confidence:'medium'}]}, {pdb_id:'b'}]);
  assert.match(rows[0].values[0], /Provisional annotation/);
  assert.match(rows[0].values[0], /F:56-79/);
  assert.match(rows[0].values[1], /Not annotated/);
  assert.doesNotMatch(rows[0].values[1], /absent/);
});

test('overview retains zero counts, escapes text, and labels missing resolution', () => {
  const html=context.comparisonOverview([{pdb_id:'a',rna_count:0,title:'<script>',resolution:''}]);
  assert.match(html, /RNA entities<\/th><td>0<\/td>/);
  assert.match(html, /Reported resolution \(Å\)<\/th><td>Not available/);
  assert.match(html, /&lt;script&gt;/);
});

test('6ID0/6ID1 exposes DHX15 without manually scanning protein lists', {skip: !fs.existsSync(path.join(root,'data/structures.json'))}, () => {
  const records = JSON.parse(fs.readFileSync(path.join(root,'data/structures.json'))).records;
  const selected = ['6id0','6id1'].map(id=>records.find(r=>r.pdb_id===id));
  assert.ok(selected.every(r=>Array.isArray(r.comparison_components)));
  const row = context.componentDifferenceRows(selected).find(r=>r.label==='DHX15');
  assert.ok(row?.different);
  assert.equal(row.entries.size, 1);
});

test('all comparison chain colours agree with the viewer palette', {skip: !fs.existsSync(path.join(root,'data/structures.json'))}, () => {
  const records = JSON.parse(fs.readFileSync(path.join(root,'data/structures.json'))).records;
  for(const r of records){
    const colors = new Map((r.molstar_color_selections||[]).map(x=>[x.auth_asym_id,x.color]));
    for(const component of r.comparison_components || []){
      for(const chain of component.chains){
        if(colors.has(chain)) assert.equal(component.color_hex.toLowerCase(), colors.get(chain).toLowerCase(), `${r.pdb_id} chain ${chain}`);
      }
    }
  }
});

test('typing a trailing space preserves raw input while queries remain case insensitive', () => {
  const inputListener = source.match(/els\.search\.addEventListener\("input",\(\)=>\{([\s\S]*?)\n      \}\);/)[1];
  const ctx = vm.createContext({state:{activeTab:'proteins'}, els:{search:{value:'Prp '}, family:{}}});
  vm.runInContext('function render(){ els.search.value = state.proteinQuery; }', ctx);
  vm.runInContext(`(()=>{${inputListener}})()`, ctx);
  assert.equal(ctx.els.search.value, 'Prp ');
  ctx.els.search.value += '8';
  vm.runInContext(`(()=>{${inputListener}})()`, ctx);
  assert.equal(ctx.state.proteinQuery, 'Prp 8');
  // The production matching path, unlike input storage, normalizes the query.
  assert.match(source, /const q = state\.proteinQuery\.trim\(\)\.toLowerCase\(\)/);
});
