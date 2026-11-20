import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign, webcrypto } from 'node:crypto';
import { biometricRoute } from '../src/biometric-v56.js';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const hostname='hesaptakip.test';
const origin='https://'+hostname;
const cookie='karttakip_session=v2.admin.candidate.abcdef';
const principal={role:'admin',username:'admin',permissions:[]};
const secret='0123456789abcdef0123456789abcdef';
const b64=b=>Buffer.from(b).toString('base64url');
const hash=b=>createHash('sha256').update(b).digest();
const keyForAccount=async()=>{
  const data=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret+':'+cookie.slice('karttakip_session='.length)));
  return Buffer.from(data).toString('hex');
};
const req=(name,body)=>new Request(origin+'/api/biometric/'+name,{
  method:body===undefined?'GET':'POST',headers:{cookie,origin,'content-type':'application/json'},
  body:body===undefined?undefined:JSON.stringify(body)
});
const cbText=s=>{
  const b=Buffer.from(s);
  if(b.length>255)throw Error('test text too long');
  return Buffer.concat([Buffer.from(b.length<24?[0x60+b.length]:[0x78,b.length]),b]);
};
const cbBytes=b=>{
  if(b.length>65535)throw Error('test bytes too long');
  return Buffer.concat([Buffer.from(b.length<24?[0x40+b.length]:b.length<256?[0x58,b.length]:[0x59,b.length>>8,b.length&255]),b]);
};
const clientData=(kind,challenge,customOrigin=origin)=>Buffer.from(JSON.stringify({type:kind,challenge,origin:customOrigin,crossOrigin:false}));
const publicKeyCose=jwk=>Buffer.concat([
  Buffer.from([0xa5,0x01,0x02,0x03,0x26,0x20,0x01,0x21,0x58,0x20]),
  Buffer.from(jwk.x,'base64url'),
  Buffer.from([0x22,0x58,0x20]),
  Buffer.from(jwk.y,'base64url')
]);
class MemoryDB {
  constructor(){this.creds=[];this.challenges=new Map();this.session={account_key:'admin',locked:0,last_activity_ms:Date.now()};this.pin={salt:'aa',pin_hash:'bb'};}
  prepare(sql) {
    const db=this;
    return {
      args:[],
      bind(...args){this.args=args;return this;},
      async all(){
        if(sql.startsWith('SELECT id,public_key,counter,transports,created_at'))return {results:db.creds.map(c=>({...c}))};
        throw Error('Unexpected all: '+sql);
      },
      async first(){
        const a=this.args;
        if(sql.startsWith('SELECT salt,pin_hash'))return db.pin;
        if(sql.startsWith('SELECT account_key,locked,last_activity_ms'))return db.session;
        if(sql.startsWith('SELECT challenge,expires_ms')){
          const c=db.challenges.get(a[0]);
          return c?.account===a[1]&&c?.kind===a[2]?c:null;
        }
        throw Error('Unexpected first: '+sql);
      },
      async run(){
        const a=this.args;
        if(sql.startsWith('INSERT INTO biometric_challenges')){
          db.challenges.set(a[0],{account:a[1],kind:a[2],challenge:a[3],expires_ms:a[4]});
          return {meta:{changes:1}};
        }
        if(sql.startsWith('DELETE FROM biometric_challenges WHERE session_key')){
          const c=db.challenges.get(a[0]);
          if(c?.account===a[1]&&c?.kind===a[2]&&c?.challenge===a[3]){
            db.challenges.delete(a[0]);return {meta:{changes:1}};
          }
          return {meta:{changes:0}};
        }
        if(sql.startsWith('INSERT OR IGNORE INTO biometric_credentials')){
          if(db.creds.some(c=>c.id===a[0]))return {meta:{changes:0}};
          db.creds.push({id:a[0],account_key:a[1],public_key:a[2],counter:a[3],transports:a[4],created_at:'2026-11-20'});
          return {meta:{changes:1}};
        }
        if(sql.startsWith('UPDATE biometric_credentials SET counter=')){
          const c=db.creds.find(c=>c.id===a[1]&&c.account_key===a[2]&&c.counter===a[3]);
          if(!c)return {meta:{changes:0}};
          c.counter=a[0];return {meta:{changes:1}};
        }
        if(sql.startsWith('INSERT INTO pin_sessions')){
          db.session={account_key:a[1],locked:0,last_activity_ms:a[2]};
          return {meta:{changes:1}};
        }
        throw Error('Unexpected run: '+sql);
      }
    };
  }
}
test('real P-256 WebAuthn registration and signed unlock retain PIN as fallback',async()=>{
  const env={DB:new MemoryDB(),SESSION_SECRET:secret};
  const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const credentialID=randomBytes(16);
  const credID=b64(credentialID);
  const cose=publicKeyCose(publicKey.export({format:'jwk'}));
  const rpHash=hash(hostname);

  const reg=await biometricRoute(req('register/options',{}),env,principal,'/api/biometric/register/options','POST');
  const authDataRegistration=Buffer.concat([
    rpHash,Buffer.from([0x45]),Buffer.alloc(4),Buffer.alloc(16),
    Buffer.from([0,credentialID.length]),credentialID,cose
  ]);
  const attestationObject=Buffer.concat([
    Buffer.from([0xa3]),cbText('fmt'),cbText('none'),cbText('attStmt'),
    Buffer.from([0xa0]),cbText('authData'),cbBytes(authDataRegistration)
  ]);
  const regData=clientData('webauthn.create',reg.challenge);
  const registration={
    id:credID,rawId:credID,type:'public-key',authenticatorAttachment:'platform',
    response:{
      clientDataJSON:b64(regData),attestationObject:b64(attestationObject),
      transports:['internal']
    },clientExtensionResults:{}
  };
  const registered=await biometricRoute(req('register/verify',registration),env,principal,'/api/biometric/register/verify','POST');
  assert.equal(registered.enrolled,true);
  assert.equal(env.DB.creds.length,1);
  assert.equal(env.DB.creds[0].id,credID);

  // PIN lock is set by the existing V55 mechanism; biometrics must unlock THIS cookie.
  env.DB.session.locked=1;
  const options=await biometricRoute(req('auth/options',{}),env,principal,'/api/biometric/auth/options','POST');
  const counter=Buffer.alloc(4);counter.writeUInt32BE(1);
  const authData=Buffer.concat([rpHash,Buffer.from([0x05]),counter]);
  const assertionClientData=clientData('webauthn.get',options.challenge);
  const signature=sign('sha256',Buffer.concat([authData,hash(assertionClientData)]),privateKey);
  const auth={
    id:credID,rawId:credID,type:'public-key',authenticatorAttachment:'platform',
    response:{
      clientDataJSON:b64(assertionClientData),authenticatorData:b64(authData),
      signature:b64(signature),userHandle:null
    },clientExtensionResults:{}
  };
  const unlocked=await biometricRoute(req('auth/verify',auth),env,principal,'/api/biometric/auth/verify','POST');
  assert.deepEqual(unlocked,{ok:true,locked:false});
  assert.equal(env.DB.session.locked,0);
  assert.equal(env.DB.creds[0].counter,1);
  assert.equal(env.DB.challenges.size,0);
  // Stolen/replayed same signature is blocked before touching the PIN gate.
  await assert.rejects(biometricRoute(req('auth/verify',auth),env,principal,'/api/biometric/auth/verify','POST'),{status:401});
  assert.equal(env.DB.creds[0].counter,1);
});
