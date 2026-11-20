/* HesapTakip V60 — pure, read-only financial insights. No writes or storage. */
(function(root){
'use strict';
const arr=x=>Array.isArray(x)?x:[];
const num=x=>Number.isFinite(Number(x))?Number(x):0;
const normalize=x=>String(x||'').trim().toLocaleLowerCase('tr-TR');
const inRange=(d,from='',to='')=>!!d&&(!from||d>=from)&&(!to||d<=to);
const dateOk=x=>/^\d{4}-\d{2}-\d{2}$/.test(x||'');
const diff=(a,b)=>Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000);
const currency=c=>c?.currency||'TRY';
function cashBalances(data){
 const sums=new Map(arr(data.accounts).map(a=>[a.id,num(a.opening_kurus)]));
 for(const e of arr(data.entries)){
  if(!sums.has(e.account_id))continue;
  sums.set(e.account_id,sums.get(e.account_id)+(e.direction==='in'?1:-1)*num(e.amount_kurus));
 }
 return arr(data.accounts).map(a=>({...a,balance_kurus:sums.get(a.id)||0}));
}
function firmBalances(data){
 const map=new Map(arr(data.firms).map(f=>[f.id,{...f,charge:0,settled:0,remaining:0}]));
 for(const m of arr(data.firmMovements)){
  const x=map.get(m.firm_id);if(!x)continue;
  if(m.kind==='charge')x.charge+=num(m.amount_kurus);
  if(m.kind==='settlement')x.settled+=num(m.amount_kurus);
  x.remaining=x.charge-x.settled;
 }
 return [...map.values()];
}
function openDues(data,today){
 const paid=new Map();
 for(const p of arr(data.payments))paid.set(p.statement_id,(paid.get(p.statement_id)||0)+num(p.amount_kurus));
 const cardById=new Map(arr(data.cards).map(x=>[x.id,x]));
 const firmById=new Map(arr(data.firms).map(x=>[x.id,x]));
 const dues=[];
 for(const s of arr(data.statements)){
  const amount=Math.max(0,num(s.amount_kurus)-num(paid.get(s.id)));
  if(amount>0&&dateOk(s.due_date)){
   const card=cardById.get(s.card_id);
   dues.push({type:'Kart',id:s.id,date:s.due_date,name:(card?.bank||'Kart')+' · '+(card?.nickname||s.period||''),amount,currency:currency(card),target:'cards'});
  }
 }
 // Allocate settlements to oldest charges, never double count current payable balance.
 const remainingPaid=new Map();
 for(const m of arr(data.firmMovements))if(m.kind==='settlement')
  remainingPaid.set(m.firm_id,(remainingPaid.get(m.firm_id)||0)+num(m.amount_kurus));
 for(const m of [...arr(data.firmMovements)].filter(x=>x.kind==='charge').sort((a,b)=>String(a.on_date).localeCompare(String(b.on_date))||String(a.id).localeCompare(String(b.id)))){
  const used=Math.min(num(m.amount_kurus),remainingPaid.get(m.firm_id)||0);
  remainingPaid.set(m.firm_id,(remainingPaid.get(m.firm_id)||0)-used);
  const amount=num(m.amount_kurus)-used;
  if(amount>0&&dateOk(m.due_date)){
   const firm=firmById.get(m.firm_id);
   dues.push({type:firm?.category==='receivable'?'Alacak':'Firma',id:m.id,date:m.due_date,name:firm?.name||'Firma',amount,currency:'TRY',target:firm?.category==='receivable'?'people':'payables'});
  }
 }
 for(const b of arr(data.bills)){
  const amount=Math.max(0,num(b.amount_kurus)-num(b.paid_kurus));
  if(amount>0&&dateOk(b.due_date))
   dues.push({type:'Fatura',id:b.id,date:b.due_date,name:b.provider||'Fatura',amount,currency:'TRY',target:'bills'});
 }
 for(const p of arr(data.planDues)){
  if(!p.paid_on&&dateOk(p.due_date))
   dues.push({type:'Taksit',id:p.id,date:p.due_date,name:arr(data.paymentPlans).find(x=>x.id===p.plan_id)?.name||'Taksit',amount:num(p.amount_kurus),currency:'TRY',target:'banking'});
 }
 for(const p of arr(data.instruments)){
  if(p.status==='pending'&&dateOk(p.due_date)){
   dues.push({type:p.direction==='receivable'?'Alacak evrakı':'Evrak',id:p.id,date:p.due_date,name:p.party||'Evrak',amount:num(p.amount_kurus),currency:'TRY',target:'instruments'});
  }
 }
 return dues.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'tr'));
}
function duplicateGroups(data){
 const items=[];
 const append=(type,id,container,date,amount,kind,name)=>{
  if(!dateOk(date)||amount<=0||!container)return;
  items.push({type,id,container,date,amount,kind,name});
 };
 for(const p of arr(data.payments))append('Kart ödemesi',p.id,p.statement_id,p.paid_on,num(p.amount_kurus),'payment',p.note||'');
 for(const e of arr(data.entries))append('Kasa/banka',e.id,e.account_id,e.entry_date,num(e.amount_kurus),e.direction,e.note||'');
 for(const m of arr(data.firmMovements))append('Firma hareketi',m.id,m.firm_id,m.on_date,num(m.amount_kurus),m.kind,m.note||'');
 for(const b of arr(data.bills))append('Fatura',b.id,b.provider,b.due_date,num(b.amount_kurus),b.category,b.invoice_no||b.period||'');
 const groups=new Map();
 for(const x of items){
  const key=[x.type,x.container,x.date,x.amount,x.kind,normalize(x.name)].join('|');
  const list=groups.get(key)||[];list.push(x);groups.set(key,list);
 }
 return [...groups.values()].filter(g=>g.length>1);
}
function visitList(data,today){
 if(!dateOk(today))return [];
 const day=new Intl.DateTimeFormat('tr-TR',{timeZone:'UTC',weekday:'long'})
  .format(new Date(today+'T12:00:00Z')).toLocaleLowerCase('tr-TR');
 const companies=new Map(arr(data.directory?.companies).map(x=>[x.id,x]));
 const contacts=arr(data.directory?.contacts).filter(c=>normalize(c.visit_day||companies.get(c.company_id)?.visit_day)===day)
  .map(c=>({name:c.full_name||'Temsilci',company:companies.get(c.company_id)?.name||'Firma',phone:c.phone||'',day}));
 const covered=new Set(contacts.map(c=>normalize(c.company)));
 for(const c of companies.values())
  if(normalize(c.visit_day)===day&&!covered.has(normalize(c.name)))
   contacts.push({name:c.name,company:c.name,phone:c.phone||'',day});
 return contacts;
}
function search(data,opts={}){
 const from=opts.from||'',to=opts.to||'',q=normalize(opts.q),kind=opts.kind||'all';
 const cards=new Map(arr(data.cards).map(c=>[c.id,c]));
 const firms=new Map(arr(data.firms).map(f=>[f.id,f]));
 const accounts=new Map(arr(data.accounts).map(a=>[a.id,a]));
 const statements=new Map(arr(data.statements).map(s=>[s.id,s]));
 const records=[];
 function put(type,id,date,name,details,amount,tag,currency='TRY'){
  if((kind!=='all'&&kind!==type)||!inRange(date,from,to))return;
  const x={type,id,date,name,details,amount,currency,tag};
  if(q&&!normalize([name,details,tag,amount,Number(amount/100).toFixed(2)].join(' ')).includes(q))return;
  records.push(x);
 }
 for(const m of arr(data.firmMovements))put('firm',m.id,m.on_date,firms.get(m.firm_id)?.name||'Firma',m.note||'',num(m.amount_kurus),m.kind);
 for(const e of arr(data.entries))put('cash',e.id,e.entry_date,accounts.get(e.account_id)?.name||'Kasa/Banka',e.note||'',num(e.amount_kurus),e.direction);
 for(const s of arr(data.statements))put('statement',s.id,s.due_date,
  (cards.get(s.card_id)?.bank||'Kart')+' · '+(cards.get(s.card_id)?.last4||''),s.period||'',num(s.amount_kurus),'ekstre',currency(cards.get(s.card_id)));
 for(const p of arr(data.payments)){
  const card=cards.get(statements.get(p.statement_id)?.card_id);
  put('payment',p.id,p.paid_on,(card?.bank||'Kart')+' · '+(card?.last4||''),p.note||'',num(p.amount_kurus),'ödeme',currency(card));
 }
 for(const b of arr(data.bills))put('bill',b.id,b.due_date,b.provider||'Fatura',b.invoice_no||b.note||'',num(b.amount_kurus),'fatura');
 return records.sort((a,b)=>b.date.localeCompare(a.date)||String(a.id).localeCompare(String(b.id)));
}
function monthly(data,today,months=6){
 const out=[];const y=Number(today.slice(0,4)),m=Number(today.slice(5,7));
 for(let i=months-1;i>=0;i--){
  const d=new Date(Date.UTC(y,m-1-i,1)),period=d.toISOString().slice(0,7);
  const rows=arr(data.entries).filter(x=>String(x.entry_date||'').slice(0,7)===period);
  out.push({period,income:rows.filter(x=>x.direction==='in').reduce((n,x)=>n+num(x.amount_kurus),0),
   expense:rows.filter(x=>x.direction==='out').reduce((n,x)=>n+num(x.amount_kurus),0),count:rows.length});
 }
 return out;
}
function issues(data){
 const problems=[];
 const add=(level,code,description)=>problems.push({level,code,description});
 const cardIds=new Set(arr(data.cards).map(x=>x.id));
 const firmIds=new Set(arr(data.firms).map(x=>x.id));
 const accountIds=new Set(arr(data.accounts).map(x=>x.id));
 const stmtIds=new Set(arr(data.statements).map(x=>x.id));
 for(const s of arr(data.statements))if(!cardIds.has(s.card_id))add('error','CARD_LINK','Eşleşmeyen kart ekstresi.');
 for(const p of arr(data.payments))if(!stmtIds.has(p.statement_id))add('error','PAYMENT_LINK','Ekstresine bağlı olmayan ödeme.');
 for(const m of arr(data.firmMovements))if(!firmIds.has(m.firm_id))add('error','FIRM_LINK','Firma kaydı bulunamayan hareket.');
 for(const e of arr(data.entries))if(!accountIds.has(e.account_id))add('error','CASH_LINK','Hesap kaydı bulunamayan kasa/banka hareketi.');
 for(const s of arr(data.statements)){
  const paid=arr(data.payments).filter(p=>p.statement_id===s.id).reduce((n,p)=>n+num(p.amount_kurus),0);
  if(paid>num(s.amount_kurus))add('warn','OVERPAID_STATEMENT','Ekstre tutarından yüksek ödeme kayıtlı.');
 }
 for(const x of cashBalances(data))if(x.balance_kurus<0)add('warn','NEGATIVE_BALANCE',x.name+' hesabı eksi bakiyede.');
 for(const x of firmBalances(data))if(x.category==='payable'&&x.remaining<0)
  add('info','FIRM_CREDIT',x.name+' firmasına fazla ödeme (alacak) var.');
 for(const g of duplicateGroups(data))add('warn','DUPLICATE',g.length+' benzer '+g[0].type.toLocaleLowerCase('tr-TR')+' kaydı.');
 return problems;
}
function summary(data,today){
 const dues=openDues(data,today),balances=cashBalances(data),firms=firmBalances(data);
 const income=arr(data.entries).filter(x=>x.direction==='in').reduce((n,x)=>n+num(x.amount_kurus),0);
 const expense=arr(data.entries).filter(x=>x.direction==='out').reduce((n,x)=>n+num(x.amount_kurus),0);
 return {dues,balances,firms,income,expense,duplicates:duplicateGroups(data),issues:issues(data),
  dueToday:dues.filter(x=>x.date===today),overdue:dues.filter(x=>x.date<today),
  next7:dues.filter(x=>x.date>=today&&diff(x.date,today)<=7),
  visits:visitList(data,today),monthly:monthly(data,today),records:search(data)};
}
root.HTV60Core={cashBalances,firmBalances,openDues,duplicateGroups,visitList,search,monthly,issues,summary,diff};
})(typeof window!=='undefined'?window:globalThis);