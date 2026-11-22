import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('public/index.html');
const ui=read('public/personal-contacts-v87.js');
const chooser=read('public/whatsapp-choice-v90.js');
const css=read('public/whatsapp-choice-v90.css');

function harness(role='admin'){
 const callbacks={},attrs={};
 const normal={href:'#'},business={href:'#'},fallback={href:'#'},person={textContent:''},notice={textContent:''};
 const dialog={
  open:false,showModal(){this.open=true;},close(){this.open=false;},
  addEventListener(type,fn){callbacks['dialog.'+type]=fn},
  removeAttribute(name){if(name==='open')this.open=false},
  setAttribute(name){if(name==='open')this.open=true}
 };
 const btn=(id)=>({addEventListener(type,fn){callbacks[id+'.'+type]=fn}});
 const nodes={
  v90WhatsAppDialog:dialog,
  v90WhatsAppPerson:person,v90WhatsAppRegular:normal,
  v90WhatsAppBusiness:business,v90WhatsAppFallback:fallback,
  v87ContactsNotice:notice,v90WhatsAppClose:btn('close'),
  v90WhatsAppCancel:btn('cancel')
 };
 const document={
  getElementById:id=>nodes[id]||null,
  addEventListener(type,fn){callbacks['document.'+type]=fn}
 };
 const window={HTIdentity:{role}};
 vm.runInNewContext(chooser,{document,window});
 return {links:window.HTWhatsAppV90,dialog,normal,business,fallback,
  person,notice,callbacks,attrs,window};
}

test('WhatsApp replaces SMS envelope only in personal directory',()=>{
 assert.match(ui,/message\.type='button'/);
 assert.match(ui,/message\.className='v89-message v90-whatsapp-button'/);
 assert.match(ui,/message\.dataset\.v90Phone=c\.phone/);
 assert.match(ui,/createElementNS\('http:\/\/www\.w3\.org\/2000\/svg','svg'\)/);
 assert.doesNotMatch(ui,/message\.href=safe\?'sms:'\+safe:'#'/);
 assert.match(ui,/call\.href=safe\?'tel:'\+safe:'#'/);
 assert.match(html,/id="v90WhatsAppDialog"/);
 assert.match(html,/id="v90WhatsAppRegular"/);
 assert.match(html,/id="v90WhatsAppBusiness"/);
 assert.match(html,/id="v90WhatsAppFallback"/);
 assert.match(html,/whatsapp-choice-v90\.js\?v=90/);
 assert.match(html,/whatsapp-choice-v90\.css\?v=90/);
 assert.match(css,/\.v90-whatsapp-button/);
 assert.match(css,/#168757/);
 assert.match(css,/::backdrop/);
});

test('International number conversion never guesses a recipient on bad data',()=>{
 const {links}=harness();
 assert.equal(links.normalizePhone('+90 (555) 123 45 67'),'905551234567');
 assert.equal(links.normalizePhone('0555 123 45 67'),'905551234567');
 assert.equal(links.normalizePhone('555 123 45 67'),'905551234567');
 assert.equal(links.normalizePhone('0090 555 123 45 67'),'905551234567');
 assert.equal(links.normalizePhone('+44 7700 900123'),'447700900123');
 assert.equal(links.normalizePhone(''), '');
 assert.equal(links.normalizePhone('abc'), '');
 assert.equal(links.normalizePhone('1234'), '');
 assert.equal(links.normalizePhone('00123'), '');
});

test('Tapping the icon opens a choice, and each option has a distinct URL',()=>{
 const h=harness();
 let prevented=false;
 h.callbacks['document.click']({
  target:{closest:s=>s==='[data-v90-whatsapp]'?{
   dataset:{v90Phone:'0555 123 45 67',v90Name:'Örnek Kişi'}
  }:null},
  preventDefault(){prevented=true}
 });
 assert.equal(prevented,true);
 assert.equal(h.dialog.open,true);
 assert.equal(h.person.textContent,'Örnek Kişi');
 assert.equal(h.normal.href,'whatsapp://send?phone=905551234567');
 assert.equal(h.business.href,'whatsapp-business://send?phone=905551234567');
 assert.equal(h.fallback.href,'https://wa.me/905551234567');
 h.callbacks['cancel.click']();
 assert.equal(h.dialog.open,false);
});

test('Non-admin cannot open conversation and invalid number never leaves site',()=>{
 const user=harness('user');
 user.callbacks['document.click']({
  target:{closest:()=>({dataset:{v90Phone:'0555 123 45 67',v90Name:'A'}})},
  preventDefault(){}
 });
 assert.equal(user.dialog.open,false);
 const admin=harness('admin');
 admin.callbacks['document.click']({
  target:{closest:()=>({dataset:{v90Phone:'000',v90Name:'A'}})},
  preventDefault(){}
 });
 assert.equal(admin.dialog.open,false);
 assert.match(admin.notice.textContent,/ülke koduyla/);
});

test('Chooser has user-initiated app links and never sends an automatic message',()=>{
 assert.match(chooser,/document\.addEventListener\('click',event=>/);
 assert.match(chooser,/window\.HTWhatsAppV90=\{normalizePhone,linksForPhone\}/);
 assert.match(chooser,/dialog\.showModal\(\)/);
 assert.match(chooser,/document\.addEventListener\('ht:logout',closeDialog\)/);
 assert.doesNotMatch(chooser,/\bfetch\s*\(/);
 assert.doesNotMatch(chooser,/XMLHttpRequest|localStorage|DELETE FROM|sendMessage|postMessage/);
 assert.match(html,/Mesaj otomatik gönderilmez\./);
});
