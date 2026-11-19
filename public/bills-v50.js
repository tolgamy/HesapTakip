'use strict';
// V50 - business utility invoice management. Existing firm movements stay intact.
(function(){
 const view=el('billsView');if(!view)return;
 const categoryNames={electricity:'Elektrik',gas:'Doğalgaz',water:'Su',phone:'Telefon',
  internet:'İnternet',other:'Diğer'};
 const canEdit=()=>window.HTIdentity?.role==='admin';
 const bills=()=>Array.isArray(state.bills)?state.bills:[];
 const safe=v=>esc(String(v??''));
 const amountText=n=>(Number(n||0)/100).toFixed(2).replace('.',',');
 const status=b=>{
  if(b.paid_kurus>=b.amount_kurus)return {id:'paid',label:'Ödendi'};
  if(b.due_date<trDate())return {id:'overdue',label:'Gecikti'};
  if(b.paid_kurus>0)return {id:'partial',label:'Kısmi ödendi'};
  return {id:'pending',label:'Bekliyor'};
 };
 const monthLater=v=>{
  const [year,month]=String(v).slice(0,7).split('-').map(Number);
  const d=new Date(Date.UTC(year,month,1));
  const period=d.toISOString().slice(0,7);
  if(String(v).length===7)return period;
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  return period+'-'+String(Math.min(Number(String(v).slice(8,10)),last)).padStart(2,'0');
 };
 function filtered(){
  const q=String(el('v50BillSearch').value||'').toLocaleLowerCase('tr-TR').trim();
  const category=el('v50BillCategory').value,statusId=el('v50BillStatus').value,
   period=el('v50BillPeriod').value;
  return bills().filter(b=>
   (!q||[b.provider,b.subscription_no,b.invoice_no,b.note,categoryNames[b.category]]
     .join(' ').toLocaleLowerCase('tr-TR').includes(q))&&
   (category==='all'||b.category===category)&&
   (statusId==='all'||status(b).id===statusId)&&
   (!period||b.period===period)
  ).sort((a,b)=>a.due_date.localeCompare(b.due_date)||a.provider.localeCompare(b.provider,'tr'));
 }
 function render(){
  const all=bills(),rows=filtered(),open=all.reduce((s,b)=>s+Math.max(0,b.amount_kurus-b.paid_kurus),0),
   overdue=all.filter(b=>status(b).id==='overdue'),
   dueSoon=all.filter(b=>b.paid_kurus<b.amount_kurus&&b.due_date>=trDate()&&dayDifference(b.due_date)<=7);
  el('v50BillStats').innerHTML=[
   ['Açık fatura tutarı',money(open)],['Geciken faturalar',String(overdue.length)],
   ['7 gün içinde',String(dueSoon.length)],['Toplam fatura',String(all.length)]
  ].map(([label,value])=>'<article class="v50-stat"><span>'+safe(label)+
   '</span><strong>'+safe(value)+'</strong></article>').join('');
  el('v50BillCount').textContent=rows.length+' fatura';
  el('v50BillList').innerHTML=rows.length?rows.map(b=>{
   const s=status(b),remaining=b.amount_kurus-b.paid_kurus;
   return '<article class="v50-bill-item"><div class="v50-bill-main"><div class="v50-bill-header">'+
    '<strong>'+safe(b.provider)+'</strong><span class="v50-bill-pill v50-'+s.id+'">'+s.label+'</span></div>'+
    '<small>'+safe(categoryNames[b.category]||'Diğer')+' · '+safe(showMonth(b.period))+
    ' · Son ödeme: '+safe(showDate(b.due_date))+'</small>'+
    (b.subscription_no?'<small>Abonelik: '+safe(b.subscription_no)+'</small>':'')+
    (b.invoice_no?'<small>Fatura no: '+safe(b.invoice_no)+'</small>':'')+
    (b.note?'<small>'+safe(b.note)+'</small>':'')+'</div>'+
    '<div class="v50-bill-values"><strong>'+money(b.amount_kurus)+'</strong>'+
    '<small>Ödenen '+money(b.paid_kurus)+'</small>'+
    '<small>Kalan '+money(remaining)+'</small></div>'+
    (canEdit()?'<div class="v50-bill-actions">'+
     '<button type="button" class="mini-btn" data-v50-edit="'+safe(b.id)+'">Düzenle</button>'+
     '<button type="button" class="mini-btn" data-v50-next="'+safe(b.id)+'">Sonraki ay</button>'+
     '<button type="button" class="mini-btn delete" data-v50-delete="'+safe(b.id)+'">Sil</button></div>':'')+
    '</article>';
  }).join(''):'<p class="v50-empty muted">Bu filtrede fatura yok. Yeni fatura ekleyerek başlayabilirsin.</p>';
 }
 function form(record=null,copy=false){
  if(!canEdit()){notice('Fatura düzenleme yetkisi yalnızca yöneticidedir.',true);return;}
  const d=record||{},newRecord=!record||copy,id=newRecord?'':d.id;
  const values={...d,category:d.category||'electricity',period:copy?monthLater(d.period):d.period||monthNow(),
   issue_date:copy?monthLater(d.issue_date):d.issue_date||trDate(),
   due_date:copy?monthLater(d.due_date):d.due_date||trDate(),
   amount_kurus:d.amount_kurus||0,paid_kurus:copy?0:(d.paid_kurus||0),
   paid_on:copy?'':d.paid_on||''};
  el('modalTitle').textContent=copy?'Sonraki ayın faturasını ekle':id?'Faturayı düzenle':'Yeni fatura';
  const options=Object.entries(categoryNames).map(([key,label])=>
   '<option value="'+key+'" '+(values.category===key?'selected':'')+'>'+label+'</option>').join('');
  el('modalContents').innerHTML='<form id="v50BillForm" class="modal-form">'+
   '<label>Fatura türü<select name="category" required>'+options+'</select></label>'+
   '<label>Kurum / sağlayıcı<input name="provider" maxlength="120" required value="'+safe(values.provider||'')+'" placeholder="Örn. İSKİ, İGDAŞ, elektrik şirketi"></label>'+
   '<label>Abonelik numarası (isteğe bağlı)<input name="subscription_no" maxlength="120" value="'+safe(values.subscription_no||'')+'"></label>'+
   '<label>Fatura numarası (isteğe bağlı)<input name="invoice_no" maxlength="120" value="'+safe(values.invoice_no||'')+'"></label>'+
   '<label>Fatura dönemi<input type="month" name="period" required value="'+safe(values.period)+'"></label>'+
   '<label>Fatura tarihi<input type="date" name="issue_date" required value="'+safe(values.issue_date)+'"></label>'+
   '<label>Son ödeme tarihi<input type="date" name="due_date" required value="'+safe(values.due_date)+'"></label>'+
   '<label>Fatura tutarı (₺)<input type="text" inputmode="decimal" name="amount" required value="'+safe(values.amount_kurus?amountText(values.amount_kurus):'')+'" placeholder="Örn. 1250,50"></label>'+
   '<label>Ödenen tutar (₺)<input type="text" inputmode="decimal" name="paid" value="'+safe(values.paid_kurus?amountText(values.paid_kurus):'0,00')+'" placeholder="0,00"></label>'+
   '<label>Ödeme tarihi (ödeme varsa)<input type="date" name="paid_on" value="'+safe(values.paid_on)+'"></label>'+
   '<label>Not<textarea name="note" maxlength="500" rows="2">'+safe(values.note||'')+'</textarea></label>'+
   '<p class="hint">Kısmi ödeme girebilirsin. Bu kayıt banka/kasa bakiyesini otomatik değiştirmez.</p>'+
   '<div class="form-actions"><button type="button" class="btn subtle" id="v50Cancel">Vazgeç</button>'+
   '<button type="submit" class="btn primary">Kaydet</button></div></form>';
  el('modal').showModal();el('v50Cancel').addEventListener('click',()=>el('modal').close());
  el('v50BillForm').addEventListener('submit',async event=>{
   event.preventDefault();const f=event.currentTarget,btn=f.querySelector('[type="submit"]');
   try{
    const d=Object.fromEntries(new FormData(f));
    const body={category:d.category,provider:d.provider,subscription_no:d.subscription_no,
     invoice_no:d.invoice_no,period:d.period,issue_date:d.issue_date,due_date:d.due_date,
     amount_kurus:amountValue(d.amount),paid_kurus:amountValue(d.paid||'0'),
     paid_on:d.paid_on||null,note:d.note||''};
    if(body.paid_kurus>body.amount_kurus)throw Error('Ödeme fatura tutarını aşamaz.');
    if(body.paid_kurus&&!body.paid_on)throw Error('Ödeme tarihi girin.');
    btn.disabled=true;
    await api('bills'+(id?'/'+id:''),id?'PATCH':'POST',body);
    el('modal').close();await load();notice('Fatura kaydedildi.');
   }catch(error){notice(error.message,true);}finally{btn.disabled=false;}
  });
 }
 view.addEventListener('input',e=>{
  if(e.target.matches('#v50BillSearch,#v50BillPeriod'))render();
 });
 view.addEventListener('change',e=>{
  if(e.target.matches('#v50BillCategory,#v50BillStatus,#v50BillPeriod'))render();
 });
 view.addEventListener('click',async e=>{
  if(e.target.closest('#v50BillAdd')){form();return;}
  const edit=e.target.closest('[data-v50-edit]'),
   next=e.target.closest('[data-v50-next]'),remove=e.target.closest('[data-v50-delete]');
  if(!edit&&!next&&!remove)return;
  if(!canEdit())return;
  const id=(edit?.dataset.v50Edit||next?.dataset.v50Next||remove?.dataset.v50Delete);
  const b=bills().find(x=>x.id===id);if(!b)return;
  if(edit){form(b);return;}
  if(next){form(b,true);return;}
  if(!confirm(b.provider+' · '+showMonth(b.period)+' faturasını silmek istiyor musun?'))return;
  try{await api('bills/'+id,'DELETE');await load();notice('Fatura silindi.');}
  catch(error){notice(error.message,true);}
 });
 const originalTab=window.tab;
 window.tab=function(name){
  originalTab(name);
  if(name==='bills'){
   const add=el('addAction');
   if(add){add.textContent='+ Fatura ekle';add.hidden=!canEdit();}
   render();
  }
 };
 el('addAction').addEventListener('click',e=>{
  if(activeTab!=='bills')return;
  e.preventDefault();e.stopImmediatePropagation();form();
 },true);
 window.renderBills=render;
 window.HTBillsV50={render,status,monthLater};
})();
