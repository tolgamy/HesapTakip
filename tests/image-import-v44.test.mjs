import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function loadParser(){
 const registered={};
 const elements=new Map();
 const get=id=>{
  if(!elements.has(id))elements.set(id,{addEventListener(){},removeAttribute(){},setAttribute(){},open:false});
  return elements.get(id);
 };
 const win={HTIdentity:{role:'admin'}};
 const doc={getElementById:get,addEventListener:(type,callback)=>{registered[type]=callback;},head:{appendChild(){}}};
 vm.runInNewContext(read('public/image-import-v44.js'),{document:doc,window:win,URL,Promise,console});
 return {parse:win.HTImage44.parseText,registered};
}

test('V44 browser OCR parser extracts username and password and puts the other image text in Hakkında',()=>{
 const {parse}=loadParser();
 const sample=[
  'USMAR MARKET - SİTE BİLGİLERİ',
  '1. DOMAIN VE HOSTING',
  'Site: www.usmarmarket.com.tr',
  'Domain: Veridyen',
  'Hosting Bitiş: 22.12.2028',
  '2. SİTE ALTYAPISI',
  'OpenCart 3.0.3.2',
  'NETGSM sipariş SMS bildirimi',
  'Admin Panel: https://www.usmarmarket.com.tr/admin/',
  'Kullanıcı Adı: admin',
  'Şifre: OCR-YANLIS-RAKAMLAR'
 ].join('\n');
 const result=parse(sample);
 assert.equal(result.institution_name,'USMAR MARKET');
 assert.equal(result.login_name,'admin');
 assert.equal(result.password,'OCR-YANLIS-RAKAMLAR');
 assert.equal(result.login_url,'https://www.usmarmarket.com.tr/admin/');
 assert.match(result.notes,/Veridyen/);
 assert.match(result.notes,/OpenCart 3\.0\.3\.2/);
 assert.match(result.notes,/NETGSM/);
 assert.doesNotMatch(result.notes,/Kullanıcı Adı: admin/);
 assert.doesNotMatch(result.notes,/OCR-YANLIS-RAKAMLAR/);
});

test('V44 parser handles line breaks after credential field names without guessing other details',()=>{
 const {parse}=loadParser();
 const result=parse('Mağaza Adı: Örnek Market\nKullanıcı adı:\nroot\nŞifre:\nAB123456\nBilgi: 5 adet POS hesabı\n');
 assert.equal(result.institution_name,'Örnek Market');
 assert.equal(result.login_name,'root');
 assert.equal(result.password,'AB123456');
 assert.match(result.notes,/Bilgi: 5 adet POS hesabı/);
 assert.doesNotMatch(result.notes,/AB123456/);
 const noPassword=parse('Örnek firma\n1. DOMAIN VE HOSTING\nDomain Bitiş: 2030');
 assert.equal(noPassword.password,'');
});

test('V44 image import uses a local image, OCR review and explicit save; existing JSON option remains',()=>{
 const html=read('public/index.html'),logic=read('public/image-import-v44.js');
 const vaultUI=read('public/users-v26.js'),css=read('public/vault-v32.css');
 const server=read('src/index.js');
 assert.match(html,/id="v44ImageImport"/);
 assert.match(html,/id="v44ImageFile" accept="image\/\*"/);
 assert.match(html,/id="v44OcrRaw"/);
 assert.match(html,/id="v44OcrApply"/);
 assert.match(html,/image-import-v44\.js\?v=44/);
 assert.match(html,/id="v43VaultImport"/);
 assert.match(html,/name="notes" maxlength="12000"/);
 assert.match(logic,/Tesseract\.createWorker\(\['tur','eng'\]/);
 assert.match(logic,/w\.recognize\(file\)/);
 assert.match(logic,/URL\.createObjectURL\(file\)/);
 assert.match(logic,/if\(!isAdmin\(\)\)return/);
 assert.match(logic,/window\.HTV26\.importImageDraft\(draft\)/);
 assert.doesNotMatch(logic,/(?:fetch\(|XMLHttpRequest|sendBeacon|\.post\(|api\()/);
 assert.match(vaultUI,/function importImageDraft\(/);
 assert.match(vaultUI,/openVault\(\); \/\/ New record only/);
 assert.match(vaultUI,/el\('v44ImageImport'\)\.hidden=true/);
 assert.match(css,/\.v44-ocr-dialog/);
 assert.match(server,/worker-src 'self' blob:/);
 assert.match(server,/script-src 'self' 'wasm-unsafe-eval'/);
 assert.match(server,/connect-src 'self' https:\/\/cdn\.jsdelivr\.net/);
 assert.doesNotMatch(read('public/version.json'),/OCR-YANLIS-RAKAMLAR/);
});
