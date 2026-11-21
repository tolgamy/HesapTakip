'use strict';
/* Approved three-screen layout. Reuses existing rendering, permissions and action handlers.
   No API requests or data writes are introduced by this file. */
(function(){
 const byId=id=>document.getElementById(id);
 const txt=(tag,cls,value)=>{
   const n=document.createElement(tag);if(cls)n.className=cls;n.textContent=String(value??'');return n;
 };
 const isReader=()=>typeof currentRole!=='undefined'&&currentRole==='viewer';
 const formatCard=(kurus,currency)=>{
   if(kurus===null||kurus===undefined)return '—';
   return new Intl.NumberFormat('tr-TR',{style:'currency',currency:currency||'TRY'}).format(Number(kurus)/100);
 };
 const initial=name=>(String(name||'').trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('')||'?').toLocaleUpperCase('tr-TR');
 const getCompanyBalance=firm=>typeof firmBalance==='function'?firmBalance(firm.id):{remaining:0};

 function setupPayables(){
   const view=byId('payablesView');
   if(!view||byId('v70PayablesShell'))return;
   const shell=txt('section','v70-debt-shell','');
   shell.id='v70PayablesShell';shell.setAttribute('aria-label','Firma borç rehberi');
   shell.append(txt('h3','v70-debt-title','Borç Rehberi'));
   const label=txt('label','v70-debt-search','Firma ara');
   label.htmlFor='v70PayablesSearch';
   const input=document.createElement('input');
   input.id='v70PayablesSearch';input.type='search';input.autocomplete='off';
   input.placeholder='Firma adı ara...';input.setAttribute('aria-label','Borçlu firma ara');
   input.addEventListener('input',renderPayablesCompact);
   label.append(input);shell.append(label);
   const list=txt('div','','');list.id='v70PayablesList';
   list.setAttribute('aria-live','polite');shell.append(list);
   const stats=byId('payablesStats');
   stats?.insertAdjacentElement('afterend',shell);
 }
 function button(label,attr,value,cls=''){
   const b=txt('button',cls,label);b.type='button';b.setAttribute(attr,value);return b;
 }
 function gear(buttons){
   const d=document.createElement('details');d.className='v70-gear';
   const s=txt('summary','','⚙');s.setAttribute('aria-label','Diğer işlemler');
   const menu=txt('div','v70-gear-menu','');
   buttons.forEach(b=>menu.append(b));
   d.append(s,menu);return d;
 }
 function renderPayablesCompact(){
   const list=byId('v70PayablesList');if(!list)return;
   const query=String(byId('v70PayablesSearch')?.value||'').toLocaleLowerCase('tr-TR').trim();
   const firms=(typeof state!=='undefined'?state.firms:[]||[]).filter(f=>
      f.category==='payable'&&String(f.name||'').toLocaleLowerCase('tr-TR').includes(query));
   list.replaceChildren();
   if(!firms.length){
     list.append(txt('p','v70-debt-empty',query?'Bu aramaya uygun firma yok.':'Henüz firma kaydı yok.'));return;
   }
   firms.forEach(f=>{
     const balance=getCompanyBalance(f);
     const card=txt('article','v70-debt-card','');
     const head=txt('div','v70-debt-top','');
     const avatar=txt('div','v70-debt-initials',initial(f.name));
     const logo=window.HTEntityLogo?.('firm',f.id,f.logo_data)||f.logo_data;
     if(logo){
       const img=document.createElement('img');img.src=logo;img.alt='';
       img.addEventListener('error',()=>{img.remove();avatar.textContent=initial(f.name);},{once:true});
       avatar.replaceChildren(img);
     }
     const name=txt('div','v70-debt-name','');
     name.append(txt('strong','',f.name),txt('small','',f.phone||'Cari hesap'));
     const amount=txt('strong','v70-debt-amount',typeof money==='function'?money(Math.abs(balance.remaining)):'—');
     if(balance.remaining<0)amount.setAttribute('title','Fazla ödeme / firmadan alacağım');
     head.append(avatar,name,amount);card.append(head);
     const actions=txt('div','v70-debt-actions','');
     actions.append(button('Detay','data-firm-view',String(f.id)));
     if(!isReader()){
       const pay=button('Ödeme','data-firm-settle',String(f.id));
       if(balance.remaining<=0){pay.disabled=true;pay.title='Ödenecek açık bakiye yok';}
       actions.append(pay);
       actions.append(gear([
         button('Borç ekle','data-firm-charge',String(f.id)),
         button('Düzenle','data-firm-edit',String(f.id)),
         button('Sil','data-firm-delete',String(f.id),'v70-danger')
       ]));
     }
     card.append(actions);list.append(card);
   });
 }

 function setupDirectory(){
   const view=byId('directoryView');
   const quick=byId('representativesView');
   const list=byId('directoryList');
   if(!view||!quick||!list||byId('v70DirectoryTabs'))return;
   const tabs=txt('div','v70-directory-tabs','');tabs.id='v70DirectoryTabs';
   tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Rehber kayıt türü');
   [['people','Temsilciler'],['companies','Firmalar']].forEach(([key,label])=>{
     const b=txt('button','',label);b.type='button';
     b.dataset.v70DirectoryPanel=key;b.setAttribute('aria-pressed',key==='people'?'true':'false');
     b.addEventListener('click',()=>{
       view.classList.toggle('v70-dir-people',key==='people');
       view.classList.toggle('v70-dir-companies',key==='companies');
       tabs.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
     });
     tabs.append(b);
   });
   quick.insertAdjacentElement('beforebegin',tabs);
   view.classList.add('v70-dir-people');
   function sync(){
     const q=byId('dirQuickSearch'),d=byId('dirQuickDayFilter');
     if(q)q.value=byId('dirSearch')?.value||'';
     if(d)d.value=byId('dirDayFilter')?.value||'';
     window.HTDirectory?.renderQuickRepresentatives?.();
   }
   byId('dirSearch')?.addEventListener('input',sync);
   byId('dirDayFilter')?.addEventListener('change',sync);
   sync();
 }

 function setupCards(){
   const view=byId('cardsView');
   const filters=view?.querySelector('.card-filters');
   if(!view||!filters||byId('v70FilterToggle'))return;
   const bar=txt('div','v70-filter-toggle','');bar.id='v70FilterToggle';
   const toggle=txt('button','','Filtrele ▾');toggle.type='button';
   toggle.setAttribute('aria-expanded','false');
   toggle.setAttribute('aria-controls','cardFilters');
   filters.id='cardFilters';
   toggle.addEventListener('click',()=>{
     const opened=view.classList.toggle('v70-filter-open');
     toggle.setAttribute('aria-expanded',String(opened));
     toggle.textContent=opened?'Filtreyi kapat ▴':'Filtrele ▾';
   });
   bar.append(toggle);filters.insertAdjacentElement('beforebegin',bar);
 }
 function copyActions(from,selector,into){
   from?.querySelectorAll(selector).forEach(el=>{
     if(el.hidden)return;
     into.append(el.cloneNode(true));
   });
 }
 function renderCardsCompact(){
   const host=byId('cardList');
   if(!host)return;
   host.querySelectorAll('article.pro-card[data-v70-card-id]').forEach(card=>{
     if(card.querySelector(':scope > .v70-compact-card'))return;
     const id=card.dataset.v70CardId;
     const c=(typeof state!=='undefined'?state.cards:[]||[]).find(x=>String(x.id)===id);
     if(!c)return;
     const compact=txt('div','v70-compact-card','');
     const top=txt('div','v70-bank-main','');
     const logo=txt('div','v70-bank-logo','');
     const oldLogo=card.querySelector('.card-institution .inst-brand');
     if(oldLogo)logo.append(oldLogo.cloneNode(true));
     else logo.textContent=initial(c.bank);
     const data=txt('div','v70-bank-info','');
     data.append(txt('strong','',c.bank));
     data.append(txt('p','',(c.usage_type==='business'?'Ticari':'Bireysel')+' · **** '+(c.last4||'••••')));
     data.append(txt('p','','Limit: '+formatCard(c.credit_limit_kurus,c.currency)));
     data.append(txt('p','','Kullanılabilir: '+formatCard(c.available_limit_kurus,c.currency)));
     top.append(logo,data);compact.append(top);

     const actions=txt('div','v70-bank-actions','');
     const details=txt('button','','Kart Bilgileri');details.type='button';
     details.setAttribute('aria-expanded','false');
     details.addEventListener('click',()=>{
       const opened=card.classList.toggle('v70-open');
       details.textContent=opened?'Bilgileri Kapat':'Kart Bilgileri';
       details.setAttribute('aria-expanded',String(opened));
     });
     actions.append(details);
     const source=card.querySelector('.pro-card-actions');
     if(!isReader()&&source){
       const menu=txt('details','v70-actions-menu','');
       menu.append(txt('summary','','İşlemler'));
       const panel=txt('div','v70-actions-menu-panel','');
       copyActions(source,'[data-card-statement],[data-v47-renew-card],[data-v47-card-history]',panel);
       menu.append(panel);actions.append(menu);
       const settings=txt('details','v70-gear','');
       const summary=txt('summary','','⚙');summary.setAttribute('aria-label','Kart ayarları');
       settings.append(summary);
       const opts=txt('div','v70-gear-menu','');
       copyActions(source,'[data-edit],[data-delete]',opts);
       settings.append(opts);actions.append(settings);
     }
     compact.append(actions);
     card.prepend(compact);
   });
 }
 function init(){
   setupPayables();setupDirectory();setupCards();
   if(typeof window.renderFirms==='function'){
     const original=window.renderFirms;
     if(!original.v70Wrapped){
       const wrapper=function(){const result=original.apply(this,arguments);renderPayablesCompact();return result;};
       wrapper.v70Wrapped=true;window.renderFirms=wrapper;
     }
   }
   if(typeof window.renderProCards==='function'){
     const original=window.renderProCards;
     if(!original.v70Wrapped){
       const wrapper=function(){const result=original.apply(this,arguments);renderCardsCompact();return result;};
       wrapper.v70Wrapped=true;window.renderProCards=wrapper;
     }
   }
   renderPayablesCompact();renderCardsCompact();
   // Local filter handlers call proCardList directly; observe list replacements too.
   const cardHost=byId('cardList');
   if(cardHost&&typeof MutationObserver!=='undefined'){
     const watcher=new MutationObserver(()=>renderCardsCompact());
     watcher.observe(cardHost,{childList:true});
   }
   document.addEventListener('click',e=>{
     document.querySelectorAll('details.v70-gear[open],details.v70-actions-menu[open]').forEach(item=>{
       if(!item.contains(e.target))item.open=false;
     });
   });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();
