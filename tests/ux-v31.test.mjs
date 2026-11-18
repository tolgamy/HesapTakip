import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('V33 representative Ara button is clickable beside search on mobile and desktop',()=>{
 const js=read('public/directory-v17.js');
 const css=read('public/ux-v31.css');
 assert.match(js,/id="dirQuickSearchButton"/);
 assert.match(js,/class="v33-rep-search-row"/);
 assert.match(js,/aria-label="Temsilci aramasını uygula"/);
 assert.match(js,/if\(e\.id==='dirQuickSearchButton'\)\{renderQuickRepresentatives\(\);return;\}/);
 assert.match(js,/if\(e\.target\.id==='dirQuickDayFilter'\)\{renderQuickRepresentatives\(\);return;\}/);
 assert.match(css,/\.v33-rep-search-row\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/);
 assert.match(css,/@media\(max-width:440px\)/);
});

test('V31 representative view has weekday filter next to search on both PC and mobile',()=>{
 const directory=read('public/directory-v17.js'),css=read('public/ux-v31.css');
 assert.match(directory,/id="dirQuickDayFilter"/);
 assert.match(directory,/days\.slice\(1\)\.map\(day=>/);
 assert.match(directory,/const d=directory\(\),query=norm\(el\('dirQuickSearch'\)\?\.value\|\|''\),day=el\('dirQuickDayFilter'\)\?\.value\|\|''/);
 assert.match(directory,/\(!day\|\|\(x\.person\.visit_day\|\|x\.company\.visit_day\)===day\)/);
 assert.match(directory,/if\(e\.target\.id==='dirQuickDayFilter'\)\{renderQuickRepresentatives\(\);return;\}/);
 assert.match(css,/@media\(max-width:740px\)/);
 assert.match(css,/\.v31-rep-filters\{grid-template-columns:1fr/);
});
test('V31 Bankalarım selects only real non-POS bank accounts for cash in/out',()=>{
 const html=read('public/index.html'),core=read('public/core-money.js'),suite=read('public/finance-suite.js'),backend=read('src/finance.js');
 assert.match(html,/id="v31BankFilter"/);
 assert.match(html,/data-v31-bank-entry="in"/);
 assert.match(html,/data-v31-bank-entry="out"/);
 assert.match(core,/const selectedId=accounts\.some\(a=>a\.id===requestedId\)\?requestedId:''/);
 assert.match(core,/a\.type==='bank'&&!posAccountIds\.has\(a\.id\)/);
 assert.match(core,/const visibleAccounts=selectedId\?accounts\.filter\(a=>a\.id===selectedId\):accounts/);
 assert.match(core,/window\.openSuiteForm\?\.\('entry',id,\{direction:button\.dataset\.v31BankEntry\}\)/);
 assert.match(suite,/function openSuiteForm\(type,id='',options=\{\}\)/);
 assert.match(suite,/options\.direction==='out'\?'out':'in'/);
 assert.match(suite,/options\.direction==='out'\?'expense':'income'/);
 assert.match(backend,/if\(\(category==='income'&&direction!=='in'\)\|\|\(category==='expense'&&direction!=='out'\)\)/);
});
test('V31 quick action can create a new company and optional representative atomically',()=>{
 const html=read('public/index.html'),nav=read('public/navigation-v18.js');
 const directory=read('public/directory-v17.js'),backend=read('src/directory.js');
 assert.match(html,/data-v18-quick="firm-create"/);
 assert.match(nav,/case 'firm-create':/);
 assert.match(nav,/window\.HTDirectory\?\.companyForm\?\.\(\)/);
 assert.match(directory,/name="contact_visit_day"/);
 assert.match(directory,/FİRMA İŞ TEMSİLCİSİ/);
 assert.match(directory,/api\('directory\/with-contact','POST'/);
 assert.match(backend,/if\(path==='\/api\/directory\/with-contact' && method==='POST'\)/);
 assert.match(backend,/await env\.DB\.batch\(\[/);
});
test('V32 credential vault copies the username and encrypted password directly',()=>{
 const script=read('public/users-v26.js');
 assert.match(script,/data-v31-copy-user/);
 assert.match(script,/data-v31-copy-user/);
 assert.match(script,/data-v32-password-copy/);
 assert.match(script,/if\(copyUsername&&can\('vault'\)\)/);
 assert.match(script,/await copyVaultText\(record\.login_name\)/);
 assert.match(script,/await api\(endpoint,'POST',\{\}\)/);
 assert.doesNotMatch(read('src/members-v26.js'),/await verifyVaultPin/);
 assert.match(script,/data-v32-field-copy/);
});
test('V31 release files are consistent and addon CSS is linked',()=>{
 const html=read('public/index.html'),version=JSON.parse(read('public/version.json'));
 assert.equal(version.version,'v40');
 assert.match(html,/name="ht-build" content="v40"/);
 assert.match(html,/href="\/ux-v31.css"/);
});
