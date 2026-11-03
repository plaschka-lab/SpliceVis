/* Interactive RNA SVG presentation; original download assets remain unchanged. */
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
  function baseTarget(title){
    const m=String(title||'').match(/^\/([^\s]+) seq (\d+) auth (-?\d+)$/);
    return m?{chain:m[1],seq:Number(m[2]),auth:Number(m[3])}:null;
  }
  function featureResidues(bases,chain,ranges){
    return [...new Set(bases.filter(b=>b&&b.chain===chain&&ranges.some(([a,z])=>b.seq>=a&&b.seq<=z)).map(b=>b.auth))].sort((a,b)=>a-b);
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
      let overview={x:values[0],y:values[1],w:values[2],h:values[3]},panels=[{label:'All RNAs',...overview}];
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
      // Reflow RNA cards at a shared letter size. Longer layouts get more space,
      // rather than having their letters squeezed into the same card dimensions.
      if(svg.querySelector('.backbone')&&panels.length>1){
        const ns='http://www.w3.org/2000/svg',cards=[...svg.querySelectorAll('rect[fill="#f8fafc"]')];
        const transforms=[];let nextY=100,maxW=0;
        for(let i=0;i<cards.length;i++){
          const rect=cards[i],panel=panels[i+1],old={...panel},scale=12/panel.font;
          const nodes=[];let node=rect;
          while(node&&node!==cards[i+1]&&!node.classList.contains('inter')&&!(node.classList.contains('label')&&node.textContent==='Feature overlays')){nodes.push(node);node=node.nextElementSibling;}
          const group=document.createElementNS(ns,'g');svg.insertBefore(group,rect);
          group.setAttribute('transform',`translate(40 ${nextY}) scale(${scale}) translate(${-old.x} ${-old.y})`);
          nodes.forEach(el=>group.append(el));
          group.querySelectorAll('text').forEach(el=>{const font=el.classList.contains('base')?12:el.classList.contains('label')?16:12;el.style.fontSize=font/scale+'px';});
          group.querySelectorAll('circle').forEach(el=>el.setAttribute('r',String(6/scale)));
          group.querySelectorAll('path,line,polyline,rect').forEach(el=>el.setAttribute('vector-effect','non-scaling-stroke'));
          panel.x=40;panel.y=nextY;panel.w=old.w*scale;panel.h=old.h*scale;panel.font=12;
          transforms.push({old,panel,scale});nextY+=panel.h+40;maxW=Math.max(maxW,panel.w);
        }
        function move(x,y){const t=transforms.find(t=>x>=t.old.x&&x<=t.old.x+t.old.w&&y>=t.old.y&&y<=t.old.y+t.old.h);return t?[t.panel.x+(x-t.old.x)*t.scale,t.panel.y+(y-t.old.y)*t.scale]:[x,y];}
        for(const line of svg.querySelectorAll('.inter')){
          const n=(line.getAttribute('d')||'').match(/-?\d+(?:\.\d+)?/g)?.map(Number);
          if(n?.length===6){const [x,y]=move(n[0],n[1]),[a,b]=move(n[4],n[5]);line.setAttribute('d',`M${x},${y} Q${Math.min(x,a)-45},${(y+b)/2} ${a},${b}`);}
        }
        const legend=[...svg.children].find(el=>el.classList.contains('label')&&el.textContent==='Feature overlays');
        if(legend){const group=document.createElementNS(ns,'g');const y=Number(legend.getAttribute('y'));group.setAttribute('transform',`translate(0 ${nextY-y})`);let node=legend;while(node){const next=node.nextElementSibling;group.append(node);node=next;}svg.append(group);}
        overview={x:0,y:0,w:maxW+80,h:nextY+160};Object.assign(panels[0],overview,{font:12});
      }
      scene.replaceChildren(document.importNode(svg,true));const drawing=scene.firstElementChild;
      const r2dt=!!drawing.querySelector('.backbone');
      document.getElementById('legendText').textContent=r2dt?'Grey backbone: deposited sequence. Dashed backbone: unresolved interval. Thin black lines: base pairs. Dashed curves between RNAs: clustered FR3D interactions. Thicker curves mean more reported interactions (width is capped), not stronger binding or greater confidence. Coloured overlays mark annotated features.':'Coloured tracks: deposited RNA chains. Thin arcs: reported intrachain base pairs. Dashed links: annotation-derived feature relationships. Line width does not measure interaction strength.';
      chooser.replaceChildren(...panels.map((p,i)=>{const o=document.createElement('option');o.value=i;o.textContent=p.label;return o;}));
      const pdb=new URLSearchParams(location.search).get('pdb')||new URL(url).pathname.split('/').pop().slice(0,4);
      const bases=[...drawing.querySelectorAll('text.base')].map(el=>({el,target:baseTarget(el.querySelector('title')?.textContent)}));
      function selectable(el,chain,residues,label){
        if(!residues.length)return;
        el._selection={source:'splicevis-rna-secondary',pdb_id:pdb,chain,auth_residues:residues,label};
        el.style.cursor='pointer';el.setAttribute('tabindex','0');el.setAttribute('role','button');el.setAttribute('aria-label',`Show ${label} in 3D`);
      }
      for(const {el,target} of bases)if(target)selectable(el,target.chain,[target.auth],`residue ${target.auth}`);
      try{
        const response=await fetch('rna-feature-targets.json');if(!response.ok)throw new Error('Feature map unavailable');
        const features=(await response.json())[pdb.toLowerCase()]||[];
        for(const el of drawing.querySelectorAll('.feature-label')){
          const group=el.parentElement;
          const chain=group.querySelector('text.label')?.textContent.match(/\/([^\s]+)\s+->/)?.[1];
          const feature=features.find(f=>f.chain===chain&&f.label===el.textContent);
          if(feature){const residues=featureResidues(bases.map(b=>b.target),chain,feature.ranges);selectable(el,chain,residues,feature.label);
            for(const dot of group.querySelectorAll('circle'))if(dot.querySelector('title')?.textContent===feature.title)selectable(dot,chain,residues,feature.label);
          }else{const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent='No verified residue mapping for this saved annotation. Individual modelled nucleotides remain selectable.';el.append(title);}
        }
      }catch(error){status.textContent='Nucleotide clicks available; feature mapping could not be loaded.';}
      function select(el){
        const payload=el?._selection;if(!payload)return;
        drawing.querySelectorAll('[data-selected]').forEach(node=>{node.removeAttribute('data-selected');node.style.removeProperty('paint-order');node.style.removeProperty('stroke');node.style.removeProperty('stroke-width');});
        for(const b of bases)if(b.target?.chain===payload.chain&&payload.auth_residues.includes(b.target.auth)){b.el.dataset.selected='true';b.el.style.paintOrder='stroke';b.el.style.stroke='#00a6c8';b.el.style.strokeWidth='2px';}
        if(self!==top){parent.postMessage(payload,location.origin);status.textContent=`Focusing ${payload.label} in 3D…`;}
        else status.textContent=`${payload.label}: ${payload.auth_residues.length} modelled residues selected. Use the embedded viewer on the structure page to focus Mol*.`;
      }
      window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.source==='splicevis-rna-secondary-result'&&event.data.pdb_id===pdb)status.textContent=event.data.message;});
      let view,baseline,drag=null,suppressClick=false;
      function paint(){drawing.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);document.getElementById('zoom').textContent=`${Math.round(baseline/view.w*100)}%`;tip.hidden=true;}
      function fit(){drawing.querySelectorAll('.inter').forEach(el=>el.style.display=chooser.value==='0'?'':'none');view=fitBox(panels[Number(chooser.value)],scene.clientWidth/Math.max(1,scene.clientHeight));baseline=view.w;paint();}
      function zoom(factor,px=.5,py=.5){const next=zoomBox(view,factor,px,py);if(next.w<overview.w/200||next.w>overview.w*4)return;view=next;paint();}
      chooser.addEventListener('change',()=>{document.getElementById('read').disabled=!panels[Number(chooser.value)].font;fit();if(chooser.value!=='0')readBases();status.textContent=chooser.value==='0'?'All RNA layouts. Choose an RNA for a closer view.':`${panels[Number(chooser.value)].label}. Zoom to inspect nucleotides; hover over lines for available annotations.`;});
      document.getElementById('fit').addEventListener('click',()=>{fit();status.textContent='Layout fitted to the panel. Choose Read bases or zoom for detail.';});
      function readBases(){
        const panel=panels[Number(chooser.value)];if(!panel.font)return;
        const h=scene.clientHeight*panel.font/14,w=h*scene.clientWidth/Math.max(1,scene.clientHeight);
        view={x:panel.x+(panel.w-w)/2,y:panel.y+(panel.h-h)/2,w,h};paint();
        status.textContent='Nucleotides at reading size. Drag or use arrow keys to explore the selected RNA; Fit selected RNA restores its overview.';
      }
      document.getElementById('read').addEventListener('click',readBases);
      document.getElementById('zoomIn').addEventListener('click',()=>zoom(.8));document.getElementById('zoomOut').addEventListener('click',()=>zoom(1.25));
      scene.addEventListener('wheel',event=>{if(!event.altKey)return;event.preventDefault();const r=scene.getBoundingClientRect();zoom(event.deltaY>0?1.15:1/1.15,(event.clientX-r.left)/r.width,(event.clientY-r.top)/r.height);},{passive:false});
      scene.addEventListener('pointerdown',event=>{if(event.button!==0)return;suppressClick=false;drag={id:event.pointerId,x:event.clientX,y:event.clientY,view:{...view},target:event.target};scene.classList.add('dragging');tip.hidden=true;});
      scene.addEventListener('pointermove',event=>{
        if(drag&&event.pointerId===drag.id){if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<5&&!suppressClick)return;suppressClick=true;scene.setPointerCapture(event.pointerId);view={...drag.view,x:drag.view.x-(event.clientX-drag.x)*drag.view.w/scene.clientWidth,y:drag.view.y-(event.clientY-drag.y)*drag.view.h/scene.clientHeight};paint();return;}
        const title=event.target.querySelector?.(':scope > title');if(!title){tip.hidden=true;return;}tip.textContent=title.textContent;tip.hidden=false;tip.style.left=Math.max(8,Math.min(event.clientX+12,innerWidth-tip.offsetWidth-8))+'px';tip.style.top=Math.max(8,Math.min(event.clientY+12,innerHeight-tip.offsetHeight-8))+'px';
      });
      scene.addEventListener('click',event=>{if(!suppressClick)select(event.target);});
      const stop=event=>{drag=null;scene.classList.remove('dragging');};scene.addEventListener('pointerup',stop);scene.addEventListener('pointercancel',stop);scene.addEventListener('lostpointercapture',stop);scene.addEventListener('pointerleave',()=>{tip.hidden=true;});
      scene.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){if(event.target._selection){event.preventDefault();select(event.target);return;}}if(['+','=','-','0','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))event.preventDefault();if(['+','='].includes(event.key))zoom(.8);else if(event.key==='-')zoom(1.25);else if(event.key==='0')fit();else if(event.key.startsWith('Arrow')){view.x+=event.key==='ArrowRight'?view.w*.1:event.key==='ArrowLeft'?-view.w*.1:0;view.y+=event.key==='ArrowDown'?view.h*.1:event.key==='ArrowUp'?-view.h*.1:0;paint();}});
      new ResizeObserver(()=>{if(!view)return;const w=view.h*scene.clientWidth/Math.max(1,scene.clientHeight);view.x+=(view.w-w)/2;view.w=w;paint();}).observe(scene);
      document.querySelectorAll('button,select').forEach(el=>el.disabled=false);document.getElementById('read').disabled=!panels[0].font;const download=document.getElementById('download');download.href=url;download.hidden=false;
      fit();status.textContent='Choose an RNA, then Read bases. Click a nucleotide or feature label to select its modelled residues in 3D.';
    }catch(error){status.textContent=error.message;}
  }
  return{assetUrl,fitBox,zoomBox,nucleotideSize,baseTarget,featureResidues,start};
});
