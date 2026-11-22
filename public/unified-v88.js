'use strict';
/* HesapTakip V1.1 (UI v88).
   Presentation-only. Reads the existing D1-backed in-memory state.
   No APIs, financial writes, record deletion or permission changes. */
(function(){
  const byId=id=>document.getElementById(id);
  const role=()=>window.HTIdentity?.role||'';
  const canUseTools=()=>role()==='admin';
  const readState=()=>typeof state==='undefined'?null:state;
  const arr=x=>Array.isArray(x)?x:[];
  const number=x=>Number.isFinite(Number(x))?Number(x):0;
  const format=(kurus,currency='TRY')=>
    new Intl.NumberFormat('tr-TR',{style:'currency',currency}).format(number(kurus)/100);
  let toolOrigin='';
  let queued=false;

  function make(tag,className,text){
    const e=document.createElement(tag);
    if(className)e.className=className;
    if(text!==undefined)e.textContent=String(text);
    return e;
  }
  function summaryNode(id,label){
    const section=make('section','v88-main-summary');
    section.id=id;
    section.setAttribute('aria-label',label);
    section.append(make('span','v88-summary-label',label),
      make('strong','v88-summary-value','—'),
      make('small','v88-summary-note','Kayıtlar yükleniyor.'));
    return section;
  }
  function fillSummary(id,label,value,note){
    const host=byId(id);if(!host)return;
    host.querySelector('.v88-summary-label').textContent=label;
    host.querySelector('.v88-summary-value').textContent=value;
    host.querySelector('.v88-summary-note').textContent=note;
  }
  function mini(label,value,note=''){
    const item=make('div','v88-mini');
    item.append(make('span','v88-mini-label',label),make('strong','v88-mini-value',value));
    if(note)item.append(make('small','v88-mini-note',note));
    return item;
  }
  function setMinis(id,items){
    const target=byId(id);if(!target)return;
    target.replaceChildren(...items.map(item=>mini(...item)));
    target.hidden=!items.length;
  }
  function placeAfter(element,target){
    if(element&&target)element.insertAdjacentElement('afterend',target);
  }
  function toolsNav(){
    const nav=make('nav','v88-finance-tools');
    nav.setAttribute('aria-label','Finans araçlarına hızlı erişim');
    for(const [group,label] of [
      ['cards','PDF ekstre kontrolü'],
      ['banks','POS mutabakatı'],
      ['reports','Rapor oluştur']
    ]){
      const b=make('button','v88-tool-link',label);
      b.type='button';b.dataset.v88FinanceTool=group;
      nav.append(b);
    }
    return nav;
  }
  function setup(){
    const cards=byId('cardsView'),bank=byId('bankingView'),
      accounts=byId('collectionsView'),firms=byId('payablesView');
    if(!cards||!bank||!accounts||!firms||byId('v88CardSummary'))return;

    const cardTabs=cards.querySelector(':scope > .v18-subnav');
    const bankTabs=bank.querySelector(':scope > .v18-subnav');
    const firmTabs=firms.querySelector(':scope > .v18-subnav');
    placeAfter(cardTabs,summaryNode('v88CardSummary','Toplam açık ekstre borcu'));
    placeAfter(bankTabs,summaryNode('v88BankSummary','Kasa ve banka bakiyesi'));
    placeAfter(firmTabs,summaryNode('v88FirmSummary','Toplam kalan firma borcum'));

    const accountTitle=accounts.querySelector(':scope > .v8-section-title');
    if(accountTitle&&!byId('v88AccountsAmount')){
      const amount=make('strong','v88-account-amount','—');amount.id='v88AccountsAmount';
      accountTitle.querySelector('h2')?.insertAdjacentElement('afterend',amount);
    }
    const accountMini=make('div','v88-mini-grid');accountMini.id='v88AccountHighlights';
    const firmMini=make('div','v88-mini-grid');firmMini.id='v88FirmHighlights';
    placeAfter(accountTitle,accountMini);
    placeAfter(byId('v88FirmSummary'),firmMini);

    const limits=byId('cardsSummary');
    if(limits){
      const collapsible=make('details','v88-card-limits');
      collapsible.id='v88CardLimits';
      collapsible.append(make('summary','', 'Kayıtlı kart limitlerini göster'));
      limits.parentElement.insertBefore(collapsible,limits);
      collapsible.append(limits);
    }
    const cardTools=toolsNav(),bankTools=toolsNav();
    placeAfter(byId('v88CardLimits')||cards.querySelector('.ht-card-today-header'),cardTools);
    placeAfter(byId('v88BankSummary'),bankTools);
    const warning=make('button','v88-overview-check','Kayıt kontrolleri ve uyarılar');
    warning.type='button';warning.dataset.v88FinanceTool='control';
    warning.id='v88OverviewCheck';
    const overview=byId('overviewView');
    const search=overview?.querySelector('.v36-home-search');
    if(search)placeAfter(search,warning);
    else overview?.append(warning);

    // The four former Settings entry tiles are superseded by Finance/General.
    // Existing v60 tools stay in their original DOM; only entry points move.
    const settingsGrid=byId('v85SettingsHub')?.querySelector('.v85-settings-grid');
    if(settingsGrid&&!settingsGrid.querySelector('[data-v85-settings="updates"]')){
      const updates=make('button','v85-setting-tile v85-tile-sky v88-updates-tile');
      updates.type='button';updates.dataset.v85Settings='updates';
      updates.append(make('span','v85-tile-icon','↻'),
        make('strong','','Uygulama ve Sürüm'),
        make('span','v85-tile-desc','Güncellemeler ve kurulum'),
        make('span','v85-tile-arrow','›'));
      settingsGrid.append(updates);
    }
    const advice=byId('v60CardAdvice')?.closest('.v60-tool');
    if(advice)advice.dataset.v88DeprecatedAdvice='true';
    // Control Center now shows actionable control items only. The bank,
    // card and report tools remain accessible through the Finance shortcuts.
    const center=byId('v60Center');
    center?.querySelectorAll('.v60-tool').forEach(tool=>{
      if(tool.dataset.v85Group!=='control')tool.dataset.v88FinanceOnly='true';
    });
    observeData();
    refresh();
  }
  function accountGroup(f){
    return f.receivable_group==='veresiye'?'person':(f.receivable_group||'general');
  }
  function firmRemaining(f){
    return typeof firmBalance==='function'?number(firmBalance(f.id).remaining):0;
  }
  function refreshCards(s){
    const cards=arr(s.cards),byCard=window.HTDebtRankingV72?.cardOpenTotals?.(
      arr(s.statements),arr(s.payments))||new Map();
    const cardMap=new Map(cards.map(c=>[c.id,c]));
    const totals=new Map();
    for(const [id,amount] of byCard){
      const currency=cardMap.get(id)?.currency||'TRY';
      totals.set(currency,(totals.get(currency)||0)+number(amount));
    }
    const tryDebt=totals.get('TRY')||0;
    const other=[...totals.keys()].filter(x=>x!=='TRY');
    fillSummary('v88CardSummary','Açık ekstre borcu (TL)',format(tryDebt),
      cards.length+' kayıtlı kart · '+(other.length?
       'Diğer para birimleri ayrı hesaplanır: '+other.join(', '):
       'Yalnız kayıtlı ekstrelerden hesaplanır'));
  }
  function refreshBank(s){
    const accounts=arr(s.accounts),entries=arr(s.entries);
    const balances=new Map(accounts.map(a=>[a.id,number(a.opening_kurus)]));
    for(const e of entries){
      if(balances.has(e.account_id))balances.set(e.account_id,
        balances.get(e.account_id)+(e.direction==='in'?1:-1)*number(e.amount_kurus));
    }
    const tryTotal=accounts.filter(a=>(a.currency||'TRY')==='TRY')
      .reduce((sum,a)=>sum+(balances.get(a.id)||0),0);
    const other=[...new Set(accounts.map(a=>a.currency||'TRY'))].filter(x=>x!=='TRY');
    fillSummary('v88BankSummary','Kasa ve banka bakiyesi (TL)',format(tryTotal),
      accounts.length+' kayıtlı hesap'+(other.length?' · Diğer para birimleri hariç':'')+
      ' · Kaydedilen hareketlere dayanır');
  }
  function refreshAccounts(s){
    const chosen=document.querySelector('#collectionsView .v8-account-tab.active')
      ?.dataset.v8Accounts==='people'?'person':'platform';
    const relevant=arr(s.firms).filter(f=>f.category==='receivable'&&
      (chosen==='person'?accountGroup(f)==='person':
       ['platform','meal'].includes(accountGroup(f))));
    const total=relevant.reduce((n,f)=>n+firmRemaining(f),0);
    const title=byId('v8AccountsTitle');
    if(title)title.textContent=chosen==='person'?'Toplam şahıs alacağım':'Toplam platform alacağım';
    const amount=byId('v88AccountsAmount');if(amount)amount.textContent=format(total);
    const highest=relevant.filter(f=>firmRemaining(f)>0)
      .sort((a,b)=>firmRemaining(b)-firmRemaining(a))[0];
    setMinis('v88AccountHighlights',[
      ['Kayıtlı hesap',String(relevant.length),'Mevcut cari kayıtlar'],
      ...(highest?[['En yüksek alacağım',format(firmRemaining(highest)),highest.name]]:[])
    ]);
  }
  function refreshFirms(s){
    const firms=arr(s.firms).filter(f=>f.category==='payable');
    const open=firms.filter(f=>firmRemaining(f)>0);
    const total=open.reduce((n,f)=>n+firmRemaining(f),0);
    const best=open.slice().sort((a,b)=>firmRemaining(b)-firmRemaining(a))[0];
    const idSet=new Set(firms.map(f=>f.id));
    const settled=arr(s.firmMovements).filter(m=>idSet.has(m.firm_id)&&m.kind==='settlement')
      .reduce((n,m)=>n+number(m.amount_kurus),0);
    fillSummary('v88FirmSummary','Toplam kalan firma borcum',format(total),
      firms.length+' firma · '+open.length+' firmada açık borç');
    setMinis('v88FirmHighlights',[
      ...(best?[['En fazla borcum olan firma',format(firmRemaining(best)),best.name]]:[]),
      ['Kayıtlı toplam ödeme',format(settled),'Firma hareketlerinden']
    ]);
  }
  function refreshWarning(){
    const model=window.HTV60?.model?.();
    const button=byId('v88OverviewCheck');
    if(!button)return;
    const problems=arr(model?.issues).length;
    const overdue=arr(model?.overdue).length;
    button.textContent=(problems+overdue)?
      'Kontrol et: '+problems+' kayıt uyarısı · '+overdue+' geciken vade':
      'Kayıt kontrolleri ve uyarılar';
  }
  function refresh(){
    const s=readState();
    if(!s||!Array.isArray(s.firms)||!Array.isArray(s.cards))return;
    refreshCards(s);refreshBank(s);refreshAccounts(s);refreshFirms(s);refreshWarning();
    document.querySelectorAll('.v88-finance-tools,#v88OverviewCheck').forEach(el=>{
      el.hidden=!canUseTools();
    });
  }
  function queueRefresh(){
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;refresh();});
  }
  function observeData(){
    if(typeof MutationObserver==='undefined')return;
    for(const id of ['cardsSummary','v8AccountsList','payablesStats','coreBankStats','v60Headline']){
      const el=byId(id);if(!el)continue;
      new MutationObserver(queueRefresh).observe(el,{childList:true,subtree:false});
    }
  }
  function openFinanceTool(group){
    if(!canUseTools())return;
    const allowed=['control','cards','banks','reports'];
    if(!allowed.includes(group))return;
    const current=byId('pageTitle')?.textContent||'';
    toolOrigin=group==='control'?'overview':current==='Finans'&&
      !byId('bankingView')?.hidden?'banking':'cards';
    window.tab?.('settings');
    window.HTSettingsGrid?.open?.(group);
    if(byId('settingsView')?.dataset.v85Screen!==group){toolOrigin='';return;}
    byId('settingsView').dataset.v88FinanceContext='true';
    const title=byId('pageTitle'),subtitle=byId('pageSubtitle');
    if(title)title.textContent=group==='control'?'Genel Bakış':'Finans';
    if(subtitle)subtitle.textContent=group==='control'?'Kayıt uyarıları':
      ({cards:'Ekstre kontrolü',banks:'Banka ve POS',reports:'Finans raporları'})[group];
    const back=byId('v85SettingsDetail')?.querySelector('[data-v85-settings-back] span');
    if(back)back.textContent=group==='control'?'Genel':'Finans';
  }
  document.addEventListener('click',event=>{
    const tool=event.target.closest('[data-v88-finance-tool]');
    if(tool){
      event.preventDefault();
      openFinanceTool(tool.dataset.v88FinanceTool);
      return;
    }
    if(event.target.closest('[data-v85-settings-back]')&&toolOrigin){
      // Settings router handles its own history first; return to the origin view.
      const destination=toolOrigin;
      toolOrigin='';
      delete byId('settingsView').dataset.v88FinanceContext;
      window.tab?.(destination);
      window.scrollTo({top:0,behavior:'auto'});
      return;
    }
    if(event.target.closest('[data-v18-sub],[data-v8-accounts],[data-v18-section],[data-mobile-tab]')){
      if(!byId('settingsView')?.contains(event.target)){
        toolOrigin='';
        delete byId('settingsView')?.dataset.v88FinanceContext;
      }
      queueRefresh();
    }
  });
  document.addEventListener('change',event=>{
    if(event.target.matches('#v72PayablesSort,#v72PayablesStatus,#cardFilterStatus'))
      queueRefresh();
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();
