'use strict';
// V7 simple money dashboard: no historical record is deleted or silently reclassified.
const coreFirmLogo=f=>{const logo=window.HTEntityLogo?.('firm',f.id,f.logo_data)||f.logo_data;return logo?'<img class="core-v17-account-logo" src="'+esc(logo)+'" alt="">':'';};
const coreAccountLogo=id=>{const logo=window.HTEntityLogo?.('account',id);return logo?'<img class="core-v17-account-logo" src="'+esc(logo)+'" alt="">':'';};
const coreGroups={
 meal:{title:'Yemek Kartı Alacaklarım',list:'coreMealList',stats:'coreMealStats',presets:'coreMealPresets',
   brands:[['Setcard','setcard.com.tr'],['Multinet','multinet.com.tr'],['Edenred','edenred.com.tr'],
      ['Metropolcard','metropolcard.com'],['Tokenflex','tokenflex.com.tr'],['Pluxee','pluxee.com.tr']]},
 platform:{title:'Platformlardaki Param',list:'corePlatformList',stats:'corePlatformStats',presets:'corePlatformPresets',
   brands:[['Getir','getir.com'],['Trendyol','trendyol.com'],['Yemeksepeti','yemeksepeti.com'],
      ['Usmar Market (.com)','usmarmarket.com'],['Usmar Market (.com.tr)','usmarmarket.com.tr']]},
 veresiye:{title:'Veresiye Alacaklarım',list:'coreVeresiyeList',stats:'coreVeresiyeStats'},
 person:{title:'Şahıslardan Alacaklarım',list:'corePeopleList',stats:'corePeopleStats'},
 pos:{title:'POS günlük ciroları',list:'corePosList',stats:'corePosStats'}
};
let coreOpenHistoryId='';
const receivableGroup=f=>f.receivable_group||'general';
const groupFirms=group=>(state.firms||[]).filter(f=>f.category==='receivable'&&receivableGroup(f)===group);
const totalOpen=items=>items.reduce((sum,f)=>sum+firmBalance(f.id).remaining,0);
function corePresetMarkup(group){
 const def=coreGroups[group];
 return (def.brands||[]).filter(([name])=>
  !window.HTCatalog21||window.HTCatalog21.isNameAllowed(group,name)).map(([name,domain])=>
   '<button type="button" class="core-preset" data-core-preset="'+group+'" data-core-name="'+esc(name)+'">'+
   '<img class="core-preset-logo" loading="lazy" alt="" src="https://www.google.com/s2/favicons?domain='+encodeURIComponent(domain)+'&sz=128">'+
   '<strong>'+esc(name)+'</strong></button>').join('');
}
function coreFirmList(group,only=[]){
 const firms=only.length?only:groupFirms(group);
 return firms.length?firms.map(f=>{
  const total=firmBalance(f.id),open=total.remaining,history=coreOpenHistoryId===f.id;
  const moves=firmMovements(f.id).slice().sort((a,b)=>b.on_date.localeCompare(a.on_date));
  const nextDue=moves.filter(m=>m.kind==='charge'&&m.due_date)
    .sort((a,b)=>a.due_date.localeCompare(b.due_date))[0];
  const destination=(state.institutions||[]).find(i=>i.id===f.payout_institution_id);
  const dueLabel=f.category==='payable'?'Ödeme vadesi':'Beklenen ödeme';
  return '<article class="core-ledger-card"><div class="core-ledger-heading"><div>'+
   '<button type="button" class="v10-record-open" data-core-history="'+esc(f.id)+'"><h3>'+coreFirmLogo(f)+esc(f.name)+'</h3></button>'+
   '<small>'+(group==='platform'?'Platform hakedişi':group==='meal'?'Yemek kartı hakedişi':group==='person'?'Şahıstan alacak':group==='veresiye'?'Veresiye alacağı':group==='pos'?'POS günlük cirosu':'Önceki alacak')+
    '</small></div><strong class="core-amount">'+money(open)+'</strong></div>'+
   '<div class="core-ledger-facts"><div>Toplam alacak <strong>'+money(total.charges)+'</strong></div>'+
   '<div>Tahsil edilen <strong>'+money(total.settled)+'</strong></div></div>'+
   (nextDue||destination?'<div class="v14-expected-meta">'+
     (nextDue?'<span>'+dueLabel+': <strong>'+esc(showDate(nextDue.due_date))+'</strong></span>':'')+
     (destination?'<span>Paranın geleceği kuruluş: <strong>'+esc(destination.name)+'</strong></span>':'')+
    '</div>':'')+
   '<div class="row-actions core-ledger-actions">'+
    '<button type="button" class="mini-btn" data-core-charge="'+esc(f.id)+'">'+(group==='pos'?'+ POS Cirosu':'+ Alacak')+'</button>'+
    '<button type="button" class="mini-btn" data-core-settle="'+esc(f.id)+'"'+(open<=0?' disabled':'')+'>Tahsilat / Ödeme Geldi</button>'+
    '<button type="button" class="mini-btn" data-core-history="'+esc(f.id)+'">Hareketler</button>'+
    (group==='person'?'<button type="button" class="mini-btn v22-person-whatsapp" data-v22-person-whatsapp="'+esc(f.id)+'">WhatsApp Borç Mesajı</button>':'')+
    '<button type="button" class="mini-btn" data-core-edit="'+esc(f.id)+'">Düzenle</button>'+
    '<button type="button" class="mini-btn delete" data-firm-delete="'+esc(f.id)+'">Sil</button></div>'+
   (history?'<div class="core-history">'+(moves.length?moves.map(m=>
     '<div><span>'+esc(showDate(m.on_date))+' · '+(m.kind==='charge'?'Alacak':'Tahsilat')+'</span>'+
     '<strong>'+money(m.amount_kurus)+'</strong>'+
      '<button type="button" class="v13-small-edit" data-firm-movement-edit="'+esc(m.id)+'">Düzenle</button>'+
      '<button type="button" class="v10-small-delete" data-firm-movement-delete="'+esc(m.id)+'" aria-label="Bu hareketi sil">Sil</button></div>').join(''):
      '<p class="muted">Bu hesapta henüz hareket yok.</p>')+
    '<button type="button" class="text-btn" data-core-export="'+esc(f.id)+'">Excel cari ekstresi</button></div>':'')+
  '</article>';
 }).join(''):'<div class="core-empty"><strong>Henüz kayıt yok</strong><p>Yukarıdan bir kurum seç veya yeni alacak oluştur.</p></div>';
}
function renderCoreMoney(){
 for(const [group,def] of Object.entries(coreGroups)){
  const firms=groupFirms(group),sum=totalOpen(firms);
  el(def.stats).innerHTML=stat('TOPLAM ALACAK',money(sum),firms.length+' kayıt','accent')+
    stat('KAYITLI HESAP',String(firms.length),'İlgili kuruluşlar / kişiler');
  el(def.list).innerHTML=coreFirmList(group);
  if(def.presets)el(def.presets).innerHTML=corePresetMarkup(group);
 }
 const old=groupFirms('general');
 el('coreLegacyReceivables').hidden=!old.length;
 el('coreLegacyList').innerHTML=coreFirmList('general',old);
 const cashAccounts=(state.accounts||[]).filter(a=>a.type==='cash');
 el('coreCashStats').innerHTML=stat('NAKİT KASA TOPLAMI',
   money(cashAccounts.reduce((n,a)=>n+currentBalance(a.id),0)),cashAccounts.length+' kasa','accent');
 el('coreCashList').innerHTML=cashAccounts.length?cashAccounts.map(a=>
  '<article class="core-ledger-card"><div class="core-ledger-heading"><div><h3>'+coreAccountLogo(a.id)+esc(a.name)+
  '</h3><small>Nakit kasa</small></div><strong class="core-amount">'+money(currentBalance(a.id))+
  '</strong></div><div class="row-actions core-ledger-actions">'+
   '<button type="button" class="mini-btn" data-v10-cash-sale="'+esc(a.id)+'">+ Nakit satış</button>'+
   '<button type="button" class="mini-btn" data-suite-account-entry="'+esc(a.id)+'">Giriş / Çıkış</button>'+
   '<button type="button" class="mini-btn" data-core-bank-moves="'+esc(a.id)+'">Hareketler</button>'+
   '<button type="button" class="mini-btn" data-v10-account-edit="'+esc(a.id)+'">Düzenle</button>'+
   '<button type="button" class="mini-btn delete" data-v10-account-remove="'+esc(a.id)+'">Sil</button></div>'+
   (coreOpenHistoryId===a.id?'<div class="core-history">'+
     (state.entries||[]).filter(e=>e.account_id===a.id).sort((a,b)=>b.entry_date.localeCompare(a.entry_date))
      .map(e=>'<div><span>'+esc(showDate(e.entry_date))+' · '+(e.direction==='in'?'Giriş':'Çıkış')+
      '</span><strong>'+money(e.amount_kurus)+'</strong>'+
      '<button type="button" class="v13-small-edit" data-suite-edit-entry="'+esc(e.id)+'">Düzenle</button>'+
      '<button type="button" class="v10-small-delete" data-suite-delete-entry="'+esc(e.id)+'">Sil</button></div>').join('')+
   '</div>':'')+'</article>').join(''):
  '<div class="core-empty"><strong>Henüz kasa tanımlanmamış.</strong>'+
   '<p>Kasa açarak nakit satışları günlük girebilirsin.</p></div>';
 const accounts=(state.accounts||[]).filter(a=>a.type==='bank');
 const movements=state.entries||[];
 const balance=accounts.reduce((sum,a)=>sum+currentBalance(a.id),0);
 el('coreBankStats').innerHTML=stat('BANKALARDAKİ PARA',money(balance),accounts.length+' banka hesabı','accent')+
  stat('BANKA HESAPLARI',String(accounts.length),'Manuel takip edilir');
 el('coreBankList').innerHTML=accounts.length?accounts.map(a=>
  '<article class="core-ledger-card"><div class="core-ledger-heading"><div><h3>'+coreAccountLogo(a.id)+esc(a.name)+'</h3>'+
  '<small>Banka hesabı</small></div><strong class="core-amount">'+money(currentBalance(a.id))+'</strong></div>'+
  '<p class="muted">'+esc(a.note||'')+'</p>'+
  '<div class="row-actions core-ledger-actions"><button type="button" class="mini-btn" data-suite-account-entry="'+esc(a.id)+'">Para girişi / çıkışı</button>'+
  '<button type="button" class="mini-btn" data-core-bank-moves="'+esc(a.id)+'">Hareketler</button>'+
  '<button type="button" class="mini-btn" data-v10-account-edit="'+esc(a.id)+'">Düzenle</button>'+
  '<button type="button" class="mini-btn delete" data-v10-account-remove="'+esc(a.id)+'">Sil</button></div>'+
  (coreOpenHistoryId===a.id?'<div class="core-history">'+movements.filter(e=>e.account_id===a.id)
    .sort((a,b)=>b.entry_date.localeCompare(a.entry_date)).map(e=>'<div><span>'+esc(showDate(e.entry_date))+
     ' · '+(e.direction==='in'?'Giriş':'Çıkış')+'</span><strong>'+money(e.amount_kurus)+
     '</strong><button type="button" class="v13-small-edit" data-suite-edit-entry="'+esc(e.id)+'">Düzenle</button>'+
     '<button type="button" class="v10-small-delete" data-suite-delete-entry="'+esc(e.id)+'">Sil</button></div>').join('')+
     '</div>':'')+'</article>').join(''):
    '<div class="core-empty"><strong>Henüz banka hesabı eklenmedi</strong><p>+ Banka hesabı ile başlayabilirsin.</p></div>';
 const choices=[['meal','Yemek Kartları','Yemek kartı firmalarından tahsil edeceğim'],
   ['platforms','Platformlar','Getir, Trendyol, Yemeksepeti, Usmar Market'],
   ['people','Şahıslar','Kişilerden alacağım paralar']];
 el('coreCollectionHub').innerHTML=choices.map(([tabName,title,desc])=>{
  const group=tabName==='platforms'?'platform':tabName==='people'?'person':'meal';
  return '<button type="button" class="core-collection-choice" data-mobile-tab="'+tabName+'">'+
    '<strong>'+title+'</strong><span>'+esc(desc)+'</span><b>'+money(totalOpen(groupFirms(group)))+'</b></button>';
 }).join('')+
 (old.length?'<button type="button" class="core-collection-choice" data-mobile-tab="people">'+
  '<strong>Önceden kayıtlı diğer alacaklar</strong><span>Eski kayıtlar yerinde duruyor</span><b>'+
  money(totalOpen(old))+'</b></button>':'');
}
function coreOverview(){
 const p=window.computeFinancialOverview(state),meal=totalOpen(groupFirms('meal')),
  platform=totalOpen(groupFirms('platform')),people=totalOpen(groupFirms('person')),
  legacy=totalOpen(groupFirms('general')),pos=totalOpen(groupFirms('pos'));
 const bankAccounts=(state.accounts||[]).filter(a=>a.type==='bank');
 const bankBalance=bankAccounts.reduce((n,a)=>n+currentBalance(a.id),0);
 const extraOther=p.firmReceivable-meal-platform-people-legacy-pos;
 const netLabel=p.netDebt>=0?'NET GENEL BORÇ':'NET GENEL ALACAK';
 el('stats').innerHTML=
  stat(netLabel,money(Math.abs(p.netDebt)),'Kart borçları + firma borçları − tüm alacaklar',p.netDebt>=0?'danger':'accent')+
  stat('KREDİ KARTI BORCUM',money(p.cardDebtTry),p.cardsCount+' kart','danger')+
  stat('BANKALARDAKİ PARAM',money(bankBalance),bankAccounts.length+' hesap','accent')+
  stat('YEMEK KARTI ALACAĞIM',money(meal),groupFirms('meal').length+' kurum','accent')+
  stat('PLATFORMLARDAKİ PARAM',money(platform),groupFirms('platform').length+' platform','accent')+
  stat('POS TAHSİL EDİLECEK',money(pos),groupFirms('pos').length+' POS hesabı','accent')+
  stat('ŞAHISLARDAN ALACAĞIM',money(people),groupFirms('person').length+' şahıs','accent')+
  stat('FİRMALARA BORCUM',money(p.firmPayable),(state.firms||[]).filter(f=>f.category==='payable').length+' firma','danger')+
  (legacy?stat('DİĞER ESKİ ALACAKLAR',money(legacy),'Silinmedi, yeniden sınıflandırılabilir','accent'):'');
 const line=(name,amount,note='',isMinus=false)=>
  '<div class="overview-line"><div><strong>'+esc(name)+'</strong><small>'+esc(note)+'</small></div>'+
  '<b class="'+(isMinus?'accent':'')+'">'+(isMinus?'− ':'')+money(amount)+'</b></div>';
 el('overviewLedger').innerHTML=
  line('Kredi kartlarım',p.cardDebtTry,'Limit − kullanılabilir limit; varsa ekstreyle çift sayılmaz')+
  line('Firmalara borcum',p.firmPayable,'Ödeme sonrası kalan')+
  line('Yemek kartı alacaklarım',meal,'Tahsilat sonrası kalan',true)+
  line('Platformlardaki param',platform,'Tahsilat sonrası kalan',true)+
  line('POS günlük satış alacakları',pos,'Tahsilat sonrası kalan',true)+
  line('Şahıslardan alacaklarım',people,'Tahsilat sonrası kalan',true)+
  (legacy?line('Önceki diğer alacaklarım',legacy,'Eski kayıtlar korunuyor',true):'')+
  (extraOther?line('Diğer alacaklar',extraOther,'Gruplanmamış',true):'')+
  '<div class="overview-line overview-line-total"><strong>'+netLabel+'</strong><b>'+
     money(Math.abs(p.netDebt))+'</b></div>';
 el('overviewCash').innerHTML=line('Bankalarda bulunan toplam',bankBalance,bankAccounts.length+' banka hesabı')+
  line('Nakit kasa toplamı',p.cashBalance-bankBalance,'Günlük nakit satış ve çıkışlar')+
  line('Gelir hareketleri',p.income,'Kaydedilmiş hareketler')+
  line('Gider hareketleri',p.expenses,'Kaydedilmiş hareketler')+
  '<p class="hint">Banka bakiyesi ve gelir/gider hareketleri, net borca tekrar eklenmez.</p>';
 const listed=[...p.firmItems].filter(x=>x.remaining>0).sort((a,b)=>b.remaining-a.remaining);
 el('overviewFirms').innerHTML=listed.length?listed.slice(0,10).map(x=>line(x.firm.name,x.remaining,
   x.firm.category==='payable'?'Firmaya borç':
   ({meal:'Yemek kartı',platform:'Platform',pos:'POS',person:'Şahıs',general:'Önceki alacak'}[receivableGroup(x.firm)]||'Alacak'),
   x.firm.category!=='payable')).join(''):
  '<div class="core-empty"><strong>Henüz açık cari bakiye yok.</strong></div>';
 const due=typeof dueList==='function'?dueList().filter(x=>x.source!=='instrument'):[];
 el('upcoming').innerHTML=due.length?due.slice().sort((a,b)=>a.date.localeCompare(b.date)).slice(0,10).map(x=>
   '<div class="due-row"><div class="due-desc"><strong>'+esc(x.name)+'</strong><small>'+
     esc(showDate(x.date))+'</small></div><div class="due-amount">'+(x.amount?
       cardMoney(x.amount,{currency:x.currency||'TRY'}):'Tarih')+'</div></div>').join(''):
   '<div class="core-empty"><strong>Yaklaşan vade yok.</strong></div>';
}
document.addEventListener('error',event=>{
 const img=event.target;
 if(img instanceof HTMLImageElement && img.classList.contains('core-preset-logo'))img.remove();
},true);
document.addEventListener('click',event=>{
 const b=event.target.closest('[data-core-new],[data-core-preset],[data-core-charge],'+
 '[data-core-settle],[data-core-edit],[data-core-history],[data-core-export],'+
 '[data-core-bank-new],[data-core-bank-moves],[data-core-logout]');
 if(!b)return;
 if(b.dataset.coreLogout){el('logout').click();return;}
 if(currentRole==='viewer' && (b.dataset.coreNew||b.dataset.corePreset||
    b.dataset.coreCharge||b.dataset.coreSettle||b.dataset.coreEdit||b.dataset.coreBankNew)){
  notice('Salt-okunur kullanıcı kayıt ekleyemez.',true);return;
 }
 if(b.dataset.coreBankNew){
  window.openSuiteForm('account');
  const bank=el('suite-type');
  if(bank)bank.value='bank';
  return;
 }
 if(b.dataset.coreBankMoves){coreOpenHistoryId=coreOpenHistoryId===b.dataset.coreBankMoves?'':b.dataset.coreBankMoves;window.renderCoreMoney();return;}
 if(b.dataset.coreNew){window.openFirmForm('new','receivable',b.dataset.coreNew);return;}
 if(b.dataset.corePreset){
  const group=b.dataset.corePreset,name=b.dataset.coreName;
  const existing=groupFirms(group).find(f=>f.name===name);
  if(existing)window.openFirmForm('charge',existing.id);
  else window.openFirmForm('new','receivable',group,name);
  return;
 }
 if(b.dataset.coreCharge){window.openFirmForm('charge',b.dataset.coreCharge);return;}
 if(b.dataset.coreSettle){
  const firm=(state.firms||[]).find(f=>f.id===b.dataset.coreSettle);
  window.openSettlementForm(b.dataset.coreSettle,firm?.receivable_group==='pos');
  return;
 }
 if(b.dataset.coreEdit){window.openFirmForm('edit',b.dataset.coreEdit);return;}
 if(b.dataset.coreHistory){coreOpenHistoryId=coreOpenHistoryId===b.dataset.coreHistory?'':b.dataset.coreHistory;window.renderCoreMoney();return;}
 if(b.dataset.coreExport){window.exportFirmStatement(b.dataset.coreExport,'excel');return;}
});
window.renderCoreMoney=renderCoreMoney;
window.renderCoreOverview=coreOverview;
