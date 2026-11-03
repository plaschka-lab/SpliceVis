/* Interactive navigation of existing, unmodified RNA annotation SVGs. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else api.start();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function assetUrl(value,base){
    const url=new URL(value||'',base),folder=new URL('../rna_2d/',base);
    if(url.origin!==folder.origin||!url.pathname.startsWith(folder.pathname)||!url.pathname.endsWith('.svg')||url.search||url.hash)throw new Error('Choose a SpliceVis RNA SVG from the structure page.');
    return url.href;
  }
  function fitBox(box,ratio){
    let w=box.w*1.06,h=box.h*1.06;
    if(w/h<ratio)w=h*ratio;else h=w/ratio;
    return {x:box.x+(box.w-w)/2,y:box.y+(box.h-h)/2,w,h};
  }
  function zoomBox(view,factor,px=.5,py=.5){
    return{x:view.x+view.w*px*(1-factor),y:view.y+view.h*py*(1-factor),w:view.w*factor,h:view.h*factor};
  }
  function nucleotideSize(points){
    const distances=points.map((a,i)=>{
      let closest=Infinity;
      for(let j=0;j<points.length;j++){if(i===j)continue;const d=Math.hypot(a.x-points[j].x,a.y-points[j].y);if(d>.1&&d<closest)closest=d;}
      return closest;
    }).filter(Number.isFinite).sort((a,b)=>a-b);
    const spacing=distances.length?distances[Math.floor(distances.length*.1)]:14;
    return{font:Math.min(12,spacing*1.1),radius:Math.min(9.2,spacing*.5)};
  }
  async function start(){
    if(self!==top)document.body.classList.add('embedded');
    const scene=document.getElementById('scene'),chooser=document.getElementById('rna'),status=document.getElementById('status'),tip=document.getElementById('tip');
    try{
      const url=assetUrl(new URLSearchParams(location.search).get('svg'),location.href);
      const response=await fetch(url);if(!response.ok)throw new Error('RNA layout could not be loaded. Use the PNG or SVG download on the structure page.');
      const xml=new DOMParser().parseFromString(await response.text(),'image/svg+xml'),svg=xml.documentElement;
      if(svg.localName!=='svg'||xml.querySelector('parsererror'))throw new Error('The RNA layout is not a valid SVG.');
      // Do not allow executable markup or external references in an SVG asset.
      svg.querySelectorAll('script,foreignObject,iframe,object,embed,image,use,a,animate,animateTransform,set').forEach(el=>el.remove());
      for(const el of [svg,...svg.querySelectorAll('*')])for(const attr of [...el.attributes])if(/^on/i.test(attr.name)||/href$/i.test(attr.name)||(/url\s*\(/i.test(attr.value)&&!/^url\(#[\w-]+\)$/.test(attr.value)))el.removeAttribute(attr.name);
      svg.querySelectorAll('style').forEach(el=>{if(/@import|url\s*\(/i.test(el.textContent))el.remove();});
      const values=(svg.getAttribute('viewBox')||`0 0 ${svg.getAttribute('width')} ${svg.getAttribute('height')}`).trim().split(/[ ,]+/).map(Number);
      if(values.length!==4||values.some(v=>!Number.isFinite(v))||values[2]<=0||values[3]<=0)throw new Error('The RNA layout has invalid dimensions.');
      const overview={x:values[0],y:values[1],w:values[2],h:values[3]},panels=[{label:'All RNAs',...overview}];
      for(const rect of svg.querySelectorAll('rect[fill="#f8fafc"]')){
        const label=rect.nextElementSibling;if(label?.localName!=='text')continue;
        const box={x:Number(rect.getAttribute('x')),y:Number(rect.getAttribute('y')),w:Number(rect.getAttribute('width')),h:Number(rect.getAttribute('height'))};
        if(Object.values(box).every(Number.isFinite)&&box.w>0&&box.h>0)panels.push({label:label.textContent.replace(' -> ',' → '),...box});
      }
      // Fixed-size labels in a compressed source panel can overlap even after zoom.
      // Fit glyphs/feature dots to each panel's nearest nucleotide spacing.
      for(const panel of panels.slice(1)){
        const inside=(x,y)=>x>=panel.x&&x<=panel.x+panel.w&&y>=panel.y&&y<=panel.y+panel.h;
        const bases=[...svg.querySelectorAll('text.base')].filter(el=>inside(Number(el.getAttribute('x')),Number(el.getAttribute('y'))));
        const points=bases.map(el=>({x:Number(el.getAttribute('x')),y:Number(el.getAttribute('y'))}));
        const size=nucleotideSize(points);panel.font=size.font;
        bases.forEach(el=>el.style.fontSize=panel.font+'px');
        for(const el of svg.querySelectorAll('circle'))if(inside(Number(el.getAttribute('cx')),Number(el.getAttribute('cy'))))el.setAttribute('r',String(Math.min(Number(el.getAttribute('r')),size.radius)));
      }
      scene.replaceChildren(document.importNode(svg,true));const drawing=scene.firstElementChild;
      const r2dt=!!drawing.querySelector('.backbone');
      document.getElementById('legendText').textContent=r2dt?'Grey backbone: deposited sequence. Dashed backbone: unresolved interval. Thin black lines: base pairs. Dashed curves between RNAs: clustered FR3D interactions. Thicker curves mean more reported interactions (width is capped), not stronger binding or greater confidence. Coloured overlays mark annotated features.':'Coloured tracks: deposited RNA chains. Thin arcs: reported intrachain base pairs. Dashed links: annotation-derived feature relationships. Line width does not measure interaction strength.';
      chooser.replaceChildren(...panels.map((p,i)=>{const o=document.createElement('option');o.value=i;o.textContent=p.label;return o;}));
      let view,baseline,drag=null;
      function paint(){drawing.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);document.getElementById('zoom').textContent=`${Math.round(baseline/view.w*100)}%`;tip.hidden=true;}
      function fit(){view=fitBox(panels[Number(chooser.value)],scene.clientWidth/Math.max(1,scene.clientHeight));baseline=view.w;paint();}
      function zoom(factor,px=.5,py=.5){const next=zoomBox(view,factor,px,py);if(next.w<overview.w/200||next.w>overview.w*4)return;view=next;paint();}
      chooser.addEventListener('change',()=>{document.getElementById('read').disabled=!panels[Number(chooser.value)].font;fit();status.textContent=chooser.value==='0'?'All RNA layouts. Choose an RNA for a closer view.':`${panels[Number(chooser.value)].label}. Zoom to inspect nucleotides; hover over lines for available annotations.`;});
      document.getElementById('fit').addEventListener('click',()=>{fit();status.textContent='Layout fitted to the panel. Choose Read bases or zoom for detail.';});
      document.getElementById('read').addEventListener('click',()=>{
        const panel=panels[Number(chooser.value)];if(!panel.font)return;
        const h=scene.clientHeight*panel.font/14,w=h*scene.clientWidth/Math.max(1,scene.clientHeight);
        view={x:panel.x+(panel.w-w)/2,y:panel.y+(panel.h-h)/2,w,h};paint();
        status.textContent='Nucleotides at reading size. Drag or use arrow keys to explore the selected RNA; Fit selected RNA restores its overview.';
      });
      document.getElementById('zoomIn').addEventListener('click',()=>zoom(.8));document.getElementById('zoomOut').addEventListener('click',()=>zoom(1.25));
      scene.addEventListener('wheel',event=>{if(!event.altKey)return;event.preventDefault();const r=scene.getBoundingClientRect();zoom(event.deltaY>0?1.15:1/1.15,(event.clientX-r.left)/r.width,(event.clientY-r.top)/r.height);},{passive:false});
      scene.addEventListener('pointerdown',event=>{if(event.button!==0)return;drag={id:event.pointerId,x:event.clientX,y:event.clientY,view:{...view}};scene.setPointerCapture(event.pointerId);scene.classList.add('dragging');tip.hidden=true;});
      scene.addEventListener('pointermove',event=>{
        if(drag&&event.pointerId===drag.id){view={...drag.view,x:drag.view.x-(event.clientX-drag.x)*drag.view.w/scene.clientWidth,y:drag.view.y-(event.clientY-drag.y)*drag.view.h/scene.clientHeight};paint();return;}
        const title=event.target.querySelector?.(':scope > title');if(!title){tip.hidden=true;return;}tip.textContent=title.textContent;tip.hidden=false;tip.style.left=Math.max(8,Math.min(event.clientX+12,innerWidth-tip.offsetWidth-8))+'px';tip.style.top=Math.max(8,Math.min(event.clientY+12,innerHeight-tip.offsetHeight-8))+'px';
      });
      const stop=()=>{drag=null;scene.classList.remove('dragging');};scene.addEventListener('pointerup',stop);scene.addEventListener('pointercancel',stop);scene.addEventListener('lostpointercapture',stop);scene.addEventListener('pointerleave',()=>{tip.hidden=true;});
      scene.addEventListener('keydown',event=>{if(['+','=','-','0','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))event.preventDefault();if(['+','='].includes(event.key))zoom(.8);else if(event.key==='-')zoom(1.25);else if(event.key==='0')fit();else if(event.key.startsWith('Arrow')){view.x+=event.key==='ArrowRight'?view.w*.1:event.key==='ArrowLeft'?-view.w*.1:0;view.y+=event.key==='ArrowDown'?view.h*.1:event.key==='ArrowUp'?-view.h*.1:0;paint();}});
      new ResizeObserver(()=>{if(!view)return;const w=view.h*scene.clientWidth/Math.max(1,scene.clientHeight);view.x+=(view.w-w)/2;view.w=w;paint();}).observe(scene);
      document.querySelectorAll('button,select').forEach(el=>el.disabled=false);document.getElementById('read').disabled=true;const download=document.getElementById('download');download.href=url;download.hidden=false;
      fit();status.textContent='Choose an RNA or zoom to inspect nucleotides. Hover over lines for available annotations.';
    }catch(error){status.textContent=error.message;}
  }
  return{assetUrl,fitBox,zoomBox,nucleotideSize,start};
});
