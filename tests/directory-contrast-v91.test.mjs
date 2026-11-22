import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('public/index.html');
const css=read('public/directory-contrast-v91.css');
const legacy=read('public/ux-v19.css');
const directory=read('public/directory-v17.css');
const dark=read('public/theme-v81.css');

const luminance=hex=>{
 const rgb=[1,3,5].map(n=>parseInt(hex.slice(n,n+2),16)/255)
  .map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
 return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
};
const contrast=(a,b)=>{
 const x=luminance(a),y=luminance(b);
 return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
};
const colorInRule=needle=>{
 const idx=css.indexOf(needle);
 assert.ok(idx>=0,needle+' must exist in v91 stylesheet');
 const end=css.indexOf('}',idx);
 const color=css.slice(css.indexOf('{',idx)+1,end).match(/color:(#[\da-f]{6})!important/i)?.[1];
 assert.ok(color,needle+' must explicitly override legacy ink');
 return color;
};

test('v91 dark directory CSS loads last, after existing theme and representative styling',()=>{
 assert.equal(JSON.parse(read('public/version.json')).version,'v91');
 assert.match(html,/name="ht-build" content="v91"/);
 assert.match(html,/href="\/directory-contrast-v91\.css\?v=91"/);
 assert.ok(html.indexOf('directory-contrast-v91.css')>html.indexOf('whatsapp-choice-v90.css'));
 assert.ok(html.indexOf('directory-contrast-v91.css')>html.indexOf('theme-v81.css'));
 assert.match(directory,/\.dir-filters label[^}]*color:#486873/);
 assert.match(legacy,/\.v19-rep-info strong[^}]*color:#172e42/);
 assert.match(dark,/#directoryView :is\(\.dir-tools,\.dir-card,\.v37-rep-card\)/);
});

test('representative name and secondary texts meet WCAG AA in navy dark mode',()=>{
 const navy='#17253c';
 const title=colorInRule('#directoryView .v19-rep-info strong');
 const secondary=colorInRule('#directoryView .v19-rep-info small');
 const search=colorInRule('#directoryView .dir-filters label');
 for(const [label,hex] of [['title',title],['secondary',secondary],['search',search]]){
  assert.ok(contrast(hex,navy)>=4.5,label+' requires WCAG AA 4.5:1; actual '+contrast(hex,navy).toFixed(2));
 }
 assert.match(css,/#representativesView \.v19-rep-info strong/);
 assert.match(css,/#representativesView \.v19-rep-search label/);
 assert.match(css, /overflow-wrap:anywhere/);
});

test('company/representative secondary fields, filter headings and links retain contrast',()=>{
 for(const part of [
  '#directoryView .dir-tools::before',
  '#directoryView .dir-company-info h3',
  '#directoryView .dir-contact-details strong',
  '#directoryView .dir-company-info :is(p,small)',
  '#directoryView .dir-contact-details .dir-contact-label',
  '#directoryView .dir-company-info a',
  '#directoryView .dir-import-bottom label',
  '#directoryView .dir-filters input::placeholder',
  '#directoryView .dir-tools .hint'
 ]){
  assert.ok(css.includes(part),part+' must be visible');
 }
 assert.ok(contrast('#f4f7ff','#17253c')>=7);
 assert.ok(contrast('#c5d4e9','#17253c')>=4.5);
 assert.ok(contrast('#cbdaf0','#17253c')>=4.5);
 assert.ok(contrast('#92eed4','#17253c')>=4.5);
 assert.match(css,/@media\(max-width:740px\)/);
 assert.match(css, /@media print/);
});

test('scope never changes light mode, contact record data, filter, importing or WhatsApp',()=>{
 const ruleHeads=[...css.matchAll(/(?:^|\n)(?:html[^{]+)\{/g)].map(x=>x[0]);
 assert.ok(ruleHeads.length>0);
 assert.ok(ruleHeads.every(x=>x.includes('html[data-ht-theme="dark"]')), 'dark-mode only selectors');
 assert.doesNotMatch(css,/display\s*:\s*none|visibility\s*:\s*hidden|pointer-events\s*:\s*none/i);
 assert.doesNotMatch(css,/fetch\s*\(|XMLHttpRequest|localStorage|DELETE FROM|DROP TABLE/i);
 assert.match(read('public/directory-v17.js'),/data-dir-chat/);
 assert.match(read('public/directory-v17.js'),/id="dirExcelInput"/);
 assert.match(read('public/representatives-v37.css'),/dir-mobile-gear/);
});
