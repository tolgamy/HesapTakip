'use strict';
// Yeni sekmeler mevcut HesapTakip globals (state, el, api, money, esc) ile çalışır.
let calendarCursor=new Date();
calendarCursor.setUTCDate(1);calendarCursor.setUTCHours(12,0,0,0);
const asDate=s=>new Date(s+'T12:00:00Z');
const fmtDate=s=>s?showDate(s):'—';
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
   dues.push({id:s.id,source:'card',date:s.due_date,name:(c?.bank||'Kart')+' · '+(c?.nickname||s.period),amount,currency:c?.currency||'TRY'});}
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
 for(const card of state.cards||[]){
  if((card.status||'active')!=='active'||card.reminder_enabled===0)continue;
  const cutoff=card.display_next_statement_date||card.estimated_statement_date;
  const due=card.display_next_due_date||card.estimated_due_date;
  if(cutoff)dues.push({id:card.id+'cut',source:'card_cutoff',date:cutoff,
    name:'Tahmini kesim: '+card.bank+' · '+card.nickname,amount:0,currency:card.currency||'TRY'});
  if(due&&!dues.some(x=>x.source==='card'&&x.date===due&&x.name.includes(card.nickname)))
    dues.push({id:card.id+'due',source:'card_due',date:due,
      name:'Tahmini ödeme: '+card.bank+' · '+card.nickname,amount:0,currency:card.currency||'TRY'});
 }
 return dues.sort((a,b)=>a.date.localeCompare(b.date));
}
function renderCalendar(){
 const all=dueList(),today=trDate(),upcoming=all.filter(x=>x.date>=today);
 const late=all.filter(x=>x.date<today),soon=upcoming.filter(x=>dayDifference(x.date)<=7);
 const inTry=items=>items.filter(x=>!x.currency||x.currency==='TRY');
 el('calendarStats').innerHTML=stat('7 GÜN İÇİNDE',money(summation(inTry(soon),'amount')),soon.length+' vade','accent')+
  stat('GECİKMİŞ',money(summation(inTry(late),'amount')),late.length+' açık vade','danger')+
  stat('AÇIK VADE SAYISI',String(all.length),all.length+' kayıt');
 const y=calendarCursor.getUTCFullYear(),m=calendarCursor.getUTCMonth();
 const first=new Date(Date.UTC(y,m,1,12)),last=new Date(Date.UTC(y,m+1,0,12));
 el('calendarMonth').textContent=new Intl.DateTimeFormat('tr-TR',{month:'long',year:'numeric',timeZone:'UTC'}).format(first);
 const shift=(first.getUTCDay()+6)%7,count=last.getUTCDate();
 const heads=['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(d=>'<div class="cal-head">'+d+'</div>').join('');
 const days=Array.from({length:shift},()=>'<div class="cal-cell cal-empty"></div>');
 for(let d=1;d<=count;d++){
  const date=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  const items=all.filter(x=>x.date===date),total=summation(inTry(items),'amount');
  days.push('<div class="cal-cell'+(date===today?' cal-today':'')+'"><strong>'+d+'</strong>'+
   (items.length?'<small>'+items.length+' vade · '+money(total)+'</small>':'')+'</div>');
 }
 el('calendarGrid').innerHTML=heads+days.join('');
 el('calendarList').innerHTML=all.length?all.slice(0,80).map(x=>{
  const late=x.date<today;
  return '<div class="due-row"><div class="due-logo">₺</div><div class="due-desc"><strong>'+esc(x.name)+'</strong>'+
   '<small>'+fmtDate(x.date)+' · '+esc(x.source==='card'?'Kart':x.source==='firm'?'Firma':'Çek/senet')+'</small></div>'+
   '<div class="due-amount">'+cardMoney(x.amount,{currency:x.currency||'TRY'})+(late?'<br><span class="badge danger">Gecikti</span>':'')+'</div></div>';
 }).join(''):'<p class="empty-state">Açık vade kaydı yok.</p>';
}
function renderNotifications(){
 const reminders=state.reminders||[];
 el('notificationRows').innerHTML=reminders.length?reminders.map(r=>'<div class="due-row"><div class="due-logo">'+(r.read_at?'✓':'!')+
  '</div><div class="due-desc"><strong>'+esc(r.subject)+'</strong><small>'+fmtDate(r.due_date)+
  ' · '+(r.offset_days===0?'Bugün':r.offset_days+' gün kala')+' · '+esc(showDate(r.generated_at))+'</small></div>'+
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
  return '<tr><td>'+esc(showDate(e.entry_date))+'</td><td>'+esc(a?.name||'—')+'</td><td>'+
   (e.direction==='in'?'Giriş':'Çıkış')+'</td><td>'+esc(e.category==='income'?'Gelir':e.category==='expense'?'Gider':'Diğer')+
   '</td><td><strong>'+money(e.amount_kurus)+'</strong></td><td>'+esc(e.note||'—')+'</td><td>'+
   '<div class="row-actions"><button class="mini-btn" data-suite-edit-entry="'+e.id+'">Düzenle</button>'+
    '<button class="mini-btn delete" data-suite-delete-entry="'+e.id+'">Sil</button></div></td></tr>';
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
   (p.direction==='payable'?'Verilen':'Alınan')+'</td><td><strong>'+esc(p.party)+'</strong></td><td>'+esc(showDate(p.due_date))+'</td><td>'+
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
   '</strong><small>'+esc(showDate(e.entry_date))+' · '+esc(e.note||'')+'</small></div><div class="due-amount">'+money(e.amount_kurus)+'</div></div>';
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
    '</strong><small>'+esc(r.type)+' · '+esc(showDate(r.date)||'Tarihsiz')+'</small></div><div class="due-amount">'+esc(r.amount)+'</div></div>').join(''):
    '<p class="empty-state">Eşleşen kayıt bulunamadı.</p>');
}
function renderSecurity(){
 const roles={admin:'Yönetici',staff:'Personel',viewer:'Salt-okunur'};
 el('currentRoleLabel').textContent='Aktif yetki: '+(roles[currentRole]||currentRole);
 const list=state.audit||[];
 el('auditRows').innerHTML=currentRole==='admin'?
  (list.length?list.map(a=>'<div class="due-row"><div class="due-desc"><strong>'+esc(a.method)+' · '+esc(a.entity)+'</strong>'+
   '<small>'+esc(showDate(a.occurred_at))+' · '+esc(roles[a.role]||a.role)+'</small></div></div>').join(''):
   '<p class="empty-state">Henüz kayıt işlemi görünmüyor.</p>'):
  '<p class="empty-state">İşlem geçmişini yalnızca yönetici görebilir.</p>';
}
function renderBackups(){
 const runs=state.backupRuns||[];
 el('backupRuns').innerHTML=runs.length?runs.map(r=>'<div class="due-row"><div class="due-desc"><strong>'+
   esc(r.state==='success'?'Özel R2 yedeği hazır':'Yedek girişimi')+'</strong><small>'+
   esc(showDate(r.created_at))+' · '+esc(r.object_key||'')+'</small></div></div>').join(''):
   '<p class="empty-state">Bu uygulamadan doğrulanmış özel R2 yedeği yok. Cloudflare D1 Time Travel bağımsızdır.</p>';
}
function renderSuite(){
 renderCalendar();renderNotifications();renderAccounts();renderInstruments();
 renderReports();searchRecords();renderSecurity();renderBackups();
}


function suiteField(name,label,type='text',value='',attrs='required') {
 return '<div><label for="suite-'+name+'">'+esc(label)+'</label><input id="suite-'+name+'" name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+attrs+'></div>';
}
function suiteSelect(name,label,options,selected=''){
 return '<div><label for="suite-'+name+'">'+esc(label)+'</label><select id="suite-'+name+'" name="'+name+'" required>'+
 options.map(x=>'<option value="'+esc(x.value)+'" '+(x.value===selected?'selected':'')+'>'+esc(x.label)+'</option>').join('')+'</select></div>';
}
function suiteNote(value='') {return '<div><label for="suite-note">Açıklama</label><textarea id="suite-note" maxlength="280" name="note">'+esc(value)+'</textarea></div>';}
// Existing active banks and payment institutions are selectable; no fake account is created.
// Bankalar and POS Bankalar have separate account identities but share a bank institution.
function bankInstitutionSelect(selected='',selectedIsPos=false){
 const institutions=(state.institutions||[]).filter(i=>
    (i.is_active&&(!window.HTCatalog21||window.HTCatalog21.isInstitutionAllowed(i)))||i.id===selected)
    .filter((i,index,all)=>i.id===selected||all.findIndex(other=>
      other.name.trim().normalize('NFKC').toLocaleLowerCase('tr-TR')===
      i.name.trim().normalize('NFKC').toLocaleLowerCase('tr-TR'))===index);
 const banks=institutions.filter(i=>i.type==='bank');
 const posBanks=institutions.filter(i=>i.type==='bank'||i.type==='payment');
 const opts=(rows,isPos)=>rows.map(i=>{
    const code=(isPos?'pos:':'')+i.id;
    const label=i.id==='garanti-odeme'&&isPos?'Tami POS':i.name+(isPos?' POS':'');
    const activeSelected=selected===i.id&&(selectedIsPos||i.type==='payment')===isPos;
    return '<option value="'+esc(code)+'"'+(activeSelected?' selected':'')+'>'+esc(label)+'</option>';
  }).join('');
 return '<div class="v20-institution-choice">'+
  '<label for="suite-bank-search">Banka / POS Bankalar ara</label>'+
  '<input id="suite-bank-search" type="search" placeholder="Yapı Kredi POS, QNB POS, Akbank..." autocomplete="off">'+
  '<label for="suite-institution_id">Bankalar ve POS Bankalar</label>'+
  '<select name="institution_id" id="suite-institution_id">'+
    '<option value="">+ Manuel / özel banka veya POS hesabı</option>'+
    '<optgroup label="Bankalar">'+opts(banks,false)+'</optgroup>'+
    '<optgroup label="POS Bankalar">'+opts(posBanks,true)+'</optgroup></select>'+
  '<p class="hint">Yapı Kredi ve Yapı Kredi POS iki ayrı hesap olabilir; kuruluş adı çoğaltılmaz.</p></div>';
}
window.HTBankInstitutionSelect=bankInstitutionSelect;
function v24PosTypeSelect(selected=false){
 return '<div class="v24-pos-type"><label for="suite-is-pos">Hesap kullanım türü</label>'+
  '<select name="is_pos" id="suite-is-pos">'+
   '<option value="0"'+(!selected?' selected':'')+'>Normal banka hesabı</option>'+
   '<option value="1"'+(selected?' selected':'')+'>Sanal POS / POS hesabı</option></select>'+
  '<p class="hint">Bir bankayı hem normal hesap hem de ayrı POS hesabı olarak kullanabilirsin.</p></div>';
}
window.HTPOSAccountTypeSelect=v24PosTypeSelect;
const v24FeaturedPOS=[
 ['paytr','PayTR Sanal POS'],['iyzico','iyzico Sanal POS'],
 ['garanti-odeme','Tami Sanal POS'],['akbank','Akbank Sanal POS'],
 ['qnb','QNB POS'],['yapikredi','Yapı Kredi POS'],['enpara','Enpara POS']
];
function v24PosPresets(){
 const active=(state.institutions||[]).filter(i=>i.is_active&&
  (!window.HTCatalog21||window.HTCatalog21.isInstitutionAllowed(i)));
 return '<div class="v24-pos-presets"><label>Hızlı sanal POS hesabı seç</label>'+
  '<div class="v24-pos-preset-list">'+v24FeaturedPOS.filter(([id])=>active.some(i=>i.id===id))
  .map(([id,name])=>'<button type="button" class="mini-btn" data-v24-pos-preset="'+esc(id)+'">'+
    esc(name)+'</button>').join('')+'</div></div>';
}
function wireBankInstitutionSearch(form,prefix='suite'){
 const list=form.elements.institution_id;
 const input=form.querySelector('#suite-bank-search');
 if(!list||!input)return;
 const all=Array.from(list.options).map(o=>({value:o.value,name:o.textContent,group:o.parentElement?.label||''}));
 const refresh=()=>{
   const current=list.value,term=input.value.trim().toLocaleLowerCase('tr-TR');
   const choices=all.filter(o=>!term||!o.value||(o.name+' '+o.group+
     ' '+((state.institutions||[]).find(i=>i.id===o.value.replace(/^pos:/,''))?.search_keywords||''))
     .toLocaleLowerCase('tr-TR').includes(term));
   list.innerHTML='<option value="">+ Manuel / özel banka hesabı</option>'+
     choices.filter(o=>o.value).map(o=>'<option value="'+esc(o.value)+'">'+esc(o.name)+'</option>').join('');
   if(choices.some(o=>o.value===current))list.value=current;
   else if(term&&choices.filter(o=>o.value).length===1)list.value=choices.find(o=>o.value).value;
 };
 input.addEventListener('input',refresh);
 list.addEventListener('change',()=>{
  if(list.value){
    const isPos=list.value.startsWith('pos:');
    if(form.elements.is_pos)form.elements.is_pos.value=isPos?'1':'0';
    const inst=(state.institutions||[]).find(i=>i.id===list.value.replace(/^pos:/,''));
    if(inst&&form.elements.name&&!form.elements.name.dataset.manual)
      form.elements.name.value=inst.name+(isPos?' POS':'');
  }
 });
 form.elements.name?.addEventListener('input',()=>{form.elements.name.dataset.manual='1';});
}
function openSuiteForm(type,id='',options={}) {
 if(currentRole==='viewer') {notice('Salt-okunur hesap ile işlem yapılamaz.',true);return;}
 const account=(state.accounts||[]).find(a=>a.id===id);
 let title='',fields='';
 if(type==='account'){
  title='Kasa / banka hesabı ekle';
  fields=suiteSelect('type','Tür',[{value:'bank',label:'Banka / ödeme kuruluşu'},{value:'cash',label:'Nakit kasa'}],'bank')+
   bankInstitutionSelect()+
   v24PosTypeSelect()+
   v24PosPresets()+
   suiteField('name','Hesap adı / takma adı','text','','required maxlength="100"')+
   suiteField('opening','Açılış bakiyesi (₺)','number','0','required min="0" step="0.01"')+suiteNote();
 }else if(type==='entry'){
  if(!account){notice('Hesap bulunamadı.',true);return;}
  title='Kasa / banka hareketi';
  fields='<p class="muted">'+esc(account.name)+' · Bakiye '+money(currentBalance(id))+'</p>'+
   suiteSelect('direction','İşlem yönü',[{value:'in',label:'Para girişi'},{value:'out',label:'Para çıkışı'}],options.direction==='out'?'out':'in')+
   suiteSelect('category','Kategori',[{value:'income',label:'Gelir'},{value:'expense',label:'Gider'},{value:'other',label:'Diğer'}],options.direction==='out'?'expense':'income')+
   suiteField('amount','Tutar (₺)','number','','required min="0.01" step="0.01"')+
   suiteField('date','İşlem tarihi','date',trDate())+suiteNote();
 }else if(type==='instrument'){
  title='Çek / senet kaydet';
  fields=suiteSelect('type','Evrak türü',[{value:'check',label:'Çek'},{value:'note',label:'Senet'}])+
   suiteSelect('direction','İşlem yönü',[{value:'payable',label:'Verilen (borç)'},{value:'receivable',label:'Alınan (alacak)'}])+
   suiteField('party','Firma / kişi','text','','required maxlength="120"')+
   suiteField('reference','Evrak numarası (isteğe bağlı)','text','','maxlength="70"')+
   suiteField('amount','Tutar (₺)','number','','required min="0.01" step="0.01"')+
   suiteField('issueDate','Düzenlenme tarihi','date',trDate())+
   suiteField('dueDate','Vade','date',trDate())+suiteNote();
 }else return;
 el('modalTitle').textContent=title;
 el('modalContents').innerHTML='<form id="suiteForm" class="modal-form">'+fields+
  '<div class="form-actions"><button class="btn subtle" id="suiteCancel" type="button">Vazgeç</button>'+
  '<button class="btn primary" type="submit">Kaydet</button></div></form>';
 el('suiteCancel').onclick=()=>el('modal').close();
 if(type==='account'){
   const form=el('suiteForm');wireBankInstitutionSearch(form);
   const setType=()=>{
    const bank=form.elements.type.value==='bank';
    form.querySelector('.v20-institution-choice').hidden=!bank;
    form.querySelector('.v24-pos-type').hidden=!bank;
    form.querySelector('.v24-pos-presets').hidden=!bank;
    if(!bank)form.elements.is_pos.value='0';
   };
   form.elements.type.addEventListener('change',setType);setType();
   const usePreset=(id,label)=>{
    form.elements.type.value='bank';setType();
    const inst=(state.institutions||[]).find(i=>i.id===id);
    const select=form.elements.institution_id;
    if(inst&&[...select.options].some(o=>o.value==='pos:'+inst.id))select.value='pos:'+inst.id;
    form.elements.is_pos.value='1';
    form.elements.name.value=label;
    delete form.elements.name.dataset.manual;
   };
   form.querySelectorAll('[data-v24-pos-preset]').forEach(button=>
    button.addEventListener('click',()=>usePreset(button.dataset.v24PosPreset,button.textContent.trim())));
   form.elements.is_pos.addEventListener('change',()=>{
    const was=form.elements.institution_id.value.replace(/^pos:/,'');
    const selected=(state.institutions||[]).find(i=>i.id===was);
    const pos=form.elements.is_pos.value==='1';
    if(selected){
      const key=(pos?'pos:':'')+selected.id;
      if([...form.elements.institution_id.options].some(o=>o.value===key))
        form.elements.institution_id.value=key;
      if(!form.elements.name.dataset.manual)
        form.elements.name.value=selected.name+(pos?' POS':'');
    }
   });
 }
 el('suiteForm').onsubmit=async event=>{
  event.preventDefault();
  const b=event.currentTarget.querySelector('[type="submit"]');b.disabled=true;
  const d=Object.fromEntries(new FormData(event.currentTarget));
  try{
   if(type==='account')await api('accounts','POST',{
     name:d.name,type:d.type,opening_kurus:amountValue(d.opening),note:d.note||'',
     institution_id:d.type==='bank'?(d.institution_id||'').replace(/^pos:/,'')||null:null,
     is_pos:d.type==='bank'?(d.institution_id||'').startsWith('pos:')||d.is_pos==='1':false});
   if(type==='entry')await api('entries','POST',{
     account_id:id,direction:d.direction,category:d.category,amount_kurus:amountValue(d.amount),
     entry_date:d.date,note:d.note||''});
   if(type==='instrument')await api('instruments','POST',{
     type:d.type,direction:d.direction,party:d.party,reference:d.reference||'',
     amount_kurus:amountValue(d.amount),issue_date:d.issueDate,due_date:d.dueDate,note:d.note||''});
   el('modal').close();await load();notice('Kayıt oluşturuldu.');
  }catch(e){notice(e.message,true);}finally{b.disabled=false;}
 };
 el('modal').showModal();
}
async function suiteDelete(path){
 if(currentRole==='viewer'){notice('Salt-okunur kullanıcı kayıt silemez.',true);return;}
 if(!confirm('Bu kaydı silmek istediğinize emin misiniz?'))return;
 try{await api(path,'DELETE');await load();notice('Kayıt silindi.');}catch(e){notice(e.message,true);}
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-suite-action],[data-suite-account-entry],[data-suite-delete-account],'+
 '[data-suite-delete-entry],[data-reminder-read]');
 if(!b)return;
 if(b.dataset.suiteAction)openSuiteForm(b.dataset.suiteAction);
 else if(b.dataset.suiteAccountEntry)openSuiteForm('entry',b.dataset.suiteAccountEntry);
 else if(b.dataset.suiteDeleteAccount)suiteDelete('accounts/'+b.dataset.suiteDeleteAccount);
 else if(b.dataset.suiteDeleteEntry)suiteDelete('entries/'+b.dataset.suiteDeleteEntry);
 else if(b.dataset.reminderRead){
   if(currentRole==='viewer')return;
   api('reminders/'+b.dataset.reminderRead+'/read','POST',{}).then(load).catch(x=>notice(x.message,true));
 }
});
document.addEventListener('change',e=>{
 const elTarget=e.target;
 if(elTarget.matches('.suite-status')){
  if(currentRole==='viewer')return;
  api('instruments/'+elTarget.dataset.suiteStatus,'PATCH',{status:elTarget.value})
   .then(load).catch(err=>{notice(err.message,true);load().catch(()=>{});});
 }
});
el('calendarPrev').addEventListener('click',()=>{calendarCursor.setUTCMonth(calendarCursor.getUTCMonth()-1);renderCalendar();});
el('calendarNext').addEventListener('click',()=>{calendarCursor.setUTCMonth(calendarCursor.getUTCMonth()+1);renderCalendar();});
el('reportMonth').addEventListener('change',renderReports);
for(const id of ['filterTerm','filterType','filterStart','filterEnd'])el(id).addEventListener('input',searchRecords);
el('backupDownloadBtn').addEventListener('click',()=>{if(currentRole!=='viewer')exportData();});
window.openSuiteForm=openSuiteForm;
