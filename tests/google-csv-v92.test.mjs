import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {vaultRoute} from '../src/members-v26.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const parserSource=read('public/google-csv-parser-v92.js');
const importer=read('public/google-csv-import-v92.js');
const server=read('src/members-v26.js');
const html=read('public/index.html');
const css=read('public/vault-theme-import-v92.css');
const parser=()=>{
 const win={};
 vm.runInNewContext(parserSource,{window:win});
 return win.HTGoogleCSVParser92;
};
const admin={role:'admin',username:'admin',permissions:['vault']};
const reader={role:'user',permissions:['vault']};
function mockDB(){
 const rows=[];
 const db={async batch(statements){for(const stmt of statements)await stmt.run();},
 prepare(sql){
  let params=[];
  return {bind(...p){params=p;return this;},
   async all(){
    if(sql.startsWith('SELECT institution_name,login_name,login_url,notes FROM vault_credentials'))
     return {results:rows.map(r=>({institution_name:r.institution_name,
      login_name:r.login_name,login_url:r.login_url,notes:r.notes}))};
    if(sql.includes('FROM vault_credentials'))return {results:rows};
    if(sql.includes('FROM vault_custom_fields'))return {results:[]};
    throw new Error('Unexpected query: '+sql);
   },
   async run(){
    if(!sql.startsWith('INSERT INTO vault_credentials'))throw Error('unexpected write');
    const [id,category,institution_name,login_name,login_url,notes,secret_cipher,secret_iv]=params;
    rows.push({id,category,institution_name,login_name,login_url,notes,secret_cipher,secret_iv});
    return {meta:{changes:1}};
   },
   async first(){return null;}
  };
 }};
 return {db,rows};
}
const env=db=>({DB:db,VAULT_ENCRYPTION_KEY:'separate-test-secret-longer-than-thirty-two-characters'});
const post=records=>new Request('https://example.test/api/vault/import-google',{
 method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({records})
});
const row=(institution_name,login_name,source_url,password='test-strong-secret',notes='')=>
 ({institution_name,login_name,source_url,password,notes});

test('Google CSV parser supports BOM, quoted commas, CRLF, newlines, double quotes',()=>{
 const p=parser();
 const csv='\uFEFFname,url,username,password,note\r\n'+
  '"Müşteri, A","https://site.test/login","user@example.test","pa,ss","Line 1\nLine 2"\r\n'+
  '"A ""quoted"" B",android://app,foo,pwd,\r\n';
 const entries=p.parse(csv);
 assert.equal(entries.length,2);
 assert.equal(entries[0].institution_name,'Müşteri, A');
 assert.equal(entries[0].password,'pa,ss');
 assert.equal(entries[0].notes,'Line 1\nLine 2');
 assert.equal(entries[1].institution_name,'A "quoted" B');
 assert.equal(p.sourceType(entries[1].source_url),'Android');
 assert.equal(p.sourceType('http://example.test'),'HTTP');
 assert.equal(p.sourceType(' Oyna'),'Diğer');
 assert.equal(p.identity('İsim','X','url'),p.identity('isim','x','URL'));
 assert.throws(()=>p.parse('name,url,username,password,note\n"a,b'),/kapanmamış tırnak/);
 assert.throws(()=>p.parse('other,columns\nx,y'),/başlıkları/);
});

test('Google CSV secure import keeps same-name distinct user or source and encrypts every secret',async()=>{
 const {db,rows}=mockDB(),e=env(db),endpoint='/api/vault/import-google';
 const payload=[row('Akbank','first','https://a.test','different-1'),
  row('Akbank','second','https://a.test','different-2'),
  row('Akbank','first','https://other.test','different-3'),
  row('Android servis','android-user','android://com.example.app/login','different-4'),
  row('HTTP eski site','web','http://old.test/login','different-5'),
  row('Bilinmeyen adres','u',' Oyna','different-6')];
 const first=await vaultRoute(post(payload),e,endpoint,'POST',admin);
 assert.deepEqual([first.created,first.skipped],[6,0]);
 assert.equal(rows.length,6);
 assert.ok(rows.every(r=>r.secret_cipher&&r.secret_iv));
 assert.ok(!JSON.stringify(rows).includes('different-1'));
 assert.equal(rows.find(r=>r.institution_name==='Android servis').login_url,'');
 assert.match(rows.find(r=>r.institution_name==='Android servis').notes,/Google CSV kaynak adresi: android:/);
 assert.equal(rows.find(r=>r.institution_name==='HTTP eski site').login_url,'');
 assert.equal(rows.find(r=>r.institution_name==='Bilinmeyen adres').login_url,'');
 const repeat=await vaultRoute(post(payload),e,endpoint,'POST',admin);
 assert.deepEqual([repeat.created,repeat.skipped],[0,6]);
 const extra=await vaultRoute(post([
  row('Akbank','third','https://a.test','different-7'),
  row('Akbank','first','https://a.test','duplicate-not-overwritten')]),e,endpoint,'POST',admin);
 assert.deepEqual([extra.created,extra.skipped],[1,1]);
 assert.equal(rows.length,7);
 const listed=await vaultRoute(new Request('https://example.test/api/vault'),e,'/api/vault','GET',reader);
 assert.equal(listed.vault.length,7);
 assert.ok(listed.vault.every(v=>v.has_password));
 assert.ok(!JSON.stringify(listed).includes('different-7'));
});

test('Google import enforces admin only, 50-record batches and atomic validation',async()=>{
 const {db,rows}=mockDB(),e=env(db),endpoint='/api/vault/import-google';
 await assert.rejects(()=>vaultRoute(post([row('A','u','https://a.test')]),
  e,endpoint,'POST',reader),{status:403});
 await assert.rejects(()=>vaultRoute(post([]),e,endpoint,'POST',admin),{status:400});
 await assert.rejects(()=>vaultRoute(post(Array.from({length:51},(_,i)=>
  row('P'+i,'u','https://example.test'))),e,endpoint,'POST',admin),{status:400});
 await assert.rejects(()=>vaultRoute(post([row('Good','u','https://a.test'),
  row('Bad','u','https://a.test','x'.repeat(501))]),e,endpoint,'POST',admin),{status:400});
 assert.equal(rows.length,0);
});

test('UI requires local file preview and explicit checkbox before any upload',()=>{
 assert.match(html,/id="v92GoogleCSVOpen"/);
 assert.match(html,/id="v92GoogleCSVFile"/);
 assert.match(html,/id="v92GoogleCSVDialog"/);
 assert.match(html,/id="v92CsvAgree"/);
 assert.match(html,/id="v92CsvSave"[^>]*disabled/);
 assert.match(importer,/await selected\.text\(\)/);
 assert.match(importer,/parser\.parse\(text\)/);
 assert.match(importer,/agree\.checked/);
 assert.match(importer,/staged\.slice\(processed,processed\+50\)/);
 assert.match(importer,/api\('vault\/import-google','POST'/);
 assert.match(importer,/preview\.replaceChildren\(\)/);
 assert.match(importer,/state\.textContent|state\.dataset/);
 assert.doesNotMatch(importer,/console\.|localStorage|sessionStorage|indexedDB|innerHTML\s*=/);
 assert.doesNotMatch(parserSource,/console\.|localStorage|sessionStorage|indexedDB|fetch\(/);
 assert.match(read('public/users-v26.js'),/v92GoogleCSVOpen'\)\.hidden=!admin\(\)/);
});

test('dark-mode contrast CSS targets only the vault while preserving light theme',()=>{
 for(const marker of [
  '#vaultView .v67-vault-back','#vaultView .v26-vault-card',
  '#vaultView .v32-credential span','#vaultView .v32-credential strong',
  '#vaultView .v32-credential button','#vaultView .v69-vault-toolbar>label',
  '#vaultView .v69-vault-search-row input::placeholder'
 ]) assert.ok(css.includes(marker),marker);
 assert.match(css,/html\[data-ht-theme="dark"\] #vaultView \.v26-vault-card/);
 assert.match(css,/color:#cdddf2!important/);
 assert.match(css,/color:#f6f9ff!important/);
 assert.match(css,/v92-csv-dialog/);
 assert.doesNotMatch(css,/display:none!important/);
 assert.match(html,/vault-theme-import-v92\.css\?v=92/);
 assert.match(html,/google-csv-parser-v92\.js\?v=92/);
 assert.match(html,/google-csv-import-v92\.js\?v=92/);
});
