import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('public/index.html');
const ui=read('public/users-v26.js');
const css=read('public/vault-mobile-v93.css');
const dark=read('public/vault-theme-import-v92.css');
const version=JSON.parse(read('public/version.json'));

test('v93 loads after the previous vault/theme CSS and updated vault JavaScript',()=>{
 assert.equal(version.version,'v94');
 assert.match(html,/name="ht-build" content="v94"/);
 assert.match(html,/\/users-v26\.js\?v=93/);
 assert.match(html,/\/vault-mobile-v93\.css\?v=93/);
 assert.ok(html.indexOf('/vault-mobile-v93.css')>html.indexOf('/vault-theme-import-v92.css'));
 assert.match(dark,/html\[data-ht-theme="dark"\] #vaultView/);
 assert.doesNotThrow(()=>new vm.Script(ui,{filename:'users-v26.js'}));
});

test('mobile credential rows stack label, value and their copy button',()=>{
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(css,/#vaultView \.v32-credential\{/);
 assert.match(css,/flex-direction:column!important/);
 assert.match(css,/align-items:stretch!important/);
 assert.match(css,/#vaultView \.v32-credential>div/);
 assert.match(css,/#vaultView \.v32-credential \.mini-btn/);
 assert.match(css,/align-self:flex-start!important/);
 assert.match(css,/min-height:44px!important/);
 assert.match(css,/overflow-wrap:anywhere/);
 assert.match(css,/@media\(max-width:365px\)/);
});

test('login URL shows a wrapped source plus explicit open and copy controls',()=>{
 assert.match(ui,/class="v93-vault-url"/);
 assert.match(ui,/class="v93-vault-url-label">Giriş adresi/);
 assert.match(ui,/class="v93-vault-url-link"/);
 assert.match(ui,/class="mini-btn v93-vault-url-open"/);
 assert.match(ui,/class="mini-btn v93-vault-url-copy" data-v93-copy-url/);
 assert.match(ui,/rel="noopener noreferrer" target="_blank"/);
 assert.match(ui,/if\(copyUrl&&can\('vault'\)\)/);
 assert.match(ui,/vault\.find\(row=>row\.id===copyUrl\.dataset\.v93CopyUrl\)/);
 assert.match(ui,/await copyVaultText\(record\.login_url\)/);
 assert.match(ui,/notice\('Giriş adresi kopyalandı\.'\)/);
 assert.match(css,/\.v93-vault-url-link/);
 assert.match(css,/word-break:break-word/);
 assert.match(css,/\.v93-vault-url-actions/);
});

test('original password and extra field copy remain unchanged',()=>{
 assert.match(ui,/data-v31-copy-user/);
 assert.match(ui,/data-v32-password-copy/);
 assert.match(ui,/data-v32-field-copy/);
 assert.match(ui,/vault\/'\+recordId\+'\/reveal'/);
 assert.match(ui,/await copyVaultText\(value\)/);
 assert.match(ui,/if\(\(copyPassword\|\|copyField\)&&can\('vault'\)\)/);
 assert.match(ui,/data-v26-edit/);
 assert.match(ui,/data-v26-delete/);
 assert.match(ui,/v43-vault-about/);
 assert.doesNotMatch(css,/\bdisplay\s*:\s*none\s*!important/);
 assert.doesNotMatch(css,/pointer-events\s*:\s*none|visibility\s*:\s*hidden/);
 assert.doesNotMatch(css,/fetch\s*\(|DELETE FROM|DROP TABLE/);
});

test('light and dark mode variants retain readable action buttons and URL links',()=>{
 assert.match(css,/#2252c2!important/);
 assert.match(css,/html\[data-ht-theme="dark"\] #vaultView \.v93-vault-url/);
 assert.match(css,/#a5ccff!important/);
 assert.match(css,/#edf5ff!important/);
 assert.match(css,/#vaultView \.v93-vault-url-actions :is\(button,a\):focus-visible/);
});
