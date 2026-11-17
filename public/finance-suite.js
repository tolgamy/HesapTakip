'use strict';
// Yeni sekmeler mevcut HesapTakip globals (state, el, api, money, esc) ile çalışır.
let calendarCursor=new Date();
calendarCursor.setUTCDate(1);calendarCursor.setUTCHours(12,0,0,0);
const asDate=s=>new Date(s+'T12:00:00Z');
const fmtDate=s=>s?new Intl.DateTimeFormat('tr-TR',{timeZone:'UTC',year:'numeric',month:'long',day:'numeric'}).format(asDate(s)):'—';
const summation=(xs,k)=>xs.reduce((n,x)=>n+Number(x[k]||0),0);
const accountLabel=a=>(a.type==='bank'?'Banka':'Kasa')+' • '+a.name;
function currentBalance(id) {
 const a=(state.accounts||[]).find(x=>x.id===id);
 if(!a)return 0;
 return a.opening_kurus+(state.entries||[]).filter(x=>x.account_id===id)
  .reduce((n,e)=>n+(e.direction==='in'?e.amount_kurus:-e.amount_kurus),0);
}
function dueList(){
 const dues=[],paid={};
 for(const p of state.payments||[])paid[p.statement_id]=(paid[p.statement_id]||0)+p.amount_kurus;
 for(const s of state.statements||[]){
  const amount=Math.max(0,s.amount_kurus-(paid[s.id]||0));
  if(amount){const c=state.cards.find(x=>x.id===s.card_id);
   dues.push({id:s.id,source:'card',date:s.due_date,name:(c?.bank||'Kart')+' · '+(c?.nickname||s.period),amount});}
 }
 const covered={};
 const moves=(state.firmMovements||[]).slice().sort((a,b)=>a.on_date.localeCompare(b.on_date)||a.id.localeCompare(b.id));
 for(const m of moves)if(m.kind==='settlement')covered[m.firm_id]=(covered[m.firm_id]||0)+m.amount_kurus;
 for(const m of moves)if(m.kind==='charge'&&m.due_date){
  const taken=Math.min(m.amount_kurus,covered[m.firm_id]||0);
  covered[m.firm_id]=(covered[m.firm_id]||0)-taken;
  const amount=m.amount_kurus-taken;
  if(amount){const f=(state.firms||[]).find(x=>x.id===m.firm_id);
   dues.push({id:m.id,source:'firm',date:m.due_date,name:f?.name||'Firma',amount});}
 }
 for(const p of state.instruments||[])if(p.status==='pending')
  dues.push({id:p.id,source:'instrument',date:p.due_date,name:(p.type==='check'?'Çek':'Senet')+' · '+p.party,amount:p.amount_kurus});
 return dues.sort((a,b)=>a.date.localeCompare(b.date));
}
function renderCalendar(){
 const all=dueList(),today=trDate(),upcoming=all.filter(x=>x.date>=today);
 const late=all.filter(x=>x.date<today),soon=upcoming.filter(x=>dayDifference(x.date)<=7);
 el('calendarStats').innerHTML=stat('7 GÜN İÇİNDE',money(summation(soon,'amount')),soon.length+' vade','accent')+
  stat('GECİKMİŞ',money(summation(late,'amount')),late.length+' açık vade','danger')+
  stat('AÇIK VADE SAYISI',String(all.length),all.length+' kayıt');
 const y=calendarCursor.getUTCFullYear(),m=calendarCursor.getUTCMonth();
 const first=new Date(Date.UTC(y,m,1,12)),last=new Date(Date.UTC(y,m+1,0,12));
 el('calendarMonth').textContent=new Intl.DateTimeFormat('tr-TR',{month:'long',year:'numeric',timeZone:'UTC'}).format(first);
 const shift=(first.getUTCDay()+6)%7,count=last.getUTCDate();
 const heads=['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(d=>'<div class="cal-head">'+d+'</div>').join('');
 const days=Array.from({length:shift},()=>'<div class="cal-cell cal-empty"></div>');
 for(let d=1;d<=count;d++){
  const date=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  const items=all.filter(x=>x.date===date),total=summation(items,'amount');
  days.push('<div class="cal-cell'+(date===today?' cal-today':'')+'"><strong>'+d+'</strong>'+
   (items.length?'<small>'+items.length+' vade · '+money(total)+'</small>':'')+'</div>');
 }
 el('calendarGrid').innerHTML=heads+days.join('');
 el('calendarList').innerHTML=all.length?all.slice(0,80).map(x=>{
  const late=x.date<today;
  return '<div class="due-row"><div class="due-logo">₺</div><div class="due-desc"><strong>'+esc(x.name)+'</strong>'+
   '<small>'+fmtDate(x.date)+' · '+esc(x.source==='card'?'Kart':x.source==='firm'?'Firma':'Çek/senet')+'</small></div>'+
   '<div class="due-amount">'+money(x.amount)+(late?'<br><span class="badge danger">Gecikti</span>':'')+'</div></div>';
 }).join(''):'<p class="empty-state">Açık vade kaydı yok.</p>';
}
function renderNotifications(){
 const reminders=state.reminders||[];
 el('notificationRows').innerHTML=reminders.length?reminders.map(r=>'<div class="due-row"><div class="due-logo">'+(r.read_at?'✓':'!')+
  '</div><div class="due-desc"><strong>'+esc(r.subject)+'</strong><small>'+fmtDate(r.due_date)+
  ' · '+(r.offset_days===0?'Bugün':r.offset_days+' gün kala')+' · '+esc(r.generated_at)+'</small></div>'+
  '<div class="due-amount">'+money(r.amount_kurus)+(!r.read_at&&currentRole!=='viewer'?
   '<br><button class="mini-btn" data-reminder-read="'+r.id+'">Okundu</button>':'')+'</div></div>').join(''):
  '<p class="empty-state">Henüz planlanmış hatırlatma yok. Vadesi yaklaşan kayıtları Ödeme takviminde görebilirsiniz.</p>';
}
function renderAccounts(){
 const accounts=state.accounts||[],entries=state.entries||[];
 const total=accounts.reduce((n,a)=>n+currentBalance(a.id),0);
 const income=entries.filter(e=>e.direction==='in'&&e.category==='income');
 const expense=entries.filter(e=>e.direction==='out'&&e.category==='expense');
 el('accountStats').innerHTML=stat('TOPLAM NAKİT / BANKA',money(total),accounts.length+' hesap','accent')+
  stat('KAYITLI GELİR',money(summation(income,'amount_kurus')),income.length+' hareket','accent')+
  stat('KAYITLI GİDER',money(summation(expense,'amount_kurus')),expense.length+' hareket');
 el('accountRows').innerHTML=accounts.length?accounts.map(a=>'<tr><td><strong>'+esc(a.name)+'</strong><br>'+
  '<small>'+esc(a.note||'')+'</small></td><td>'+esc(a.type==='bank'?'Banka':'Kasa')+'</td><td>'+
  money(a.opening_kurus)+'</td><td><strong>'+money(currentBalance(a.id))+'</strong></td><td>'+
  '<div class="row-actions"><button class="mini-btn" data-suite-account-entry="'+a.id+'">Hareket</button>'+
  '<button class="mini-btn delete" data-suite-delete-account="'+a.id+'">Sil</button></div></td></tr>').join(''):
  '<tr><td class="empty" colspan="5">Henüz kasa veya banka hesabı eklenmedi.</td></tr>';
 el('cashEntryRows').innerHTML=entries.length?entries.map(e=>{
  const a=accounts.find(x=>x.id===e.account_id);
  return '<tr><td>'+esc(e.entry_date)+'</td><td>'+esc(a?.name||'—')+'</td><td>'+
   (e.direction==='in'?'Giriş':'Çıkış')+'</td><td>'+esc(e.category==='income'?'Gelir':e.category==='expense'?'Gider':'Diğer')+
   '</td><td><strong>'+money(e.amount_kurus)+'</strong></td><td>'+esc(e.note||'—')+'</td><td>'+
   '<button class="mini-btn delete" data-suite-delete-entry="'+e.id+'">Sil</button></td></tr>';
 }).join(''):'<tr><td class="empty" colspan="7">Hesap hareketi bulunmuyor.</td></tr>';
}
function renderInstruments(){
 const instruments=state.instruments||[];
 const pending=instruments.filter(p=>p.status==='pending');
 const pay=pending.filter(p=>p.direction==='payable'),rec=pending.filter(p=>p.direction==='receivable');
 el('instrumentStats').innerHTML=stat('VERİLEN EVRAK',money(summation(pay,'amount_kurus')),pay.length+' bekleyen','danger')+
  stat('ALINAN EVRAK',money(summation(rec,'amount_kurus')),rec.length+' bekleyen','accent')+
  stat('TOPLAM EVRAK',String(instruments.length),pending.length+' bekleyen');
 const status={pending:'Bekliyor',settled:'Ödendi / Tahsil edildi',returned:'İade',cancelled:'İptal'};
 el('instrumentRows').innerHTML=instruments.length?instruments.map(p=>'<tr><td>'+
   (p.type==='check'?'Çek':'Senet')+'<br><small>'+esc(p.reference||'')+'</small></td><td>'+
   (p.direction==='payable'?'Verilen':'Alınan')+'</td><td><strong>'+esc(p.party)+'</strong></td><td>'+esc(p.due_date)+'</td><td>'+
   money(p.amount_kurus)+'</td><td><span class="badge '+(p.status==='pending'?'warn':p.status==='settled'?'ok':'')+'">'+
   status[p.status]+'</span></td><td><select class="suite-status" data-suite-status="'+p.id+'" '+(currentRole==='viewer'?'disabled':'')+'>'+
   Object.entries(status).map(([key,label])=>'<option value="'+key+'" '+(p.status===key?'selected':'')+'>'+label+'</option>').join('')+
   '</select></td></tr>').join(''):'<tr><td class="empty" colspan="7">Henüz çek veya senet eklenmedi.</td></tr>';
}
function renderReports(){
 const input=el('reportMonth');
 if(!input.value)input.value=monthNow();
 const month=input.value,entries=(state.entries||[]).filter(e=>e.entry_date?.startsWith(month));
 const income=entries.filter(e=>e.direction==='in'&&e.category==='income');
 const expense=entries.filter(e=>e.direction==='out'&&e.category==='expense');
 const inAmount=summation(income,'amount_kurus'),outAmount=summation(expense,'amount_kurus');
 el('reportStats').innerHTML=stat('AYLIK GELİR',money(inAmount),income.length+' hareket','accent')+
  stat('AYLIK GİDER',money(outAmount),expense.length+' hareket')+
  stat('NAKİT FARKI',money(inAmount-outAmount),'Gelir eksi gider',inAmount<outAmount?'danger':'accent');
 el('reportRows').innerHTML=entries.length?entries.map(e=>{
  const acc=state.accounts.find(a=>a.id===e.account_id);
  return '<div class="due-row"><div class="due-logo">'+(e.direction==='in'?'+':'−')+'</div><div class="due-desc"><strong>'+
   esc(acc?.name||'Hesap')+' · '+(e.category==='income'?'Gelir':e.category==='expense'?'Gider':'Diğer')+
   '</strong><small>'+esc(e.entry_date)+' · '+esc(e.note||'')+'</small></div><div class="due-amount">'+money(e.amount_kurus)+'</div></div>';
 }).join(''):'<p class="empty-state">Seçilen ayda nakit hareketi yok.</p>';
}
function searchRecords(){
 const rows=[];
 const add=(type,label,date,details,amount='')=>rows.push({type,label,date:date||'',details:String(details||''),amount:String(amount)});
 for(const c of state.cards||[])add('card',c.bank+' · '+c.nickname,'',c.owner+' '+(c.last4||''));
 for(const s of state.statements||[])add('statement','Ekstre '+s.period,s.due_date,s.note,s.amount_kurus/100);
 for(const f of state.firms||[])add('firm',f.name,'',f.category+' '+f.phone+' '+f.note);
 for(const m of state.firmMovements||[])add('movement','Cari hareket',m.on_date,m.note+' '+m.kind,m.amount_kurus/100);
 for(const e of state.entries||[])add('cash','Kasa / banka hareketi',e.entry_date,e.note+' '+e.category,e.amount_kurus/100);
 for(const p of state.instruments||[])add('paper',(p.type==='check'?'Çek':'Senet')+' · '+p.party,p.due_date,p.reference+' '+p.note,p.amount_kurus/100);
 const term=el('filterTerm').value.trim().toLocaleLowerCase('tr-TR');
 const type=el('filterType').value,from=el('filterStart').value,to=el('filterEnd').value;
 const found=rows.filter(r=>(type==='all'||r.type===type)&&
  (!term||(r.label+' '+r.details+' '+r.amount+' '+r.date).toLocaleLowerCase('tr-TR').includes(term))&&
  (!from||(r.date&&r.date>=from))&&(!to||(r.date&&r.date<=to)));
 el('searchRows').innerHTML='<p class="hint">'+found.length+' kayıt bulundu.</p>'+
  (found.length?found.slice(0,300).map(r=>'<div class="due-row"><div class="due-desc"><strong>'+esc(r.label)+
    '</strong><small>'+esc(r.type)+' · '+esc(r.date||'Tarihsiz')+'</small></div><div class="due-amount">'+esc(r.amount)+'</div></div>').join(''):
    '<p class="empty-state">Eşleşen kayıt bulunamadı.</p>');
}
function renderSecurity(){
 const roles={admin:'Yönetici',staff:'Personel',viewer:'Salt-okunur'};
 el('currentRoleLabel').textContent='Aktif yetki: '+(roles[currentRole]||currentRole);
 const list=state.audit||[];
 el('auditRows').innerHTML=currentRole==='admin'?
  (list.length?list.map(a=>'<div class="due-row"><div class="due-desc"><strong>'+esc(a.method)+' · '+esc(a.entity)+'</strong>'+
   '<small>'+esc(a.occurred_at)+' · '+esc(roles[a.role]||a.role)+'</small></div></div>').join(''):
   '<p class="empty-state">Henüz kayıt işlemi görünmüyor.</p>'):
  '<p class="empty-state">İşlem geçmişini yalnızca yönetici görebilir.</p>';
}
function renderBackups(){
 const runs=state.backupRuns||[];
 el('backupRuns').innerHTML=runs.length?runs.map(r=>'<div class="due-row"><div class="due-desc"><strong>'+
   esc(r.state==='success'?'Özel R2 yedeği hazır':'Yedek girişimi')+'</strong><small>'+
   esc(r.created_at)+' · '+esc(r.object_key||'')+'</small></div></div>').join(''):
   '<p class="empty-state">Bu uygulamadan doğrulanmış özel R2 yedeği yok. Cloudflare D1 Time Travel bağımsızdır.</p>';
}
function renderSuite(){
 renderCalendar();renderNotifications();renderAccounts();renderInstruments();
 renderReports();searchRecords();renderSecurity();renderBackups();
}
