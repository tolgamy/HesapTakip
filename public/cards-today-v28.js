'use strict';
// V42: recommend the card whose statement closed most recently (not today).
// Available credit is for display only and never affects eligibility or rank.
(function(){
 function dayInMonth(y,m,day){
  const last=new Date(Date.UTC(y,m,0)).getUTCDate();
  return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(Math.min(last,day)).padStart(2,'0');
 }
 function latestClosing(card,today){
  const day=Number(card.statement_day);
  // Confirmed statement dates supersede day-of-month assumptions.
  if(card.current_statement_date&&card.current_statement_date<today){
   const age=Math.floor((Date.parse(today+'T12:00:00Z')-Date.parse(card.current_statement_date+'T12:00:00Z'))/86400000);
   return age>=0&&age<=45?card.current_statement_date:null;
  }
  const dates=[];
  if(Number.isInteger(day)&&day>=1&&day<=31){
   const y=Number(today.slice(0,4)),m=Number(today.slice(5,7));
   const thisMonth=dayInMonth(y,m,day);
   const previous=new Date(Date.UTC(y,m-2,1));
   dates.push(thisMonth<today?thisMonth:dayInMonth(previous.getUTCFullYear(),previous.getUTCMonth()+1,day));
  }
  // Explicit dates are used only when they are plausibly from the latest cycle.
  for(const d of [card.current_statement_date,card.next_statement_date]){
   if(typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&d<today){
    const age=Math.floor((Date.parse(today+'T12:00:00Z')-Date.parse(d+'T12:00:00Z'))/86400000);
    if(age>=0&&age<=35)dates.push(d);
   }
  }
  return dates.length?dates.sort().at(-1):null;
 }
 function isCutoffDay(card,today){
  const day=Number(card?.statement_day);
  const date=Number.isInteger(day)&&day>=1&&day<=31?
   dayInMonth(Number(today.slice(0,4)),Number(today.slice(5,7)),day):null;
  return date===today||card?.current_statement_date===today||
   card?.next_statement_date===today;
 }
 function recommend(cards,today){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(today))return null;
  const valid=(cards||[]).filter(c=>
    c&&(c.card_type||'credit')==='credit'&&
    (c.status||'active')==='active'&&
    !isCutoffDay(c,today));
  const options=valid.map(c=>({...c,last_cutoff:latestClosing(c,today)}))
    .filter(c=>c.last_cutoff).sort((a,b)=>b.last_cutoff.localeCompare(a.last_cutoff)||
      (a.nickname||a.bank||'').localeCompare(b.nickname||b.bank||'','tr')||
      String(a.id||'').localeCompare(String(b.id||'')));
  return options[0]||null;
 }
 // Card obligations are based only on saved statement balances and actual
 // payments: never infer a payable amount from a card's limit or estimated date.
 function dueCards(statements,payments,cards,today){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(today))return {today:[],overdue:[],upcoming:[]};
  const paid=new Map();
  for(const p of payments||[]){
   if(!p||!p.statement_id)continue;
   paid.set(p.statement_id,(paid.get(p.statement_id)||0)+Number(p.amount_kurus||0));
  }
  const byCard=new Map((cards||[]).map(c=>[c.id,c]));
  const rows=(statements||[]).filter(s=>s&&s.due_date&&
   /^\d{4}-\d{2}-\d{2}$/.test(s.due_date)).map(s=>{
    const card=byCard.get(s.card_id),total=Number(s.amount_kurus)||0;
    return {id:s.id,date:s.due_date,card,
      name:[card?.bank||'Kredi kartı',card?.nickname||s.period].filter(Boolean).join(' · '),
      amount:Math.max(0,total-(paid.get(s.id)||0))};
   }).filter(x=>x.amount>0).sort((a,b)=>a.date.localeCompare(b.date)||
     a.name.localeCompare(b.name,'tr'));
  return {today:rows.filter(x=>x.date===today),overdue:rows.filter(x=>x.date<today),upcoming:rows.filter(x=>x.date>today)};
 }
 // Recorded payment dates are calendar reminders, NOT evidence of an unpaid debt.
 // Due amount is shown only when a real open statement exists.
 function paymentDateReminders(cards,statements,today){
  const withStatement=new Set((statements||[])
   .filter(s=>s&&s.due_date===today).map(s=>s.card_id));
  const day=Number(today.slice(8,10));
  return (cards||[]).filter(c=>{
   if(!c||(c.card_type||'credit')!=='credit'||(c.status||'active')!=='active'||
     withStatement.has(c.id))return false;
   const saved=[c.current_due_date,c.next_due_date];
   if(saved.some(d=>d===today))return true;
   if(saved.some(d=>typeof d==='string'&&d))return false;
   if(c.display_next_due_date===today)return true;
   return Number(c.due_day)===day;
  }).map(c=>({
   card:c,name:[c.bank||'Kredi kartı',c.nickname||c.last4].filter(Boolean).join(' · '),
   estimated:![c.current_due_date,c.next_due_date].includes(today)
  })).sort((a,b)=>a.name.localeCompare(b.name,'tr'));
 }
 // Days are based on calendar dates, not hours or the device timezone.
 function daysBetween(today,date){
  return Math.round((Date.parse(date+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
 }
 function nextReminder(cards,statements,today){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(today))return null;
  const paidDates=new Set((statements||[]).filter(s=>s&&
   /^\d{4}-\d{2}-\d{2}$/.test(s.due_date)).map(s=>String(s.card_id)+'|'+s.due_date));
  const reminders=[];
  for(const card of cards||[]){
   if(!card||(card.card_type||'credit')!=='credit'||(card.status||'active')!=='active')continue;
   const explicit=[card.current_due_date,card.next_due_date]
    .filter(d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&d>=today)
    .sort()[0];
   let date=explicit,estimated=false;
   if(!date){
    const day=Number(card.due_day);
    const displayed=card.display_next_due_date;
    const displayValid=typeof displayed==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(displayed)&&displayed>=today;
    if(displayValid){date=displayed;estimated=true;}
    else if(Number.isInteger(day)&&day>=1&&day<=31){
     const year=Number(today.slice(0,4)),month=Number(today.slice(5,7));
     date=dayInMonth(year,month,day);
     if(date<today){
      const next=new Date(Date.UTC(year,month,1));
      date=dayInMonth(next.getUTCFullYear(),next.getUTCMonth()+1,day);
     }
     estimated=true;
    }
   }
   if(!date||paidDates.has(String(card.id)+'|'+date))continue;
   reminders.push({card,name:[card.bank||'Kredi kartı',card.nickname||card.last4].filter(Boolean).join(' · '),
    date,days:daysBetween(today,date),estimated,source:'reminder'});
  }
  return reminders.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'tr'))[0]||null;
 }
 function nextPayment(cards,statements,payments,today){
  const grouped=dueCards(statements,payments,cards,today);
  const first=grouped.overdue[0]||grouped.today[0]||grouped.upcoming[0];
  if(first)return {...first,days:daysBetween(today,first.date),source:'statement'};
  return nextReminder(cards,statements,today);
 }
 function renderDue(cards,today){
  const root=document.getElementById('htCardDue41');if(!root)return;
  const data=typeof state!=='undefined'&&state?state:{};
  const first=nextPayment(cards,data.statements||[],data.payments||[],today);
  const title='<strong>Sıradaki kart tarihi</strong>';
  if(!first){
   root.innerHTML=title+'<p>Kayıtlı ödeme tarihi yok.</p>';
   return;
  }
  const relative=first.days<0?Math.abs(first.days)+' gün gecikti':
   first.days===0?'Bugün son ödeme günü':first.days+' gün kaldı';
  const status=first.days<0?' v64-payment-late':'';
  const amount=first.source==='statement'?
   '<p class="v64-payment-amount">Ödenecek kalan tutar: <strong>'+
    esc(typeof cardMoney==='function'?cardMoney(first.amount,first.card):'₺'+(first.amount/100).toFixed(2))+
   '</strong></p>':'';
  root.innerHTML=title+
   '<p class="v64-payment-card">'+esc(first.name)+'</p>'+
   '<div class="v64-payment-meta"><span>Son ödeme: <strong>'+esc(showDate(first.date))+
   '</strong></span><span class="v64-payment-status'+status+'">'+esc(relative)+'</span></div>'+
   amount+(first.source==='statement'?'':'<small>'+
    (first.estimated?'Tahmini ödeme günü':'Tarih hatırlatması')+
    ' · Borç tutarı kayıtlı değil.</small>');
 }
 function render(cards){
  const root=document.getElementById('htCardToday28');if(!root)return;
  const today=typeof trDate==='function'?trDate():new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'}).format(new Date());
  renderDue(cards,today);
  const card=recommend(cards,today);
  if(!card){
   root.innerHTML='<strong>Son kesimi geçen kart</strong><p>Kesimi geçen aktif kart yok.</p>';
   return;
  }
  const label=[card.bank,card.nickname].filter(Boolean).join(' · ');
  root.innerHTML='<strong>Son kesimi geçen kart</strong>'+
   '<p class="ht-card-today-name">'+esc(label)+'</p>'+
   '<small>Kesim: '+esc(showDate(card.last_cutoff))+
   ' · limit değerlendirilmez.</small>';
 }
 window.HTCardToday28={recommend,latestClosing,isCutoffDay,dueCards,paymentDateReminders,nextReminder,nextPayment,renderDue,render};
})();