import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('V30: production Cloudflare WebCrypto PBKDF2 iteration cap is respected',()=>{
 const paths=['src/vault-pin-v28.js','src/members-v26.js'];
 for(const path of paths){
  const source=read(path);
  const values=[...source.matchAll(/iterations\s*:\s*(\d+)/g)].map(m=>Number(m[1]));
  assert.ok(values.length>=1,path+' must declare a PBKDF2 work factor');
  for(const count of values){
   assert.ok(count>=10000 && count<=100000,path+': PBKDF2 '+count+' exceeds Cloudflare Workers 100k hard cap');
  }
 }
});

test('V30: short PINs are peppered and online guesses are rate limited',()=>{
 const source=read('src/vault-pin-v28.js');
 assert.match(source,/pin\+': '\+env\.VAULT_ENCRYPTION_KEY|pin\+':'\+env\.VAULT_ENCRYPTION_KEY/);
 assert.match(source,/salt:fromHex\(salt\)/);
 assert.match(source,/count>=5\?now\+900000:0/);
 assert.match(source,/validatePin\(pin\)/);
});

test('V30: release and UI are the same build',()=>{
 assert.match(read('public/index.html'),/name="ht-build" content="v31"/);
 assert.equal(JSON.parse(read('public/version.json')).version,'v31');
});
