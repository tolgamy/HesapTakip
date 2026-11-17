'use strict';
// UI V8: reference-inspired presentation powered exclusively by actual HesapTakip state.
// Never writes to D1, never creates sample transactions, never invents account balances.
(function(){
 let accountSection='platforms';
 let cardsSection='credit';
 const platformDomains=new Map([
  ['getir','getir.com'],['trendyol','trendyol.com'],['yemeksepeti','yemeksepeti.com'],
  ['usmar market (.com)','usmarmarket.com'],['usmar market (.com.tr)','usmarmarket.com.tr'],
  ['usmar market','usmarmarket.com'],
  ['getir çarşı','getir.com'],['uber eats','ubereats.com'],
  ['yemeksepeti mahalle','yemeksepeti.com'],
  ['usmar.com','usmarmarket.com'],['usmar.com.tr','usmarmarket.com.tr']
 ]);
 const foodDomains=new Map([
  ['setcard','setcard.com.tr'],['multinet','multinet.com.tr'],['edenred','edenred.com.tr'],
  ['metropolcard','metropolcard.com'],['tokenflex','tokenflex.com.tr'],['pluxee','pluxee.com.tr'],
  ['edenredpos','edenred.com.tr']
 ]);
 const safe=(text)=>esc(String(text??''));
 const storedCards=()=>state.cards||[];
 const allFirms=()=>state.firms||[];
 const moneyTry=(value)=>money(Number(value)||0);
 const firmGroup=(firm)=>firm.receivable_group||'general';
 const firmIs=(firm,group)=>firm.category==='receivable'&&firmGroup(firm)===group;
 const sumOpen=(firms)=>firms.reduce((n,f)=>n+firmBalance(f.id).remaining,0);
 const fallbackIcon=(text)=>safe((String(text||'₺').match(/\p{L}/gu)||[]).slice(0,2).join('').toLocaleUpperCase('tr-TR')||'₺');
 const siteIcon=(name,domain,variant='',customLogo='')=>{
  const base='<span class="v8-account-logo '+variant+'"><span class="v8-logo-text">'+fallbackIcon(name)+'</span>';
  const url=customLogo|| (domain?'https://www.google.com/s2/favicons?domain='+encodeURIComponent(domain)+'&sz=128':'');
  return base+(url?'<img class="v8-brand-image" src="'+safe(url)+'" loading="lazy" alt="">':'')+'</span>';
 };
 function currentMonth(){
  const today=trDate();
  return new Intl.DateTimeFormat('tr-TR',{month:'long',year:'numeric',timeZone:'UTC'})
   .format(new Date(today+'T00:00:00Z'));
 }
 function renderMonthlyChart(){
  const current=trDate().slice(0,7);
  const year=Number(current.slice(0,4)),month=Number(current.slice(5,7));
  const groups=[];
  for(let offset=5;offset>=0;offset--){
   const date=new Date(Date.UTC(year,month-1-offset,1));
   groups.push({id:date.toISOString().slice(0,7),
    name:new Intl.DateTimeFormat('tr-TR',{month:'short',timeZone:'UTC'}).format(date),
    incoming:0,outgoing:0});
  }
  const monthMap=new Map(groups.map(g=>[g.id,g]));
  for(const record of state.entries||[]){
   const group=monthMap.get(record.entry_date?.slice(0,7));
   if(!group)continue;
   if(record.direction==='in')group.incoming+=record.amount_kurus;
   if(record.direction==='out')group.outgoing+=record.amount_kurus;
  }
  const max=Math.max(0,...groups.map(g=>Math.max(g.incoming,g.outgoing)));
  const element=el('v8MonthlyChart');
  if(!max){
   element.innerHTML='<p class="v8-chart-empty">Henüz aylık gelir/gider kaydı yok.</p>';
   element.setAttribute('aria-label','Son altı ayda kaydedilmiş gelir veya gider hareketi bulunmuyor');
   return;
  }
  const pct=(value)=>Math.max(value>0?3:0,Math.round(value/max*100));
  element.setAttribute('aria-label',groups.map(g=>g.name+' giriş '+moneyTry(g.incoming)+
   ', çıkış '+moneyTry(g.outgoing)).join('; '));
  element.innerHTML=groups.map(g=>
   '<div class="v8-chart-group"><div class="v8-chart-bars">'+
   '<div class="v8-chart-bar v8-income" style="height:'+pct(g.incoming)+'%" title="'+
    safe(g.name+' gelir: '+moneyTry(g.incoming))+'"></div>'+
   '<div class="v8-chart-bar v8-expense" style="height:'+pct(g.outgoing)+'%" title="'+
    safe(g.name+' gider: '+moneyTry(g.outgoing))+'"></div>'+
   '</div><small>'+safe(g.name)+'</small></div>').join('');
 }
 function renderLatest(){
  const records=window.computeFinancialOverview(state).recent||[];
  el('v8RecentTransactions').innerHTML=records.length?records.slice(0,5).map(item=>{
   const outgoing=item.note==='Çıkış'||item.kind==='Kart ödemesi'||item.note==='Ödeme / tahsilat'&&item.kind==='Firma';
   const glyph=item.kind==='Kart ödemesi'?'▣':item.kind==='Firma'?'▦':'▤';
   return '<div class="v8-recent-row"><span class="v8-recent-icon '+(outgoing?'v8-out':'')+
     '">'+glyph+'</span><div class="v8-recent-row-content"><strong>'+safe(item.name)+'</strong>'+
    '<small>'+safe(item.kind+' · '+item.note)+'</small></div>'+
    '<div class="v8-recent-money '+(outgoing?'v8-out':'')+'">'+(outgoing?'−':'')+
    safe(moneyTry(item.amount))+'<small>'+safe(showDate(item.date))+'</small></div></div>';
  }).join(''):
  '<div class="v8-chart-empty">Henüz işlem kaydı yok. Kayıt eklediğinde burada görünecek.</div>';
 }
 function renderDashboard(){
  const finances=window.computeFinancialOverview(state);
  const totalDebt=finances.cardDebtTry+finances.firmPayable;
  const totalReceivable=finances.firmReceivable;
  const net=finances.netDebt;
  el('v8MonthLabel').textContent=currentMonth();
  el('v8NetLabel').textContent=net>0?'Net genel borç':net<0?'Net genel alacak':'Net genel durum';
  el('v8NetValue').textContent=moneyTry(Math.abs(net));
  el('v8NetDescription').textContent='Kredi kartları + firma borçları − bütün alacaklar · TL';
  el('v8TotalDebt').textContent=moneyTry(totalDebt);
  el('v8TotalReceivable').textContent=moneyTry(totalReceivable);
  renderMonthlyChart();
  renderLatest();
 }
 function renderMealCards(){
  const meals=allFirms().filter(f=>firmIs(f,'meal'));
  el('v8MealCount').textContent=meals.length+' kayıt';
  el('v8MealAccounts').innerHTML=meals.length?meals.map(f=>{
   const balance=firmBalance(f.id);
   const domain=foodDomains.get(f.name.toLocaleLowerCase('tr-TR'))||'';
   return '<article class="v8-food-account"><button type="button" class="v8-food-visual" data-core-history="'+safe(f.id)+'" aria-label="'+safe(f.name)+' detayları">'+
    '<div class="v8-food-name">'+siteIcon(f.name,domain,'',f.logo_data||'')+'<span>'+safe(f.name)+'</span></div>'+
    '<small>Yemek kartı · Tahsil edilecek bakiye · Detay için dokun</small></button>'+
    '<div class="v8-food-balance"><div><small>Kalan alacak</small><strong>'+moneyTry(balance.remaining)+
    '</strong></div><div><small>Tahsil edilen</small><strong>'+moneyTry(balance.settled)+'</strong></div></div>'+
    '<div class="v8-food-actions"><button type="button" data-core-charge="'+safe(f.id)+
    '">+ Alacak</button><button type="button" data-core-settle="'+safe(f.id)+'"'+
    (balance.remaining<=0?' disabled':'')+'>Tahsilat</button>'+
    '<button type="button" data-v8-open-account="meal" data-v8-firm="'+safe(f.id)+
    '">Hareketler</button>'+
    '<button type="button" data-core-edit="'+safe(f.id)+'">Düzenle</button>'+
    '<button type="button" data-firm-delete="'+safe(f.id)+'">Sil</button></div>'+
    (typeof coreOpenHistoryId!=='undefined'&&coreOpenHistoryId===f.id?'<div class="v10-food-history">'+
      firmMovements(f.id).slice().sort((a,b)=>b.on_date.localeCompare(a.on_date)).map(m=>
       '<div><span>'+safe(showDate(m.on_date))+' · '+(m.kind==='charge'?'Satış':'Tahsilat')+'</span>'+
       '<strong>'+moneyTry(m.amount_kurus)+'</strong>'+
       '<button type="button" data-firm-movement-delete="'+safe(m.id)+'">Sil</button></div>').join('')+
    '</div>':'')+'</article>';
  }).join(''):
  '<div class="v8-chart-empty">Henüz yemek kartı alacağı kaydetmedin. + Yemek kartı alacağı ekle ile başlayabilirsin.</div>';
 }
 function setCardPanel(which){
  cardsSection=which==='meal'?'meal':'credit';
  const isMeal=cardsSection==='meal';
  const panel=el('v8MealPanel');
  const view=el('cardsView');
  panel.hidden=!isMeal;
  view.classList.toggle('v8-meal-active',isMeal);
  document.querySelectorAll('[data-v8-card-panel]').forEach(button=>{
    const on=button.dataset.v8CardPanel===cardsSection;
    button.classList.toggle('active',on);
    button.setAttribute('aria-selected',String(on));
  });
 }
 function renderAccountExplorer(){
  const query=el('v8AccountSearch').value.toLocaleLowerCase('tr-TR').trim();
  let firms,title,openType;
  if(accountSection==='payables'){
   firms=allFirms().filter(f=>f.category==='payable');
   title='Firmalara borçlarım';openType='payables';
  }else if(accountSection==='people'){
   firms=allFirms().filter(f=>firmIs(f,'person'));
   title='Şahıslardan alacaklarım';openType='people';
  }else{
   firms=allFirms().filter(f=>firmIs(f,'platform'));
   title='Platformlardaki param';openType='platforms';
  }
  if(query)firms=firms.filter(f=>
   [f.name,f.note,f.phone].join(' ').toLocaleLowerCase('tr-TR').includes(query));
  el('v8AccountsTitle').textContent=title;
  el('v8AccountsCount').textContent=firms.length+' hesap';
  el('v8AccountsList').innerHTML=firms.length?firms.map(f=>{
   const amount=firmBalance(f.id).remaining;
   const payable=accountSection==='payables';
   const domain=accountSection==='platforms'?platformDomains.get(f.name.toLocaleLowerCase('tr-TR')):'';
   return '<button type="button" class="v8-account-row" data-v8-open-account="'+openType+
    '" data-v8-firm="'+safe(f.id)+'">'+
    siteIcon(f.name,domain,payable?'v8-logo-debt':'',f.logo_data||'')+
    '<span class="v8-account-info"><strong>'+safe(f.name)+'</strong><small>'+
       safe(payable?'Firmaya olan borç':accountSection==='people'?'Şahıstan alacak':
        'Platform hakedişi'+(f.payout_institution_id?
          ' · '+((state.institutions||[]).find(x=>x.id===f.payout_institution_id)?.short_name||'Ödeme kuruluşu'):'') )+
    '</small></span><span class="v8-account-amount '+(payable?'v8-debt':'')+'">'+
    (payable?'−':'')+safe(moneyTry(Math.abs(amount)))+
    '<small>'+safe(amount===0?'Bakiye yok':payable?'Borç':'Alacak')+'</small></span>'+
    '<span class="v8-account-chevron" aria-hidden="true">›</span></button>';
  }).join(''):'<div class="v8-chart-empty">Bu bölümde kayıt bulunmuyor.</div>';
 }
 function setAccountsSection(which){
  accountSection=['platforms','payables','people'].includes(which)?which:'platforms';
  document.querySelectorAll('[data-v8-accounts]').forEach(button=>{
    const on=button.dataset.v8Accounts===accountSection;
    button.classList.toggle('active',on);
    button.setAttribute('aria-selected',String(on));
  });
  renderAccountExplorer();
 }
 function goToAccount(group,firmId){
  if(group==='meal'){
   tab('meal');
  }else{
   tab(group);
  }
  if(firmId){
   coreOpenHistoryId=firmId;
   window.renderCoreMoney();
  }
 }
 const oldCoreMoney=window.renderCoreMoney;
 window.renderCoreMoney=function(){
  if(typeof oldCoreMoney==='function')oldCoreMoney();
  renderMealCards();
  renderAccountExplorer();
 };
 const oldCoreOverview=window.renderCoreOverview;
 window.renderCoreOverview=function(){
  if(typeof oldCoreOverview==='function')oldCoreOverview();
  renderDashboard();
 };
 document.addEventListener('input',e=>{
  if(e.target?.id==='v8AccountSearch')renderAccountExplorer();
 });
 document.addEventListener('click',event=>{
  const nav=event.target.closest('[data-v8-tab]');
  if(nav){tab(nav.dataset.v8Tab);window.scrollTo({top:0,behavior:'auto'});return;}
  const cards=event.target.closest('[data-v8-card-panel]');
  if(cards){setCardPanel(cards.dataset.v8CardPanel);return;}
  const section=event.target.closest('[data-v8-accounts]');
  if(section){setAccountsSection(section.dataset.v8Accounts);return;}
  const link=event.target.closest('[data-v8-open-account]');
  if(link){goToAccount(link.dataset.v8OpenAccount,link.dataset.v8Firm);return;}
  const mealNew=event.target.closest('[data-v8-new-meal]');
  if(mealNew){
   if(currentRole==='viewer'){notice('Salt okunur kullanıcı kayıt ekleyemez.',true);return;}
   window.openFirmForm('new','receivable','meal');return;
  }
  const add=event.target.closest('#v8AccountsAdd');
  if(add){
   if(currentRole==='viewer'){notice('Salt okunur kullanıcı kayıt ekleyemez.',true);return;}
   if(accountSection==='payables')window.openFirmForm('new','payable');
   else window.openFirmForm('new','receivable',accountSection==='platforms'?'platform':'person');
   return;
  }
  const more=event.target.closest('#v8MoreButton');
  if(more){
   const menu=more.closest('.actions'),on=menu.classList.toggle('v8-expanded');
   more.setAttribute('aria-expanded',String(on));return;
  }
  const menu=el('v8MoreButton')?.closest('.actions');
  if(menu&&menu.classList.contains('v8-expanded')&&!event.target.closest('.actions')){
   menu.classList.remove('v8-expanded');
   el('v8MoreButton').setAttribute('aria-expanded','false');
  }
 });
 document.addEventListener('error',event=>{
  const item=event.target;
  if(item instanceof HTMLImageElement&&item.classList.contains('v8-brand-image'))item.remove();
 },true);
 setCardPanel('credit');
 setAccountsSection('platforms');
})();
