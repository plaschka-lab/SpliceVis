const {test}=require('node:test');
const assert=require('node:assert/strict');
const {install}=require('../web/popovers.js');
function harness(){
  const events={},jobs=new Map();let id=0;
  const doc={activeElement:null,querySelectorAll:()=>[a,b],addEventListener:(name,fn)=>events[name]=fn,
    createElement:()=>({setAttribute(){},addEventListener(name,fn){this[name]=fn;}})};
  function menu(){
    const m={open:true,isConnected:true,contains:n=>n?.owner===m||n===m,matches:()=>true,closest:()=>m};
    const summary={owner:m,textContent:'Filters',focus(){doc.activeElement=this;},after(button){m.closeButton=button;}};
    m.querySelector=s=>s==='summary'?summary:s==='.popover-close'?m.closeButton:null;
    return m;
  }
  const a=menu(),b=menu();b.open=false;
  const timers={setTimeout:fn=>{jobs.set(++id,fn);return id;},clearTimeout:key=>jobs.delete(key)};
  install(doc,timers);
  const item=(menu,edit=false)=>({owner:menu,closest:()=>menu,matches:()=>edit});
  const fire=(name,target,extra={})=>events[name]({target,pointerType:'mouse',preventDefault(){},...extra});
  const tick=()=>{const todo=[...jobs.values()];jobs.clear();todo.forEach(fn=>fn());};
  return {doc,a,b,item,fire,tick,jobs};
}
test('pointer leave delays dismissal and re-entry cancels it',()=>{
 const h=harness();h.fire('pointerover',h.a);h.fire('pointerout',h.a);assert.equal(h.a.open,true);
 h.fire('pointerover',h.a);h.tick();assert.equal(h.a.open,true);
 h.fire('pointerout',h.a);h.tick();assert.equal(h.a.open,false);
});
test('movement between trigger and menu descendants does not close',()=>{
 const h=harness();h.fire('pointerover',h.a);h.fire('pointerout',h.a,{relatedTarget:h.item(h.a)});h.tick();assert.equal(h.a.open,true);
});
test('mouse-focused summary does not permanently pin a menu',()=>{
 const h=harness();h.doc.activeElement=h.a.querySelector('summary');h.fire('pointerout',h.a);h.tick();assert.equal(h.a.open,false);
});
test('keyboard focus and text/select editing prevent delayed dismissal',()=>{
 for(const keyboard of [true,false]){
  const h=harness();h.doc.activeElement=h.item(h.a,!keyboard);
  if(keyboard)h.fire('keydown',h.doc.activeElement,{key:'Tab'});
  h.fire('pointerout',h.a);h.tick();assert.equal(h.a.open,true);
  const old=h.doc.activeElement;h.doc.activeElement=null;h.fire('focusout',old);h.tick();assert.equal(h.a.open,false);
 }
});
test('outside pointer and Escape dismiss with appropriate focus',()=>{
 const h=harness();h.fire('pointerdown',h.item(h.b),{pointerType:'touch'});assert.equal(h.a.open,false);
 h.a.open=true;h.fire('keydown',h.item(h.a),{key:'Escape'});assert.equal(h.a.open,false);assert.equal(h.doc.activeElement,h.a.querySelector('summary'));
});
test('touch leave does not close and newly rendered menus get explicit Close',()=>{
 const h=harness();h.fire('pointerout',h.a,{pointerType:'touch'});h.tick();assert.equal(h.a.open,true);
 h.fire('toggle',h.a);assert.ok(h.a.closeButton);h.a.closeButton.click();assert.equal(h.a.open,false);
});
test('opening another menu closes the previous one and cancels its timer',()=>{
 const h=harness();h.fire('pointerout',h.a);h.b.open=true;h.fire('toggle',h.b);assert.equal(h.a.open,false);assert.equal(h.jobs.size,0);
});
test('removed menus are not closed by stale timers',()=>{
 const h=harness();h.fire('pointerout',h.a);h.a.isConnected=false;h.tick();assert.equal(h.a.open,true);
});
test('native dropdown stays open during selection but does not pin menu afterward',()=>{
 const h=harness(),select=h.item(h.a);select.matches=s=>s==='select';h.doc.activeElement=select;
 h.fire('pointerdown',select);h.fire('pointerout',select);h.tick();assert.equal(h.a.open,true);
 h.fire('change',select);h.tick();assert.equal(h.a.open,false);
});
