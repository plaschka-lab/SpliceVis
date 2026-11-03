const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'web/dashboard.js'), 'utf8');
const context = vm.createContext({});
// Exercise the actual render helpers without starting the dashboard or WebGL.
for (const name of ['esc', 'attr', 'formatResolution', 'initBadgeHelp', 'annotationBadge', 'rnaAnnotationHelp',
  'evidenceHelp', 'curationTagHelp', 'rnaAnnotationBadges', 'isMinorSpliceosome',
  'minorSpliceosomeBadge', 'flagSupportingMetric', 'flagBadge', 'curationBadges',
  'confidenceBadge', 'curationPanel', 'rnaConsistencyBadge']) {
  const match = source.match(new RegExp(`^    function ${name}\\([\\s\\S]*?(?=^    (?:async )?function |^    init\\()`, 'm'));
  assert.ok(match, name);
  vm.runInContext(match[0], context);
}

function checkBadges(html) {
  const tags = html.match(/<(?:span|summary)\b[^>]*\bclass="badge(?:\s[^"]*)?"[^>]*>/g) || [];
  assert.ok(tags.length);
  for (const tag of tags) {
    assert.match(tag, /data-badge-help="[^"]{12,}"/);
    assert.doesNotMatch(tag, /\stitle=/, 'Do not reintroduce delayed native tooltips');
    assert.doesNotMatch(tag, /data-badge-help="(?:undefined|null)"/);
  }
}

test('every curation and RNA badge has help, including missing metadata', () => {
  const dataPath = path.join(root, 'data/structures.json');
  const records = fs.existsSync(dataPath) ? JSON.parse(fs.readFileSync(dataPath)).records : [];
  assert.ok(records.length, 'Run from the public checkout with its released dataset');
  for (const record of [...records, {}, {curation:{provisional_rna_features:1}}]) {
    checkBadges(context.rnaAnnotationBadges(record));
    checkBadges(context.curationBadges(record));
    checkBadges(context.curationBadges(record, false));
    checkBadges(context.curationPanel(record));
  }
  for (const tag of new Set(records.flatMap(r => r.curation?.badges || []))) {
    assert.doesNotMatch(context.curationTagHelp(tag), /^Curation audit tag:/, tag);
  }
});

test('confidence, minor, and consistency badges explain their scope', () => {
  for (const level of ['high', 'medium', 'low', 'review', undefined]) checkBadges(context.confidenceBadge(level));
  checkBadges(context.minorSpliceosomeBadge({title:'Minor spliceosome'}));
  for (const status of ['consistent', 'partial_resolved', 'not_resolved', 'inconsistent', undefined]) {
    checkBadges(context.rnaConsistencyBadge(status));
  }
  assert.match(context.rnaConsistencyBadge('not_resolved'), /may still be visible/);
  assert.match(context.confidenceBadge('high', 'Color coverage'), /do not confirm protein identity/);
  assert.match(context.rnaAnnotationBadges({substrate_features:[{}]}), /not RNA molecules/);
});

test('badge labels and hover evidence are HTML escaped', () => {
  const html = context.annotationBadge('<script>', 'good', 'Evidence: "quoted" <img> & more');
  assert.doesNotMatch(html, /<script>|<img>/);
  assert.match(html, /&quot;quoted&quot;/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /aria-label="/);
});

test('help-page legend badges have explanations too', () => {
  checkBadges(fs.readFileSync(path.join(root, 'web/index.html'), 'utf8'));
});

test('badge help opens immediately, stays in the viewport, and closes on Escape or scrolling', () => {
  const events={}, windowEvents={};
  let popup, timers=0;
  class Element {
    constructor(isBadge=false) { this.isBadge=isBadge; this.style={}; this.attributes={}; this.dataset={badgeHelp:'Some RNA labels are approximate and need checking.'}; }
    setAttribute(key,value) { this.attributes[key]=value; }
    removeAttribute(key) { delete this.attributes[key]; }
    contains(node) { return this===node; }
    closest(selector) { return selector.startsWith('.badge[') && this.isBadge ? this : null; }
    getBoundingClientRect() { return this.isBadge ? {left:360,top:250,bottom:275} : {width:320,height:80}; }
  }
  Object.assign(context, {
    Element, innerWidth:390, innerHeight:300,
    setTimeout:()=>{ timers++; return 1; }, clearTimeout:()=>{},
    document:{createElement:()=>new Element(), body:{appendChild:el=>{popup=el;}}, addEventListener:(event,fn)=>{events[event]=fn;}},
    window:{addEventListener:(event,fn)=>{windowEvents[event]=fn;}}
  });
  context.initBadgeHelp();
  const badge=new Element(true);
  events.pointerover({target:badge});
  assert.equal(popup.hidden,false);
  assert.equal(timers,0,'Hover must not wait for a timer');
  assert.equal(popup.textContent,badge.dataset.badgeHelp);
  assert.equal(popup.style.left,'62px');
  assert.equal(popup.style.top,'164px');
  assert.equal(badge.attributes['aria-describedby'],'annotationBadgeHelp');
  events.keydown({key:'Escape'});
  assert.equal(popup.hidden,true);
  assert.equal(badge.attributes['aria-describedby'],undefined);
  events.focusin({target:badge});
  assert.equal(popup.hidden,false);
  events.scroll({target:{}});
  assert.equal(popup.hidden,true);
  events.pointerover({target:badge});
  windowEvents.resize();
  assert.equal(popup.hidden,true);
});
