import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { directorySchema, normalizePhone, nameKey, visitDays } from '../src/directory.js';
import { entityLogoSchema } from '../src/entity-logos.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('public/index.html'),ui=read('public/directory-v17.js'),
  script=read('public/update-v17.js'),logos=read('public/logos-v17.js'),
  worker=read('src/index.js'),settings=read('public/settings-v12.js'),
  css=read('public/directory-v17.css');
const version=JSON.parse(read('public/version.json'));

test('Türkiye +90 phone formatting works for company and representatives',()=>{
 assert.equal(normalizePhone('0532 123 45 67'),'+90 532 123 45 67');
 assert.equal(normalizePhone('905321234567'),'+90 532 123 45 67');
 assert.equal(normalizePhone('+90 (212) 123 45 67'),'+90 212 123 45 67');
 assert.equal(normalizePhone('5321234567'),'+90 532 123 45 67');
 assert.equal(normalizePhone(''),'');
 assert.throws(()=>normalizePhone('1234'));
 assert.throws(()=>normalizePhone('https://bad.com/'));
 assert.equal(nameKey('  ABC   GIDA '),'abc gıda');
 assert.ok(visitDays.includes('Pazartesi'));
 assert.ok(visitDays.includes('Pazar'));
});

test('separate directory schema never alters financial transactions',()=>{
 const all=directorySchema.join(' ');
 for(const table of ['directory_companies','directory_contacts','directory_templates'])assert.match(all,new RegExp(table));
 assert.match(all,/UNIQUE\(company_id,name_key,phone\)/);
 assert.match(all,/name_key TEXT NOT NULL UNIQUE/);
 assert.match(all,/linked_firm_id/);
 assert.doesNotMatch(all,/\bDROP TABLE\b|\bDELETE FROM (?:cards|firm_movements|payments)\b/i);
 assert.match(worker,/directorySchema/);
 assert.match(worker,/directoryRoute\(request,env,path,method\)/);
});

test('directory UX includes Excel preview, template, contacts and WhatsApp Business handoff',()=>{
 for(const id of ['directoryView','dirImportPreview','dirImportRows','dirImportSave','dirDayFilter',
   'dirMessageDialog','dirMessageBody','dirSendWhatsapp','dirSendBusiness','htLogoPanel',
   'htCheckUpdates'])assert.ok(ui.includes(id),id);
 assert.match(ui,/function parseXlsx/);
 assert.match(ui,/new DecompressionStream\('deflate-raw'\)/);
 assert.match(ui,/makeXlsx\(/);
 assert.match(ui,/directory\/import/);
 assert.match(ui,/existing_mode/);
 assert.match(ui,/https:\/\/wa\.me\//);
 assert.match(ui,/whatsapp-business:\/\/send/);
 assert.match(ui,/Mesaj otomatik gönderilmez/);
 assert.match(settings,/case 'directory'/);
 assert.match(html,/data-v18-link="representatives"/);
 assert.match(html,/data-mobile-tab="directory"/);
 assert.match(css,/@media\(max-width:620px\)/);
});

test('all logos can be edited centrally without affecting balances',()=>{
 assert.match(logos,/state\.directory/);
 for(const type of ['firm','account','card','institution','directory']) assert.ok(logos.includes("type:'"+type+"'"),type);
 assert.match(logos,/api\('logos','POST'/);
 assert.match(worker,/logoRoute\(request,env,path,method\)/);
 assert.match(entityLogoSchema.join(' '),/PRIMARY KEY\(target_type,target_id\)/);
});

test('update check only reloads a version that is deployed and does not wipe data',()=>{
 assert.equal(version.version,'v56');
 assert.match(html,/name="ht-build" content="v56"/);
 assert.match(script,/fetch\('\/version\.json\?check='/);
 assert.match(script,/cache:'no-store'/);
 assert.match(script,/serviceWorker\.getRegistration/);
 assert.match(script,/window\.location\.replace/);
 assert.doesNotMatch(script,/api\/(cards|payments|firm-movements).*DELETE/i);
 assert.match(worker,/url\.pathname === '\/version\.json'/);
});
