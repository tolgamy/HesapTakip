import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('public/index.html'),css=read('public/hesaptakip-design-v94.css');
const workflow=read('.github/workflows/deploy-cloudflare.yml');
const version=JSON.parse(read('public/version.json'));

function luminance(hex){
 const channels=[1,3,5].map(x=>parseInt(hex.slice(x,x+2),16)/255)
  .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
}
function contrast(a,b){
 const x=luminance(a),y=luminance(b);
 return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
test('single v94 release contains one stylesheet after every legacy visual patch',()=>{
 assert.equal(version.version,'v94');
 assert.match(html,/name="ht-build" content="v94"/);
 assert.equal((html.match(/href="\/hesaptakip-design-v94\.css\?v=94"/g)||[]).length,1);
 assert.ok(html.indexOf('/hesaptakip-design-v94.css')>html.indexOf('/vault-mobile-v93.css'));
 assert.ok(html.indexOf('/hesaptakip-design-v94.css')>html.indexOf('/theme-v81.css'));
 assert.ok(html.indexOf('/hesaptakip-design-v94.css')>html.indexOf('/directory-contrast-v91.css'));
 assert.ok(html.indexOf('/hesaptakip-design-v94.css')>html.indexOf('/settings-grid-v86.css'));
 assert.equal((html.match(/class="mobile-bottom-item(?: active)?"/g)||[]).length,5);
 for(const destination of ['overview','cardbank','accounts','firms','settings'])
  assert.ok(html.includes('data-v18-section="'+destination+'"'),'five existing working destinations');
});

test('V2 is one accessible, limited-accent design system for all five sections',()=>{
 for(const token of ['--ht2-bg','--ht2-surface','--ht2-elevated','--ht2-input',
  '--ht2-ink','--ht2-muted','--ht2-border','--ht2-accent','--ht2-danger'])
  assert.ok(css.includes(token+':'),token+' exists');
 assert.match(css,/html\[data-ht-theme="dark"\]/);
 for(const section of ['#overviewView','#cardsView','#bankingView','#collectionsView',
  '#peopleView','#payablesView','#directoryView','#settingsView',
  '#vaultView','#appPage .mobile-bottom-nav'])
  assert.ok(css.includes(section),section+' is covered');
 assert.match(css,/color:var\(--ht2-ink\)!important/);
 assert.match(css,/font-size:clamp\(27px,5\.5vw,36px\)!important/);
 assert.match(css,/tabular-nums/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});

test('dark color pairings pass WCAG AA normal text (at least 4.5:1)',()=>{
 for(const [fg,bg,label] of [
  ['#f0f7fa','#13283a','dark surface title'],
  ['#c0d2df','#13283a','dark surface subtitle'],
  ['#a9c0d0','#21384e','dark input placeholder'],
  ['#163348','#ffffff','light surface title'],
  ['#526e80','#ffffff','light surface subtitle'],
  ['#ffffff','#088575','teal action']
 ]){
  assert.ok(contrast(fg,bg)>=4.5,
   label+' contrast was '+contrast(fg,bg).toFixed(2)+', must be >= 4.5');
 }
});

test('existing data-bound cards, finance labels, company contacts and five tabs retained',()=>{
 for(const marker of [
  'id="v8NetValue"','id="v8TotalReceivable"','id="v8TotalDebt"',
  'id="cardList"','id="payablesStats"','id="v87ContactsList"',
  'id="v26VaultList"','id="v89ConfirmDelete"'
 ])assert.ok(html.includes(marker),'do not delete '+marker);
 for(const marker of [
  '#overviewView .v8-net-hero','#cardsView .ht-card-today-title',
  '#payablesView #v72PayablesLeader','#directoryView .dir-filters',
  '#settingsView .v85-setting-tile','#settingsView .v89-group',
  '#appPage .mobile-bottom-item.active'
 ])assert.ok(css.includes(marker),marker+' redesigned');
 assert.doesNotMatch(css,/DELETE FROM|UPDATE\s+\w+\s+SET|localStorage|fetch\s*\(/);
});

test('personal receivable/borrowing dialog label contrast is explicitly handled',()=>{
 for(const selector of ['#modal','#quickDialog','#institutionDialog',
  '#v26VaultDialog','#v44OcrDialog','.v9-receivable-box',
  '.v9-form-grid label','.v9-block-title h3']){
  assert.ok(css.includes(selector),selector+' included in form system');
 }
 assert.match(css,/#appPage \.view :is\(input,select,textarea\)/);
 assert.match(css,/background:var\(--ht2-input\)!important/);
 assert.match(css,/color:var\(--ht2-ink\)!important/);
 assert.match(css,/@media\(max-width:740px\)/);
});

test('CI fails closed unless production D1 Time Travel recovery points are accessible',()=>{
 const check=workflow.indexOf('- name: Verify recoverable D1 state before deployment');
 const release=workflow.indexOf('- name: Deploy to Cloudflare');
 assert.ok(check>0&&release>check);
 assert.match(workflow,/wrangler d1 info karttakip-db --json/);
 assert.match(workflow,/d\.version!=='production'/);
 assert.match(workflow,/wrangler d1 time-travel info karttakip-db --json/);
 assert.match(workflow,/wrangler d1 time-travel info karttakip-db --timestamp=/);
 assert.match(workflow,/Deployment blocked\./);
 assert.doesNotMatch(workflow,/d1 time-travel restore|d1 migrations apply|d1 execute/);
});

test('CSS is syntactically balanced and uses no network/embedded private records',()=>{
 const noComments=css.replace(/\/\*[\s\S]*?\*\//g,'');
 assert.equal((noComments.match(/\{/g)||[]).length,(noComments.match(/\}/g)||[]).length);
 assert.doesNotMatch(css,/https?:\/\/|@import|font-face|password\s*[:=]|tel:\+|sms:|DROP TABLE/);
});
