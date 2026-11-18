'use strict';
// A single Finance POS view, computed only from existing D1 firm movements
// and bank movements. Never changes balances and never counts receivables twice.
(function(){
 const safe=value=>esc(String(value??''));
 function readPos(stateSnapshot){
  const institutions=stateSnapshot.institutions||[];
  const byId=new Map(institutions.map(i=>[i.id,i]));
  const firms=(stateSnapshot.firms||[]).filter(f=>f.category==='receivable'&&
   (f.receivable_group==='pos'||byId.get(f.payout_institution_id)?.type==='payment'));
  const ids=new Set(firms.map(f=>f.id));
  const accounts=(stateSnapshot.accounts||[]).filter(a=>a.type==='bank');
  const accountIds=new Set(accounts.map(a=>a.id));
  const isPosAccount=a=>{
   if(Number(a.is_pos)===1)return true;
   const provider=byId.get(a.institution_id);
   if(provider?.type==='payment')return true;
   if(a.institution_id)return false;
   const name=String(a.name||'').toLocaleLowerCase('tr-TR');
   return /(^|\W)(pos|paytr|iyzico|tami|edenredpos)(\W|$)/i.test(name);
  };
  const posAccounts=accounts.filter(isPosAccount);
  const movements=(stateSnapshot.firmMovements||[]).filter(m=>ids.has(m.firm_id));
  const pending=firms.reduce((n,f)=>n+Math.max(0,firmBalance(f.id).remaining),0);
  const posCashIn=(stateSnapshot.entries||[]).filter(e=>
   accountIds.has(e.account_id)&&e.direction==='in'&&
   /^Cari tahsilat:\s*([a-f0-9-]{36})/i.test(e.note||'')&&
   ids.has((e.note||'').match(/^Cari tahsilat:\s*([a-f0-9-]{36})/i)?.[1]));
  const received=posCashIn.reduce((n,e)=>n+Number(e.amount_kurus||0),0);
  const accountAmount=posAccounts.reduce((n,a)=>n+currentBalance(a.id),0);
  return {firms,posAccounts,movements,pending,received,accountAmount};
 }
 function init(){
  const target=el('coreBankStats');
  if(target&&!el('v21PosSummary'))
   target.insertAdjacentHTML('beforebegin','<section id="v21PosSummary" class="v21-pos-summary">'+
    '<div class="v21-pos-heading"><div><h3>POS ve Ödeme Kuruluşlarındaki Param</h3>'+
    '<small>Bekleyen POS alacakları, banka tahsilatları ve ödeme kuruluşu hesapları</small></div>'+
    '<div class="v46-pos-heading-actions">'+
    '<button type="button" class="btn secondary" data-v46-pos-account-new>+ POS hesabı aç</button>'+
    '<button type="button" class="btn subtle" data-v46-pos-archive-show>Arşiv</button></div></div>'+
    '<div id="v21PosStats" class="v21-pos-stats"></div>'+
    '<div id="v21PosList" class="v21-pos-table" aria-live="polite"></div>'+
    '<div id="v46PosArchive" class="v46-pos-archive" hidden></div>'+
    '<p class="hint">Bekleyen tutarlar mevcut platform/yemek kartı alacaklarına da dahil olabilir; toplam paraya ikinci kez eklenmez. Bankaya gelen POS tahsilatı yalnızca bağlı banka hareketinden hesaplanır.</p>'+
    '</section>');
 }
 function render(){
  init();
  const stats=el('v21PosStats'),host=el('v21PosList');
  if(!stats||!host)return;
  const model=readPos(state);
  const tile=(label,value,note)=>'<div class="v21-pos-stat"><span>'+label+'</span>'+
   '<strong>'+money(value)+'</strong><small class="hint">'+note+'</small></div>';
  stats.innerHTML=tile('Bekleyen POS / ödeme kuruluşu alacağı',model.pending,'Henüz bankaya geçmemiş cari bakiye')+
   tile('Bankaya işlenen POS tahsilatı',model.received,'Bağlı banka hareketlerinden; toplam geçmiş')+
   tile('Ödeme kuruluşu / POS hesap bakiyesi',model.accountAmount,'Kayıtlı banka hesaplarında şu an');
  const rows=[
   ...model.firms.map(f=>{
    const balance=firmBalance(f.id);
    const inst=(state.institutions||[]).find(i=>i.id===f.payout_institution_id);
    const moves=model.movements.filter(m=>m.firm_id===f.id&&m.kind==='charge');
    const recent=moves.map(m=>m.on_date).sort().at(-1);
    const label=f.receivable_group==='pos'?'POS günlük cirosu':
      f.receivable_group==='meal'?'Yemek kartı · ödeme kuruluşu':'Platform · ödeme kuruluşu';
    return '<article class="v21-pos-row"><div><strong>'+safe(f.name)+'</strong>'+
     '<small>'+label+(inst?' · '+safe(inst.name):'')+
      (recent?' · Son ciro: '+safe(showDate(recent)):'')+'</small>'+
     '<small>Toplam ciro/alacak: '+money(balance.charges)+' · Cari tahsilat: '+money(balance.settled)+'</small></div>'+
     '<b>'+money(Math.max(0,balance.remaining))+' bekliyor</b>'+
     '<div class="v46-pos-actions">'+
       '<button type="button" class="mini-btn" data-core-history="'+safe(f.id)+'">Hareketler</button>'+
       (currentRole==='viewer'?'':'<button type="button" class="mini-btn" data-v46-pos-firm-edit="'+safe(f.id)+'">Düzenle</button>'+
       '<button type="button" class="mini-btn delete" data-v46-pos-firm-archive="'+safe(f.id)+'">Sil</button>')+
       '</div></article>';
   }),
   ...model.posAccounts.map(a=>
    '<article class="v21-pos-row"><div><strong>'+safe(a.name)+'</strong>'+
     '<small>POS / ödeme kuruluşu banka hesabı · mevcut bakiye</small></div>'+
     '<b>'+money(currentBalance(a.id))+'</b>'+
     '<div class="v46-pos-actions">'+
       '<button type="button" class="mini-btn" data-core-bank-moves="'+safe(a.id)+'">Hareketler</button>'+
       (currentRole==='viewer'?'':'<button type="button" class="mini-btn" data-v46-pos-account-edit="'+safe(a.id)+'">Düzenle</button>'+
       '<button type="button" class="mini-btn delete" data-v46-pos-account-delete="'+safe(a.id)+'">Sil</button>')+
       '</div></article>')
  ];
  host.innerHTML=rows.length?rows.join(''):
   '<div class="v21-pos-empty">Henüz POS cirosu veya ödeme kuruluşu hesabı bulunmuyor. POS hesabı açarak günlük ciro girebilir; tahsilat geldiğinde bağlı banka hesabına işleyebilirsin.</div>';
 }
 const oldRender=window.renderCoreMoney;
 window.renderCoreMoney=function(){
  if(typeof oldRender==='function')oldRender();
  render();
 };
 window.HTPOS21={readPos,render};
 init();
})();