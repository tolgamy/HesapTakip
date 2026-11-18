'use strict';
// HesapTakip V6: pure overview calculation, safe from double-counting card statements.
// Amounts are integer kuruş; foreign currencies are kept separate and never converted implicitly.
function computeFinancialOverview(data) {
  const cards=data.cards||[],statements=data.statements||[],payments=data.payments||[],
    firms=data.firms||[],firmMovements=data.firmMovements||[],accounts=data.accounts||[],
    entries=data.entries||[],instruments=data.instruments||[],reminders=data.reminders||[];
  const paymentByStatement=new Map();
  for(const p of payments)paymentByStatement.set(p.statement_id,(paymentByStatement.get(p.statement_id)||0)+p.amount_kurus);
  const statementByCard=new Map();
  const openStatements=[];
  for(const s of statements){
    const left=Math.max(0,s.amount_kurus-(paymentByStatement.get(s.id)||0));
    statementByCard.set(s.card_id,(statementByCard.get(s.card_id)||0)+left);
    if(left)openStatements.push({...s,left});
  }
  const currencies=new Map(),cardItems=[];
  for(const c of cards){
    // Banka kartları ve POS/yemek kartı hesapları kredi borcuna katılmaz.
    // Eski, tipi boş kart kayıtları geriye uyumluluk için kredi kartı sayılır.
    if(c.card_type==='debit'||c.card_type==='pos')continue;
    const completeLimit=Number.isSafeInteger(c.credit_limit_kurus)&&
      Number.isSafeInteger(c.available_limit_kurus)&&c.credit_limit_kurus>=c.available_limit_kurus;
    const debt=completeLimit?c.credit_limit_kurus-c.available_limit_kurus:statementByCard.get(c.id)||0;
    const currency=c.currency||'TRY';
    currencies.set(currency,(currencies.get(currency)||0)+debt);
    cardItems.push({card:c,debt,method:completeLimit?'limit':'statement',
      hasLimit:completeLimit,currency});
  }
  const firmById=new Map(firms.map(f=>[f.id,f]));
  const firmTotals={payable:0,receivable:0},firmItems=new Map();
  let supplierCredit=0;
  for(const f of firms)firmItems.set(f.id,{firm:f,charges:0,settled:0,remaining:0});
  for(const m of firmMovements){
    const obj=firmItems.get(m.firm_id);
    if(!obj)continue;
    if(m.kind==='charge')obj.charges+=m.amount_kurus;
    else if(m.kind==='settlement')obj.settled+=m.amount_kurus;
  }
  for(const item of firmItems.values()){
    item.remaining=item.charges-item.settled;
    const category=firmById.get(item.firm.id)?.category;
    if(category==='payable'){
      firmTotals.payable+=Math.max(0,item.remaining);
      supplierCredit+=Math.max(0,-item.remaining);
    }else if(category==='receivable')firmTotals.receivable+=item.remaining;
  }
  const balanceByAccount=new Map(accounts.map(a=>[a.id,Number(a.opening_kurus)||0]));
  let income=0,expenses=0;
  for(const e of entries){
    balanceByAccount.set(e.account_id,(balanceByAccount.get(e.account_id)||0)+
      (e.direction==='in'?e.amount_kurus:-e.amount_kurus));
    if(e.direction==='in'&&e.category==='income')income+=e.amount_kurus;
    if(e.direction==='out'&&e.category==='expense')expenses+=e.amount_kurus;
  }
  const cashBalance=[...balanceByAccount.values()].reduce((n,v)=>n+v,0);
  const pending=instruments.filter(x=>x.status==='pending');
  const checkPayable=pending.filter(x=>x.direction==='payable').reduce((n,x)=>n+x.amount_kurus,0);
  const checkReceivable=pending.filter(x=>x.direction==='receivable').reduce((n,x)=>n+x.amount_kurus,0);
  const cardDebtTry=currencies.get('TRY')||0;
  const netDebt=cardDebtTry+firmTotals.payable-firmTotals.receivable-supplierCredit;
  const recent=[
    ...firmMovements.map(m=>({date:m.on_date,kind:'Firma',name:firmById.get(m.firm_id)?.name||'Firma',
      note:m.kind==='charge'?'Borç / alacak':'Ödeme / tahsilat',amount:m.amount_kurus})),
    ...entries.map(e=>({date:e.entry_date,kind:'Kasa / banka',name:accounts.find(a=>a.id===e.account_id)?.name||'Hesap',
      note:e.direction==='in'?'Giriş':'Çıkış',amount:e.amount_kurus})),
    ...payments.map(p=>({date:p.paid_on,kind:'Kart ödemesi',name:cards.find(c=>
      statements.some(s=>s.id===p.statement_id&&s.card_id===c.id))?.bank||'Kart',
      note:'Ekstre ödemesi',amount:p.amount_kurus}))
  ].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);
  return {
    netDebt,cardDebtTry,firmPayable:firmTotals.payable,firmReceivable:firmTotals.receivable,
    supplierCredit,
    cashBalance,netCashPosition:cashBalance-netDebt,checkPayable,checkReceivable,
    income,expenses,cardItems,firmItems:[...firmItems.values()],currencies,
    openStatements,recent,
    cardsCount:cardItems.length,firmsCount:firms.length,accountsCount:accounts.length,
    instrumentsCount:pending.length,remindersCount:reminders.filter(r=>!r.read_at).length
  };
}
window.computeFinancialOverview=computeFinancialOverview;
