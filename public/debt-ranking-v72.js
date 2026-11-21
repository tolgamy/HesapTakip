'use strict';
/* V72 - debt ranking only. Reads existing state, statements, payments and firm movements.
   It does not write data or call the backend. */
(function(){
 const numeric=v=>Number.isFinite(Number(v))?Number(v):0;
 function cardOpenTotals(statements=[],payments=[]){
   const paid=new Map();
   for(const p of payments||[])paid.set(p.statement_id,(paid.get(p.statement_id)||0)+numeric(p.amount_kurus));
   const totals=new Map();
   for(const s of statements||[]){
     const left=Math.max(0,numeric(s.amount_kurus)-(paid.get(s.id)||0));
     if(left>0)totals.set(s.card_id,(totals.get(s.card_id)||0)+left);
   }
   return totals;
 }
 function rankCards(cards,openMap,order='debt_desc'){
   const get=id=>numeric(openMap instanceof Map?openMap.get(id):openMap?.[id]);
   return [...cards].sort((a,b)=>{
     const ca=a.currency||'TRY',cb=b.currency||'TRY';
     if(ca!==cb)return ca==='TRY'?-1:cb==='TRY'?1:ca.localeCompare(cb,'tr');
     const difference=order==='debt_asc'?get(a.id)-get(b.id):get(b.id)-get(a.id);
     return difference||(a.bank||'').localeCompare(b.bank||'','tr');
   });
 }
 function rankFirms(firms,balanceFor,query='',sort='remaining_desc',status='all'){
   const q=String(query||'').toLocaleLowerCase('tr-TR').trim();
   const balance=f=>balanceFor(f)||{charges:0,settled:0,remaining:0};
   const positive=f=>Math.max(0,numeric(balance(f).remaining));
   return (firms||[]).filter(f=>{
     if(q&&!String(f.name||'').toLocaleLowerCase('tr-TR').includes(q))return false;
     const remaining=numeric(balance(f).remaining);
     return status==='all'||(status==='open'&&remaining>0)||
       (status==='clear'&&remaining===0)||(status==='credit'&&remaining<0);
   }).slice().sort((a,b)=>{
     const ba=balance(a),bb=balance(b);
     let difference=sort==='charges_desc'?numeric(bb.charges)-numeric(ba.charges):
       sort==='settled_desc'?numeric(bb.settled)-numeric(ba.settled):
       sort==='remaining_asc'?
         // Positive small open balances first; paid-off/credit records last.
         (positive(a)>0?positive(a):Number.MAX_SAFE_INTEGER)-
         (positive(b)>0?positive(b):Number.MAX_SAFE_INTEGER):
       sort==='name'?0:positive(b)-positive(a);
     return difference||String(a.name||'').localeCompare(String(b.name||''),'tr');
   });
 }
 function renderOverview(){
   if(typeof document==='undefined'||typeof state==='undefined')return;
   const root=document.getElementById('v72DebtInsights');if(!root)return;
   const data=typeof summary==='function'?summary():[];
   const open=cardOpenTotals(state.statements||[],state.payments||[]);
   const cards=rankCards((state.cards||[]).filter(c=>(c.currency||'TRY')==='TRY'),open);
   const highestCard=cards.find(c=>(open.get(c.id)||0)>0);
   const balanceFor=f=>typeof firmBalance==='function'?firmBalance(f.id):{remaining:0};
   const payables=rankFirms((state.firms||[]).filter(f=>f.category==='payable'),balanceFor,'','remaining_desc','open');
   const receivables=rankFirms((state.firms||[]).filter(f=>f.category==='receivable'),balanceFor,'','remaining_desc','open');
   const format=n=>typeof money==='function'?money(n):new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(n/100);
   const items=[
     {heading:'En çok açık ekstre borcu (TL)',name:highestCard?
       [highestCard.bank,highestCard.last4?'•••• '+highestCard.last4:highestCard.nickname].filter(Boolean).join(' · '):'Açık TL ekstresi yok',
       amount:highestCard?format(open.get(highestCard.id)||0):'—',target:'cards',caption:'Ödenmemiş ekstre toplamı'},
     {heading:'En çok ödeme yapılacak firma',name:payables[0]?.name||'Açık firma borcu yok',
       amount:payables.length?format(Math.max(0,balanceFor(payables[0]).remaining)):'—',
       target:'payables',caption:'Firmaya kalan cari borç'},
     {heading:'En çok borcu olan firma',name:receivables[0]?.name||'Açık firma alacağı yok',
       amount:receivables.length?format(Math.max(0,balanceFor(receivables[0]).remaining)):'—',
       target:'receivables',caption:'Firmadan alacağım tutar'}
   ];
   root.replaceChildren();
   for(const item of items){
     const button=document.createElement('button');button.type='button';button.className='v72-debt-tile';
     button.dataset.v72Goto=item.target;
     const title=document.createElement('span');title.className='v72-debt-tile-label';title.textContent=item.heading;
     const name=document.createElement('strong');name.className='v72-debt-tile-name';name.textContent=item.name;
     const amount=document.createElement('b');amount.className='v72-debt-tile-amount';amount.textContent=item.amount;
     const sub=document.createElement('small');sub.textContent=item.caption+' · Görüntüle';
     button.append(title,name,amount,sub);root.append(button);
   }
 }
 if(typeof window!=='undefined')window.HTDebtRankingV72={cardOpenTotals,rankCards,rankFirms,renderOverview};
 if(typeof document!=='undefined')document.addEventListener('click',event=>{
   const b=event.target.closest('[data-v72-goto]');
   if(b&&typeof window.tab==='function')window.tab(b.dataset.v72Goto);
 });
})();