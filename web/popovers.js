/* Dismiss transient menus without collapsing persistent content sections. */
(function(root){
  function install(doc, timers=globalThis){
    const selector='details.refine-drawer,details.tools-drawer,details.chimerax-options,details.viewer-display';
    const pending=new Map(), hovered=new Set();
    let keyboard=false, nativeSelect=null;
    const menus=()=>Array.from(doc.querySelectorAll(selector));
    const menuFor=node=>node?.closest?.(selector);
    function cancel(menu){if(pending.has(menu))timers.clearTimeout(pending.get(menu));pending.delete(menu);}
    function close(menu,restore=false){
      cancel(menu); hovered.delete(menu);
      const focused=menu.contains(doc.activeElement);
      if(menu.contains(nativeSelect))nativeSelect=null;
      menu.open=false;
      if(restore || focused) menu.querySelector('summary')?.focus({preventScroll:true});
    }
    function editing(menu){
      const active=doc.activeElement;
      return menu.contains(active) && (keyboard || active===nativeSelect || active?.matches?.('input:not([type="checkbox"]):not([type="radio"]):not([type="button"]),textarea,[contenteditable="true"]'));
    }
    function later(menu){
      cancel(menu);
      if(!menu?.open)return;
      pending.set(menu,timers.setTimeout(()=>{
        pending.delete(menu);
        if(menu.isConnected && menu.open && !hovered.has(menu) && !editing(menu))close(menu);
      },600));
    }
    doc.addEventListener('pointerover',event=>{
      if(event.pointerType==='touch')return;
      const menu=menuFor(event.target);
      if(menu){hovered.add(menu);cancel(menu);}
    });
    doc.addEventListener('pointerout',event=>{
      if(event.pointerType==='touch')return;
      const menu=menuFor(event.target);
      if(menu && !menu.contains(event.relatedTarget)){hovered.delete(menu);later(menu);}
    });
    doc.addEventListener('pointerdown',event=>{
      keyboard=false;
      nativeSelect=event.target.matches?.('select') ? event.target : null;
      for(const menu of menus())if(menu.open && !menu.contains(event.target))close(menu);
    },true);
    doc.addEventListener('keydown',event=>{
      keyboard=true;
      if(event.key==='Escape'){
        const nearest=menuFor(event.target);
        const menu=nearest?.open ? nearest : menus().find(menu=>menu.open);
        if(menu?.open){event.preventDefault();close(menu,true);}
      }
    },true);
    doc.addEventListener('focusin',event=>{const menu=menuFor(event.target);if(menu)cancel(menu);});
    doc.addEventListener('focusout',event=>{
      if(event.target===nativeSelect)nativeSelect=null;
      const menu=menuFor(event.target);
      if(menu && !menu.contains(event.relatedTarget))later(menu);
    });
    doc.addEventListener('change',event=>{
      if(event.target===nativeSelect){nativeSelect=null;later(menuFor(event.target));}
    });
    doc.addEventListener('toggle',event=>{
      const menu=event.target;
      if(!menu.matches?.(selector))return;
      cancel(menu);
      if(!menu.open){hovered.delete(menu);return;}
      for(const other of menus())if(other!==menu && other.open)close(other);
      const body=menu.querySelector('.refine-popover,.tools-drawer-body,.chimerax-options-body') || menu;
      if(!body.querySelector('.popover-close')){
        const button=doc.createElement('button');
        button.type='button';button.className='popover-close';button.textContent='Close ×';
        button.setAttribute('aria-label',`Close ${menu.querySelector('summary').textContent.trim()}`);
        button.addEventListener('click',()=>close(menu,true));
        if(body===menu)menu.querySelector('summary').after(button);else body.prepend(button);
      }
    },true);
  }
  if(typeof module==='object' && module.exports)module.exports={install};
  else install(root.document);
})(globalThis);
