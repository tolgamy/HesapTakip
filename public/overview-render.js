'use strict';
// Overview visual layer. No independent balance editing or duplication of statement debt.
function renderFinanceOverview(){
 const p=window.computeFinancialOverview(state);
 const overdue=(typeof dueList==='function'?dueList():[]).filter(x=>x.amount>0&&x.date<trDate());
 const soon=(typeof dueList==='function'?dueList():[]).filter(x=>x.date>=trDate()&&dayDifference(x.date)<=7);
 const trySum=items=>items.filter(x=>!x.currency||x.currency==='TRY').reduce((n,x)=>n+x.amount,0);
 const netPositive=p.netDebt>=0;
 el('pageSubtitle').textContent=activeTab==='overview'?'Kartlar, firmalar, alacaklar ve tüm finansal durum':'';
 el('stats').innerHTML=
  stat(netPositive?'NET GENEL BORÇ':'NET GENEL ALACAK',money(Math.abs(p.netDebt)),
    'Kart kullanılan limiti + firma borçları − firma alacakları',netPositive?'danger':'accent')+
  stat('TOPLAM KART BORCU',money(p.cardDebtTry),p.cardsCount+' kart · TRY','danger')+
  stat('FİRMALARA BORÇ',money(p.firmPayable),'Ödenmemiş cari hesaplar','danger')+
  stat('FİRMALARDAN ALACAK',money(p.firmReceivable),'Tahsil edilmemiş cari hesaplar','accent')+
  stat('KASA + BANKA',money(p.cashBalance),p.accountsCount+' hesap','accent')+
  stat('7 GÜN İÇİNDE',money(trySum(soon)),soon.length+' yaklaşan vade')+
  stat('GECİKEN ÖDEME',money(trySum(overdue)),overdue.length+' geciken vade','danger')+
  stat('KAYITLI KART',String(p.cardsCount),p.openStatements.length+' açık ekstre');
 const row=(label,value,note='',highlight='')=>
   '<div class="overview-line"><div><strong>'+esc(label)+'</strong>'+
   (note?'<small>'+esc(note)+'</small>':'')+'</div><b class="'+highlight+'">'+esc(value)+'</b></div>';
 el('overviewLedger').innerHTML=
  row('Kredi kartı kullanılan limit',money(p.cardDebtTry),'Gerçek limitler; eksikse açık ekstre tutarı')+
  row('Firmalara kalan borç','+ '+money(p.firmPayable),'Firma <')+
  row('Firmalardan kalan alacak','− '+money(p.firmReceivable),'Firma >')+
  '<div class="overview-line overview-line-total"><strong>'+
  (netPositive?'Net borç':'Net alacak')+'</strong><b>'+money(Math.abs(p.netDebt))+'</b></div>'+
  (p.currencies.size>1?'<p class="hint">Döviz kartları ayrı gösterilir: '+
    [...p.currencies].filter(([ccy])=>ccy!=='TRY').map(([ccy,value])=>esc(cardMoney(value,{currency:ccy}))).join(' · ')+
    '. Kur çevrimi yapılmadı.</p>':'');
 el('overviewCash').innerHTML=
  row('Kasa ve banka toplamı',money(p.cashBalance),p.accountsCount+' hesap')+
  row('Gelir hareketleri',money(p.income),'Tüm zamanlar')+
  row('Gider hareketleri',money(p.expenses),'Tüm zamanlar')+
  row('Bekleyen verilen çek/senet',money(p.checkPayable),'Net borca tekrar eklenmez')+
  row('Bekleyen alınan çek/senet',money(p.checkReceivable),'Net alacaktan tekrar düşülmez')+
  '<div class="overview-line overview-line-total"><strong>Nakit dahil net pozisyon</strong><b class="'+
   (p.netCashPosition>=0?'accent':'danger')+'">'+money(p.netCashPosition)+'</b></div>'+
  '<p class="hint">Nakit dahil pozisyon = Kasa/Banka − Net genel borç. Evraklar çift sayımı önlemek için bilgi amaçlıdır.</p>';
 const firms=p.firmItems.filter(x=>x.remaining>0).sort((a,b)=>b.remaining-a.remaining);
 el('overviewFirms').innerHTML=firms.length?firms.slice(0,10).map(x=>
   row(x.firm.name,money(x.remaining),x.firm.category==='payable'?'Firma < · borç':'Firma > · alacak',
     x.firm.category==='payable'?'danger':'accent')).join(''):
   '<div class="empty-state"><strong>Açık firma bakiyesi bulunmuyor.</strong></div>';
 el('overviewRecent').innerHTML=p.recent.length?p.recent.map(x=>row(x.name,money(x.amount),
  showDate(x.date)+' · '+x.kind+' · '+x.note)).join(''):
  '<div class="empty-state"><strong>Henüz işlem kaydı yok.</strong></div>';
 const dueItems=(typeof dueList==='function'?dueList():[]).filter(x=>x.date).slice().sort((a,b)=>a.date.localeCompare(b.date)).slice(0,12);
 el('upcoming').innerHTML=dueItems.length?dueItems.map(x=>{
  const days=dayDifference(x.date);
  return '<div class="due-row"><div class="due-logo">'+
   (x.source==='card'||x.source==='card_due'||x.source==='card_cutoff'?'▣':x.source==='firm'?'▦':'▤')+
   '</div><div class="due-desc"><strong>'+esc(x.name)+'</strong><small>'+esc(showDate(x.date))+' · '+
   (days<0?'Gecikti':days===0?'Bugün':days+' gün sonra')+'</small></div>'+
   '<div class="due-amount">'+(x.amount?esc(cardMoney(x.amount,{currency:x.currency||'TRY'})):'Tahmini tarih')+
   '</div></div>';
 }).join(''):'<div class="empty-state"><strong>Yaklaşan açık vade bulunmuyor.</strong></div>';
 const sumByCurrency=new Map();
 for(const c of p.cardItems)sumByCurrency.set(c.currency,(sumByCurrency.get(c.currency)||0)+c.debt);
 el('distribution').innerHTML=p.cardItems.length?p.cardItems.slice().sort((a,b)=>b.debt-a.debt).map(x=>{
  const sum=sumByCurrency.get(x.currency)||0,percent=sum>0?Math.round(x.debt/sum*100):0;
  return '<div class="dist-row"><div class="dist-top"><span>'+esc(x.card.bank+' · '+x.card.nickname)+
    '</span><span>'+esc(cardMoney(x.debt,x.card))+'</span></div>'+
    '<p class="dist-sub">'+esc(x.method==='limit'?'Kart limiti − kullanılabilir limit':'Açık ekstre (limit girilmemiş)')+
    '</p><div class="bar"><div class="bar-fill" style="width:'+percent+'%"></div></div></div>';
 }).join(''):'<div class="empty-state"><strong>Henüz kart tanımlanmadı.</strong></div>';
}
window.renderFinanceOverview=renderFinanceOverview;
