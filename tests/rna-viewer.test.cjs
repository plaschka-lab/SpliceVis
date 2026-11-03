const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=fs.existsSync(path.join(__dirname,'../web/rna-viewer.js'))?'../':'../../';
const {assetUrl,fitBox,zoomBox,nucleotideSize}=require(path.join(__dirname,root,'web/rna-viewer.js'));
test('RNA viewer accepts only local RNA SVG assets',()=>{
 const base='https://example.org/SpliceVis/web/rna-viewer.html';
 assert.equal(assetUrl('../rna_2d/8i0u.svg',base),'https://example.org/SpliceVis/rna_2d/8i0u.svg');
 for(const bad of ['https://evil.org/rna.svg','../web/script.js','../rna_2d/../other.svg','../rna_2d/a.svg?x=1','javascript:alert(1)'])assert.throws(()=>assetUrl(bad,base));
});
test('fit contains the entire selected RNA without stretching and zoom retains the pointer anchor',()=>{
 const box={x:100,y:200,w:820,h:520},fit=fitBox(box,2);
 assert.equal(fit.w/fit.h,2);assert.ok(fit.x<=box.x&&fit.y<=box.y);assert.ok(fit.x+fit.w>=box.x+box.w&&fit.y+fit.h>=box.y+box.h);
 const zoom=zoomBox(fit,.8,.2,.7);
 assert.ok(Math.abs(zoom.x+zoom.w*.2-(fit.x+fit.w*.2))<1e-9);
 assert.ok(Math.abs(zoom.y+zoom.h*.7-(fit.y+fit.h*.7))<1e-9);
});
test('dense RNA tracks use smaller glyphs and feature dots while sparse layouts retain original sizes',()=>{
 const dense=nucleotideSize(Array.from({length:100},(_,i)=>({x:i*3,y:0})));
 assert.ok(dense.font<4);assert.equal(dense.radius,1.5);
 assert.deepEqual(nucleotideSize([{x:0,y:0},{x:40,y:0}]),{font:12,radius:9.2});
 assert.deepEqual(nucleotideSize([]),{font:12,radius:7});
});
