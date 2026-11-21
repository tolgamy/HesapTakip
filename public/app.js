'use strict';
const el = id => document.getElementById(id);
const currency = new Intl.NumberFormat('tr-TR', { style:'currency', currency:'TRY', maximumFractionDigits:2 });
const money = kurus => currency.format((Number(kurus) || 0) / 100);
const cardMoney=(kurus,card)=>{
 const unit=card?.currency||'TRY';
 return unit==='TRY'?money(kurus):new Intl.NumberFormat('tr-TR',{style:'currency',currency:unit,maximumFractionDigits:2}).format((Number(kurus)||0)/100);
};
const esc = text => String(text ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let state = { cards:[], statements:[], payments:[], bills:[], firms:[], firmMovements:[], accounts:[], entries:[], instruments:[], reminders:[], audit:[], institutions:[] };
let currentRole='admin';
window.HTIdentity={role:'admin',permissions:[]};
function applySessionIdentity(session){window.HTIdentity=session;currentRole=session.role==='user'?'viewer':(session.role||'admin');}
let activeTab = 'overview';
let timer;
function trDate() {
 const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/Istanbul', year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return parts.year+'-'+parts.month+'-'+parts.day;
}
function showDate(value){
 const s=String(value||'');
 const m=/^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(s);
 return m?m[3]+'.'+m[2]+'.'+m[1]+(m[4]?' '+m[4].replace(/^[T ]/,'').slice(0,5):''):s;
}
function showMonth(value){
 const m=/^(\d{4})-(\d{2})$/.exec(String(value||''));
 return m?m[2]+'.'+m[1]:String(value||'');
}
function monthNow() { return trDate().slice(0,7); }
function dayDifference(date, today=trDate()) { return Math.round((new Date(date+'T12:00:00Z')-new Date(today+'T12:00:00Z'))/86400000); }
function amountValue(raw) {
 const original=String(raw).trim().replace(/[₺\s\u00a0]/g,'');
 const value=/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(original)?
    original.replace(/\./g,'').replace(',','.'):original.replace(',','.');
 if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Tutarı en fazla iki ondalık basamakla girin.');
 const [major, minor=''] = value.split('.'); const n=Number(major)*100+Number(minor.padEnd(2,'0'));
 if (!Number.isSafeInteger(n) || n<0 || n>100000000000) throw new Error('Tutar geçersiz.'); return n;
}
function summary() {
 const paid={}; for (const p of state.payments) paid[p.statement_id]=(paid[p.statement_id]||0)+p.amount_kurus;
 const list=state.statements.map(s=>({...s,paid:paid[s.id]||0,left:Math.max(0,s.amount_kurus-(paid[s.id]||0)),card:state.cards.find(c=>c.id===s.card_id)}));
 return list;
}
function badge(s) {
 if (!s.left) return {text:'Ödendi',cls:'ok'};
 const days=dayDifference(s.due_date);
 if (days<0) return {text:'Gecikti',cls:'danger'};
 if (days===0) return {text:'Bugün',cls:'danger'};
 if (days<=7) return {text:days+' gün kaldı',cls:'warn'};
 return {text:'Bekliyor',cls:''};
}
async function api(path,method='GET',data) {
 const res=await fetch('/api/'+path,{method,credentials:'same-origin',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined,cache:'no-store'});
 let payload;try{payload=await res.json();}catch{throw new Error('Sunucu yanıtı okunamadı.');}
 if(!res.ok)throw new Error(payload.error || 'İşlem başarısız.');return payload;
}
function notice(message,isError=false) {
 const n=el('alert');n.textContent=message;n.className='notice'+(isError?' error':'');n.hidden=false;clearTimeout(timer);timer=setTimeout(()=>n.hidden=true,5500);
}
function showLogin() { el('appPage').hidden=true;el('loginPage').hidden=false; }
function showApp() {el('loginPage').hidden=true;el('appPage').hidden=false;}
async function load() {
 const [core,firms,finance,audit,brands,directory,logos,catalog,profiles,plans,bills]=await Promise.all([
    api('data'),api('firms'),api('finance'),
    currentRole==='admin'?api('audit').catch(()=>({events:[]})):Promise.resolve({events:[]}),
    api('institutions'),
    window.HTIdentity.role==='user'&&!window.HTIdentity.permissions.includes('directory')?Promise.resolve({companies:[],contacts:[],templates:[]}):api('directory'),
    window.HTIdentity.role==='user'?Promise.resolve({logos:[]}):api('logos'),
    window.HTIdentity.role==='user'?Promise.resolve({catalogPrefs:[]}):api('catalog-prefs'),
    window.HTIdentity.role==='user'&&!window.HTIdentity.permissions.includes('payables')?Promise.resolve({profiles:[]}):api('firm-profiles'),
    window.HTIdentity.role==='user'&&!window.HTIdentity.permissions.includes('banking')?Promise.resolve({plans:[],dues:[]}):api('payment-plans'),
     window.HTIdentity.role==='user'&&!window.HTIdentity.permissions.includes('payables')?Promise.resolve({bills:[]}):api('bills')
  ]);
  state={...core,...firms,...finance,...brands,audit:audit.events,directory,logoEntries:logos.logos,catalogPrefs:catalog.catalogPrefs,
    firmProfiles:profiles.profiles,paymentPlans:plans.plans,planDues:plans.dues,bills:bills.bills};
 renderAll();
 window.HTV26?.afterLoad?.();
 }
function stat(label,value,detail,cls='') {return '<article class="stat"><p class="label">'+esc(label)+'</p><p class="value '+cls+'">'+esc(value)+'</p><p class="foot">'+esc(detail)+'</p></article>';}
function renderOverview() {
 if(window.renderFinanceOverview)return window.renderFinanceOverview();
 const rows=summary(), open=rows.filter(x=>x.left>0),
  local=open.filter(x=>(x.card?.currency||'TRY')==='TRY'),
  overdue=local.filter(x=>dayDifference(x.due_date)<0),
  soon=local.filter(x=>dayDifference(x.due_date)>=0&&dayDifference(x.due_date)<=7);
 const total=local.reduce((sum,s)=>sum+s.left,0), late=overdue.reduce((sum,s)=>sum+s.left,0), next=soon.reduce((sum,s)=>sum+s.left,0);
 el('stats').innerHTML=stat('TOPLAM KALAN BORÇ',money(total),local.length+' TL ekstresi')+stat('7 GÜN İÇİNDE',money(next),soon.length+' yaklaşan ödeme','accent')+stat('GECİKEN BORÇ',money(late),overdue.length+' gecikmiş ekstre','danger')+stat('KAYITLI KART',String(state.cards.length),rows.length+' ekstre kaydı');
 const urgent=open.slice().sort((a,b)=>a.due_date.localeCompare(b.due_date)).slice(0,7);
 el('upcoming').innerHTML=urgent.length?urgent.map(s=>{const b=badge(s);return '<div class="due-row"><div class="due-logo">₺</div><div class="due-desc"><strong>'+esc((s.card?.bank||'Kart')+' · '+(s.card?.nickname||''))+'</strong><small>'+esc(showDate(s.due_date))+' · '+esc(showMonth(s.period))+'</small></div><div class="due-amount">'+cardMoney(s.left,s.card)+'<br><span class="badge '+b.cls+'">'+esc(b.text)+'</span></div></div>';}).join(''):'<div class="empty-state"><strong>Açık ekstre bulunmuyor</strong>Ekstre eklediğinizde burada görünecek.</div>';
 const byCard=state.cards.map(c=>({card:c,total:open.filter(s=>s.card_id===c.id).reduce((a,s)=>a+s.left,0)})).sort((a,b)=>b.total-a.total);
 el('distribution').innerHTML=byCard.length?byCard.map(x=>'<div class="dist-row"><div class="dist-top"><span>'+esc(x.card.bank+' · '+x.card.nickname)+'</span><span>'+cardMoney(x.total,x.card)+'</span></div><p class="dist-sub">'+esc(x.card.owner)+(x.card.last4?' · •••• '+esc(x.card.last4):'')+'</p><div class="bar"><div class="bar-fill" style="width:'+Math.round(total&&(!x.card.currency||x.card.currency==='TRY')?x.total/total*100:0)+'%"></div></div></div>').join(''):'<div class="empty-state"><strong>Henüz kart tanımlanmadı</strong>İlk kartınızı ekleyerek başlayın.</div>';
 for (const bar of document.querySelectorAll('[data-ratio]')) bar.style.width = bar.dataset.ratio + '%';
}
function renderCards() {
 if(window.renderProCards)return window.renderProCards();
 const rows=summary();el('cardList').innerHTML=state.cards.length?state.cards.map(c=>{
 const open=rows.filter(s=>s.card_id===c.id).reduce((sum,s)=>sum+s.left,0);
 return '<article class="card-item"><div class="credit-visual"><div><small>BANKA</small><br><strong>'+esc(c.bank)+'</strong></div><div><small>'+esc(c.nickname)+'</small><br><strong>•••• '+esc(c.last4||'••••')+'</strong></div></div><div class="card-foot"><div><p class="muted">'+esc(c.owner)+'</p><div class="value">'+money(open)+'</div><p class="hint">Kalan borç</p></div><div class="row-actions"><button class="mini-btn" data-edit="card" data-id="'+c.id+'">Düzenle</button><button class="mini-btn delete" data-delete="card" data-id="'+c.id+'">Sil</button></div></div></article>'}).join(''):'<div class="empty-state"><strong>Kart ekleyerek başlayın</strong>Kartın yalnızca adı ve isteğe bağlı son dört hanesi yeterlidir.</div>';
}
function renderStatements() {
 const rows=summary();el('statementRows').innerHTML=rows.length?rows.map(s=>{
 const b=badge(s),name=s.card?esc(s.card.bank+' · '+s.card.nickname):'Silinmiş kart';
 return '<tr><td><strong>'+name+'</strong><br><small>'+esc(s.card?.owner||'')+'</small></td><td>'+esc(showMonth(s.period))+'</td><td>'+esc(showDate(s.due_date))+'</td><td>'+cardMoney(s.amount_kurus,s.card)+'</td><td>'+cardMoney(s.paid,s.card)+'</td><td><strong>'+cardMoney(s.left,s.card)+'</strong></td><td><span class="badge '+b.cls+'">'+esc(b.text)+'</span></td><td><div class="row-actions">'+(s.left?'<button class="mini-btn" data-pay="'+s.id+'">Öde</button>':'')+'<button class="mini-btn" data-edit="statement" data-id="'+s.id+'">Düzenle</button><button class="mini-btn delete" data-delete="statement" data-id="'+s.id+'">Sil</button></div></td></tr>';
 }).join(''):'<tr><td class="empty" colspan="8">Ekstre bulunmuyor. “Ekstre ekle” ile başlayın.</td></tr>';
 el('statementRowsMobile').innerHTML=el('statementRows').innerHTML;
}
function renderPayments() {
 const rows=summary();el('paymentRows').innerHTML=state.payments.length?state.payments.map(p=>{
 const s=rows.find(x=>x.id===p.statement_id),card=s?.card;
 return '<tr><td>'+esc(showDate(p.paid_on))+'</td><td><strong>'+esc(card?card.bank+' · '+card.nickname:'Kart')+'</strong></td><td>'+esc(showMonth(s?.period)||'-')+'</td><td><strong>'+cardMoney(p.amount_kurus,card)+'</strong></td><td>'+esc(p.note||'-')+'</td><td><button class="mini-btn" data-v13-edit-payment="'+p.id+'">Düzenle</button>'+
  '<button class="mini-btn delete" data-delete="payment" data-id="'+p.id+'">Sil</button></td></tr>';
 }).join(''):'<tr><td class="empty" colspan="6">Henüz ödeme kaydı yok.</td></tr>';
 el('paymentRowsMobile').innerHTML=el('paymentRows').innerHTML;
}
function renderAll() {
 renderOverview();renderCards();renderStatements();renderPayments();
 if(window.renderFirms)window.renderFirms();
 if(window.renderSuite)window.renderSuite();
 if(window.renderCoreMoney)window.renderCoreMoney();
 if(window.renderCoreOverview)window.renderCoreOverview();
 if(window.renderSettings)window.renderSettings();
 if(window.renderDirectory)window.renderDirectory();
 if(window.renderFirmActivity)window.renderFirmActivity();
 if(window.renderBills)window.renderBills();
 if(window.renderUniversalLogos)window.renderUniversalLogos();
 document.body.dataset.role=currentRole;
 if(window.renderV60)try{window.renderV60();}catch(error){console.error('V60 panel error',error?.name||'Error');}
}
const tabTitles={bills:['Faturalar','Elektrik, doğalgaz, su, telefon ve internet fatura takibi'],firmactivity:['Firma Hareketleri','Firmaların tüm para giriş, ödeme ve tahsilat hareketleri'],representatives:['Temsilci İletişimi','Temsilciler, arama ve WhatsApp'],directory:['Firma Rehberi','Firma temsilcileri, ziyaret günleri ve WhatsApp'],settings:['Ayarlar','Kurumlar, firmalar, platformlar ve logolar'],vault:['Kullanıcı Hesapları','Banka ve platform giriş bilgileri'],useraccounts:['Üye ve Yetki Yönetimi','Üyelikler, onaylar ve kullanıcı yetkileri'],banking:['Bankalarım','Banka hesaplarım ve bakiyeleri'],
 meal:['Yemek Kartı Alacaklarım','Yemek kartı firmalarındaki hakedişler'],
 platforms:['Platformlardaki Param','Getir, Trendyol, Yemeksepeti ve Usmar Market hakedişlerim'],
 people:['Şahıslardan Alacaklarım','Kişilerden tahsil edilecek paralar'],
 collections:['Hesaplar','Platformlar, firmalar ve şahıslar'],
 overview:['Genel Bakış','Kartlarınızın finansal durumu'],cards:['Kartlarım','Tüm kredi kartlarınız'],statements:['Ekstreler','Dönem borçları ve son ödeme tarihleri'],payments:['Ödemeler','Gerçekleştirdiğiniz ödeme kayıtları'],payables:['Borçlu Olduğumuz Firmalar','Firma borçları ve yaptığımız ödemeler'],receivables:['Alacaklı Olduğumuz Firmalar','Firma alacakları ve tahsilat kayıtları'],calendar:['Ödeme Takvimi','Yaklaşan tüm vadeler'],notifications:['Hatırlatmalar','Otomatik uygulama içi hatırlatmalar'],accounts:['Kasa ve Banka','Nakit ve banka hesapları'],instruments:['Çek ve Senet','Evraklar ve vadeler'],reports:['Gelir ve Gider','Aylık finansal raporlar'],search:['Gelişmiş Arama','Tüm finans kayıtlarında arama'],security:['Yetkiler ve Geçmiş','Rol bazlı erişim ve işlem geçmişi'],backups:['Yedekleme','Özel R2 ve D1 geri yükleme bilgileri'],other:['Diğer','Finans yönetiminin diğer araçları']};
function tab(name){
 const mobile=window.matchMedia('(max-width:620px)').matches;
 if(mobile && (name==='statements'||name==='payments'))name='cards';
 if(!tabTitles[name])return;
 activeTab=name;
 for(const key of Object.keys(tabTitles)){
  const view=el(key+'View');
  if(view)view.hidden=key!==name;
 }
 for(const btn of document.querySelectorAll('[data-tab]'))btn.classList.toggle('active',btn.dataset.tab===name);
 const mainTabs=['overview','cards','banking','collections','payables'];
 const primary=['settings','vault','useraccounts','bills'].includes(name)?'settings':(['meal','platforms','people','receivables','directory','representatives','firmactivity'].includes(name)?'collections':(mainTabs.includes(name)?name:'overview'));
 for(const btn of document.querySelectorAll('[data-mobile-tab]')){
   const active=btn.classList.contains('mobile-chip')?btn.dataset.mobileTab===name:
     btn.dataset.mobileTab===primary;
   btn.classList.toggle('active',active);
   if(active)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');
 }
 el('pageTitle').textContent=tabTitles[name][0];
 el('pageSubtitle').textContent=name==='overview'?'Kredi kartlarım, bankalarım, alacaklarım ve borçlarım':tabTitles[name][1];
 el('addAction').textContent=name==='overview'||name==='collections'?'+ Yeni kayıt':
   name==='cards'?'+ Yeni kredi kartı':name==='banking'?'+ Banka hesabı':
   name==='meal'?'+ Yemek kartı alacağı':name==='platforms'?'+ Platform alacağı':name==='people'?'+ Şahıs alacağı':name==='payments'?'+ Yeni ödeme':
   name==='payables'||name==='receivables'||name==='directory'?'+ Yeni firma':
   name==='accounts'?'+ Yeni hesap':name==='bills'?'+ Fatura ekle':name==='instruments'?'+ Yeni çek/senet':'+ Yeni ekstre';
 const canAdd=['cards','payables','banking','meal','platforms','people','collections','overview','directory','bills'].includes(name);
 el('addAction').hidden=currentRole==='viewer'||!canAdd;
}
function field(label,name,type='text',value='',extra=''){return '<div><label for="f-'+name+'">'+label+'</label><input id="f-'+name+'" name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+extra+(name==='last4'?'':' required')+'></div>';}
function selectField(label,name,options,selected=''){return '<div><label for="f-'+name+'">'+label+'</label><select id="f-'+name+'" name="'+name+'" required>'+options.map(o=>'<option value="'+esc(o.value)+'" '+(o.value===selected?'selected':'')+'>'+esc(o.text)+'</option>').join('')+'</select></div>';}
function modal(type,recordId=''){
 if(type==='card'&&window.openProCardForm)return window.openProCardForm(recordId);
 const card=state.cards.find(x=>x.id===recordId),stmt=state.statements.find(x=>x.id===recordId),sums=summary();let contents='',title='',action='';
 if(type==='card') {title=card?'Kart düzenle':'Yeni kart';action=card?'edit-card':'create-card';contents=field('Kart sahibi','owner','text',card?.owner||'','maxlength="70"')+field('Banka','bank','text',card?.bank||'','maxlength="70"')+field('Kart adı / takma ad','nickname','text',card?.nickname||'','maxlength="70"')+field('Kartın son 4 hanesi (isteğe bağlı)','last4','text',card?.last4||'','maxlength="4" pattern="[0-9]{4}"');}
 else if(type==='statement') {if(!state.cards.length){notice('Önce bir kart ekleyin.',true);tab('cards');return;}title=stmt?'Ekstre düzenle':'Yeni ekstre';action=stmt?'edit-statement':'create-statement';contents=selectField('Kart','card_id',state.cards.map(c=>({value:c.id,text:c.bank+' · '+c.nickname+' · '+c.owner})),stmt?.card_id||recordId)+field('Ekstre dönemi','period','month',stmt?.period||monthNow())+field('Ekstre tutarı (₺)','amount','number',stmt?(stmt.amount_kurus/100).toFixed(2):'','min="0" step="0.01"')+field('Son ödeme tarihi','due_date','date',stmt?.due_date||trDate())+'<div><label for="f-note">Not (isteğe bağlı)</label><textarea id="f-note" name="note" maxlength="280">'+esc(stmt?.note||'')+'</textarea></div>';}
 else if(type==='payment') {const choices=sums.filter(s=>s.left>0);if(!choices.length){notice('Ödeme eklemek için kalan borcu olan bir ekstre gerekli.',true);return;}title='Ödeme kaydet';action='create-payment';contents=selectField('Ödenecek ekstre','statement_id',choices.map(s=>({value:s.id,text:(s.card?.bank||'Kart')+' · '+s.period+' · kalan '+money(s.left)})),recordId)+field('Ödeme tutarı (₺)','amount','number','','min="0.01" step="0.01"')+field('Ödeme tarihi','paid_on','date',trDate())+'<div><label for="f-note">Açıklama</label><textarea id="f-note" name="note" maxlength="280" placeholder="İsteğe bağlı"></textarea></div>';}
 else return;
 el('modalTitle').textContent=title;el('modalContents').innerHTML='<form id="recordForm" class="modal-form" data-action="'+action+'" data-id="'+esc(recordId)+'">'+contents+'<div class="form-actions"><button class="btn subtle" type="button" id="cancelForm">Vazgeç</button><button class="btn primary" type="submit">Kaydet</button></div></form>';
 el('cancelForm').addEventListener('click',()=>el('modal').close());el('recordForm').addEventListener('submit',submitForm);el('modal').showModal();
}
async function submitForm(e){e.preventDefault();const form=e.currentTarget,action=form.dataset.action,id=form.dataset.id,d=Object.fromEntries(new FormData(form));const btn=form.querySelector('[type=submit]');btn.disabled=true;const oldIds=action==='create-payment'?new Set((state.payments||[]).map(p=>p.id)):null;
 try{let path,method='POST',body; if(action.endsWith('card')){path='cards'+(action==='edit-card'?'/'+id:'');method=action==='edit-card'?'PATCH':'POST';body={owner:d.owner,bank:d.bank,nickname:d.nickname,last4:d.last4||null};}
 else if(action.endsWith('statement')){path='statements'+(action==='edit-statement'?'/'+id:'');method=action==='edit-statement'?'PATCH':'POST';body={card_id:d.card_id,period:d.period,amount_kurus:amountValue(d.amount),due_date:d.due_date,note:d.note||''};}
 else {path='payments';body={statement_id:d.statement_id,amount_kurus:amountValue(d.amount),paid_on:d.paid_on,note:d.note||''};}
 if(window.HTV60&&!window.HTV60.duplicateWarning(action,body,id)){return;}
 await api(path,method,body);el('modal').close();await load();
 if(oldIds){const created=(state.payments||[]).find(x=>!oldIds.has(x.id)&&x.statement_id===body.statement_id&&
  Number(x.amount_kurus)===Number(body.amount_kurus)&&x.paid_on===body.paid_on);
  if(created){window.HTV60Undo={kind:'payment',id:created.id,amount:Number(created.amount_kurus)};
    window.HTV60?.render();}
 }
 notice('Kayıt başarıyla kaydedildi.');}
 catch(err){notice(err.message,true);}finally{btn.disabled=false;}}
async function deleteRecord(type,id){const labels={card:'kartı',statement:'ekstreyi',payment:'ödemeyi'};if(!confirm('Bu '+labels[type]+' silmek istediğinize emin misiniz?'))return;try{await api(({card:'cards',statement:'statements',payment:'payments'})[type]+'/'+id,'DELETE');await load();notice('Kayıt silindi.');}catch(e){notice(e.message,true);}}
function exportData(){notice('PDF veya Excel raporunu Kontrol Merkezi bölümünden indirin.');}
async function start(){try{const session=await api('session');if(session.authenticated){applySessionIdentity(session);await window.HTPin.enter(session,async()=>{showApp();await load();});}else showLogin();}catch(e){showLogin();el('loginError').textContent=e.message;el('loginError').hidden=false;}}
el('loginForm').addEventListener('submit',async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button');button.disabled=true;el('loginError').hidden=true;try{await api('login','POST',{username:el('v26Username').value,password:el('password').value});const session=await api('session');applySessionIdentity(session);el('password').value='';await window.HTPin.enter(session,async()=>{showApp();await load();});}catch(err){el('loginError').textContent=err.message;el('loginError').hidden=false;}finally{button.disabled=false;}});
el('logout').addEventListener('click',async()=>{try{await api('logout','POST');}finally{window.HTV60Undo=null;state={cards:[],statements:[],payments:[],bills:[],firms:[],firmMovements:[],accounts:[],entries:[],instruments:[],reminders:[],audit:[]};currentRole='admin';window.HTIdentity={role:'admin',permissions:[]};showLogin();}});
el('nav').addEventListener('click',e=>{const btn=e.target.closest('[data-tab]');if(btn)tab(btn.dataset.tab);});
document.addEventListener('click',e=>{const button=e.target.closest('[data-open],[data-edit],[data-delete],[data-pay],[data-goto]');if(!button)return;if(button.dataset.open)modal(button.dataset.open);else if(button.dataset.edit)modal(button.dataset.edit,button.dataset.id);else if(button.dataset.pay)modal('payment',button.dataset.pay);else if(button.dataset.delete)deleteRecord(button.dataset.delete,button.dataset.id);else if(button.dataset.goto)tab(button.dataset.goto);});
el('addAction').addEventListener('click',()=>{
 if(currentRole!=='viewer')el('quickDialog').showModal();
});
document.addEventListener('click',event=>{
 const nav=event.target.closest('[data-mobile-tab]');
 if(nav){
   tab(nav.dataset.mobileTab);
   window.scrollTo({top:0,behavior:'auto'});
   return;
 }
 const quick=event.target.closest('[data-quick-action]');
 if(!quick)return;
 if(currentRole==='viewer')return;
 const action=quick.dataset.quickAction;
 el('quickDialog').close();
 if(action==='card'||action==='statement'||action==='payment')modal(action);
 else if(action==='payable'){tab('payables');window.openSupplierPurchaseForm();}
 else if(action==='meal'||action==='platform'){
   tab(action==='meal'?'meal':'platforms');
   const target=el(action==='meal'?'v9MealInline':'v9PlatformInline');
   target?.scrollIntoView({behavior:'smooth',block:'start'});
 }
 else if(action==='person'){tab('people');window.openFirmForm('new','receivable','person');}
 else if(action==='bank'){tab('banking');}
});
el('closeQuickDialog').addEventListener('click',()=>el('quickDialog').close());
el('logoutMobile').addEventListener('click',()=>el('logout').click());
el('exportBtn')?.addEventListener('click',()=>{const center=el('v60Center');if(center){tab('overview');center.open=true;center.scrollIntoView({behavior:'smooth'});}});
el('closeModal').addEventListener('click',()=>el('modal').close());
start();
