import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { googleDriveConfiguration,beginGoogleOAuth,completeGoogleOAuth,googleDriveStatus,
  disconnectGoogleDrive,syncGoogleDrive,verifyGoogleDrive,openRefreshToken } from '../src/google-drive-v58.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const scope='https://www.googleapis.com/auth/drive.appdata';
const te=new TextEncoder();
const key='ab'.repeat(32);
const now=new Date('2026-11-20T07:00:00Z');

class DB {
  constructor(){this.state=new Map();this.auth=null;this.runs=[];this.writes=[];}
  prepare(sql){
    const db=this;let a=[];
    return {
      bind(...x){a=x;return this;},
      async first(){
        if(sql.startsWith('SELECT code_verifier,expires_ms FROM google_drive_oauth_states'))
          return db.state.get(a[0])||null;
        if(sql.startsWith("SELECT encrypted_refresh FROM google_drive_backup_auth"))
          return db.auth?{encrypted_refresh:db.auth}:null;
        if(sql.startsWith("SELECT id FROM google_drive_backup_auth"))
          return db.auth?{id:'primary'}:null;
        if(sql.startsWith('SELECT object_key,drive_file_id,sha256 FROM google_drive_backup_runs'))
          return db.runs.filter(r=>r.state==='success').at(-1)||null;
        throw Error('Unknown first '+sql);
      },
      async all(){
        if(sql.startsWith('SELECT state,object_key,drive_file_id,detail,created_at FROM google_drive_backup_runs'))
          return {results:db.runs.slice().reverse()};
        throw Error('Unknown all '+sql);
      },
      async run(){
        db.writes.push({sql,args:a});
        if(sql.startsWith('DELETE FROM google_drive_oauth_states WHERE expires_ms')){
          for(const [hash,row] of db.state)if(row.expires_ms<a[0])db.state.delete(hash);
          return {meta:{changes:1}};
        }
        if(sql.startsWith('INSERT INTO google_drive_oauth_states')){
          db.state.set(a[0],{code_verifier:a[1],expires_ms:a[2]});
          return {meta:{changes:1}};
        }
        if(sql.startsWith('DELETE FROM google_drive_oauth_states WHERE state_hash')){
          const found=db.state.delete(a[0]);return {meta:{changes:found?1:0}};
        }
        if(sql.startsWith('INSERT INTO google_drive_backup_auth')){
          db.auth=a[0];return {meta:{changes:1}};
        }
        if(sql.startsWith('DELETE FROM google_drive_backup_auth')){
          db.auth=null;return {meta:{changes:1}};
        }
        if(sql.startsWith('INSERT INTO google_drive_backup_runs')){
          db.runs.push({id:a[0],object_key:a[1],drive_file_id:a[2],sha256:a[3],
            state:a[4],detail:a[5],created_at:'2026-11-20'});
          return {meta:{changes:1}};
        }
        throw Error('Unknown run '+sql);
      }
    };
  }
}
async function sampleArchive(){
  const plain=JSON.stringify({format:'hesaptakip-d1-logical-v57',created_at:now.toISOString(),
    tables:{cards:{schema:'CREATE TABLE cards (id TEXT)',rows:[{id:'secret-financial-card'}]}}});
  const secret=await crypto.subtle.importKey('raw',Uint8Array.from(key.match(/../g),x=>parseInt(x,16)),
    'AES-GCM',false,['encrypt']);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const result=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},secret,te.encode(plain)));
  const b64=b=>Buffer.from(b).toString('base64');
  return JSON.stringify({format:'hesaptakip-d1-aes256gcm-v57',iv:Buffer.from(iv).toString('hex'),
    ciphertext:b64(result)});
}
function mockEnv(){
  const env={DB:new DB(),BACKUP_BUCKET:{get:async()=>null},BACKUP_ENCRYPTION_KEY:key,
    GOOGLE_OAUTH_CLIENT_ID:'123-test.apps.googleusercontent.com',
    GOOGLE_OAUTH_CLIENT_SECRET:'server-only-secret',calls:[],remote:new Map(),nextId:0};
  env.__GOOGLE_TEST_FETCH=async (url,opts)=>{
    env.calls.push({url,method:opts.method||'GET',headers:opts.headers});
    if(url==='https://oauth2.googleapis.com/token'){
      const body=Object.fromEntries(new URLSearchParams(opts.body));
      assert.equal(body.client_id,env.GOOGLE_OAUTH_CLIENT_ID);
      if(body.grant_type==='authorization_code')
        return Response.json({access_token:'test-access',refresh_token:'refresh-token-server-only',
          scope,token_type:'Bearer'});
      if(body.grant_type==='refresh_token')
        return Response.json({access_token:'test-access',token_type:'Bearer'});
      throw Error('Unexpected token grant');
    }
    if(url.startsWith('https://www.googleapis.com/drive/v3/files?')){
      const files=[...env.remote.entries()].map(([id,data])=>({id,name:data.name}));
      return Response.json({files});
    }
    if(url.startsWith('https://www.googleapis.com/upload/drive/v3/files?')){
      const parts=String(opts.body).split('\r\n\r\n');
      const metadata=JSON.parse(parts[1].split('\r\n--')[0]);
      const ciphertext=parts[2].split('\r\n--')[0];
      const id='encrypted_file_'+(++env.nextId);
      env.remote.set(id,{name:metadata.name,content:ciphertext});
      return Response.json({id,name:metadata.name});
    }
    const parsed=new URL(url);
    if(parsed.pathname.startsWith('/drive/v3/files/')){
      const id=decodeURIComponent(parsed.pathname.split('/').pop());
      if(opts.method==='DELETE'){env.remote.delete(id);return new Response(null,{status:204});}
      const item=env.remote.get(id);
      return item?new Response(item.content):new Response('No file',{status:404});
    }
    throw Error('Unexpected Google request '+url);
  };
  return env;
}
async function connect(env){
  const {url}=await beginGoogleOAuth(env,now.getTime());
  const auth=new URL(url);
  assert.equal(auth.origin,'https://accounts.google.com');
  assert.equal(auth.searchParams.get('scope'),scope);
  assert.equal(auth.searchParams.get('access_type'),'offline');
  assert.equal(auth.searchParams.get('code_challenge_method'),'S256');
  const cb='https://hesaptakip.tolgamy.workers.dev/api/google-drive/callback?code=once-only&state='+
    encodeURIComponent(auth.searchParams.get('state'));
  assert.deepEqual(await completeGoogleOAuth(env,cb,now.getTime()+2000),{connected:true});
  return cb;
}
test('feature disabled without Google credentials or existing encrypted R2 binding',async()=>{
  const env=mockEnv();
  delete env.GOOGLE_OAUTH_CLIENT_SECRET;
  assert.equal(googleDriveConfiguration(env).configured,false);
  assert.equal((await syncGoogleDrive(env,now)).status,'disabled');
  assert.equal(env.calls.length,0);
});
test('OAuth code+PKCE: short-lived one-time state and refresh token encrypted at rest',async()=>{
  const env=mockEnv(),cb=await connect(env);
  const stored=env.DB.auth;
  assert.doesNotMatch(stored,/refresh-token-server-only/);
  assert.equal(await openRefreshToken(env,stored),'refresh-token-server-only');
  assert.equal((await googleDriveStatus(env)).connected,true);
  await assert.rejects(completeGoogleOAuth(env,cb,now.getTime()+2000),{status:403});
  assert.equal(env.DB.state.size,0);
  await disconnectGoogleDrive(env);
  assert.equal((await googleDriveStatus(env)).connected,false);
});
test('Google stores only authenticated AES-GCM ciphertext and verifies readback, duplicate sync is idempotent',async()=>{
  const env=mockEnv();
  const cipher=await sampleArchive();
  env.BACKUP_BUCKET.get=async()=>({size:cipher.length,text:async()=>cipher});
  await connect(env);
  const a=await syncGoogleDrive(env,now);
  assert.equal(a.status,'success');
  assert.equal(a.verified,true);
  assert.equal(env.remote.size,1);
  const copied=[...env.remote.values()][0].content;
  assert.equal(copied,cipher);
  assert.doesNotMatch(copied,/secret-financial-card/);
  assert.equal((await syncGoogleDrive(env,now)).status,'already_done');
  assert.equal(env.remote.size,1);
  assert.equal((await verifyGoogleDrive(env)).verified,true);
  assert.equal(env.DB.writes.filter(w=>w.sql.startsWith('INSERT INTO google_drive_backup_runs')).length,2);
});
test('tampered remote Drive content is detected; live financial rows never changed',async()=>{
  const env=mockEnv();
  const cipher=await sampleArchive();
  env.BACKUP_BUCKET.get=async()=>({text:async()=>cipher});
  await connect(env);
  await syncGoogleDrive(env,now);
  const item=env.remote.values().next().value;
  item.content+='tampered';
  await assert.rejects(verifyGoogleDrive(env),{status:502});
  assert.ok(env.DB.writes.every(w=>/google_drive_/.test(w.sql)));
});
test('plaintext R2 backup is rejected before any Google upload',async()=>{
  const env=mockEnv();
  env.BACKUP_BUCKET.get=async()=>({text:async()=>JSON.stringify({format:'plain-text',bank:'private'})});
  await connect(env);
  await assert.rejects(syncGoogleDrive(env,now),{status:400});
  assert.equal(env.remote.size,0);
  assert.equal(env.DB.runs.at(-1).state,'failed');
});
