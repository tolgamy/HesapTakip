'use strict';
// Financial records are edited in place, never recreated. Their previous values
// are stored in D1 correction_log by the API in the same transaction.
(function(){
 function formField(label,key,type,value,options=''){
  return '<div><label for="correct-'+key+'">'+esc(label)+'</label>'+
    '<input id="correct-'+key+'" name="'+key+'" type="'+type+'" value="'+esc(value??'')+'" '+
    (type==='number'?'min="0.01" step="0.01" inputmode="decimal" ':type==='date'?'':'maxlength="280" ')+
    options+'></div>';
 }
 const amountValueString=n=>(Number(n||0)/100).toFixed(2);
 const formatDate=showDate;
 const formatMoney=money;
 function showEditor(title,oldAmount,onSubmit,fields,preview=true){
  el('modalTitle').textContent=title;
  el('modalContents').innerHTML='<form id="correctionForm" class="modal-form v13-correction-form">'+
   '<p class="v13-correction-original">Önceden kaydedilen tutar: <strong>'+formatMoney(oldAmount)+'</strong></p>'+
   fields+
   (preview?'<p class="v13-correction-preview" id="v13CorrectionPreview">Yeni tutarı girerek farkı görebilirsin.</p>':'')+
   '<p class="hint">Bu işlem yeni bir kayıt oluşturmaz. Eski ve yeni değerler düzeltme geçmişine yazılır. Bağlı banka/kasa/kart bakiyeleri de gerektiğinde güncellenir.</p>'+
   '<div class="form-actions"><button type="button" class="btn subtle" data-v13-cancel>Vazgeç</button>'+
   '<button type="submit" class="btn primary">Düzeltmeyi kaydet</button></div></form>';
  const form=el('correctionForm');
  const refresh=()=>{
   const val=form.elements.amount?.value;
   if(!form.elements.amount||val===''||!Number.isFinite(Number(val)))return;
   const delta=Math.round(Number(val)*100)-oldAmount;
   const sign=delta>0?'+':delta<0?'−':'';
   const description=delta===0?'Tutar değişmiyor.':('Fark: '+sign+formatMoney(Math.abs(delta)));
   if(el('v13CorrectionPreview'))el('v13CorrectionPreview').textContent=description;
  };
  if(form.elements.amount){form.elements.amount.addEventListener('input',refresh);refresh();}
  form.addEventListener('submit',async e=>{
   e.preventDefault();
   const button=form.querySelector('[type="submit"]');
   const d=Object.fromEntries(new FormData(form));
   if(!confirm('Bu kayıt gerçekten düzeltilecek. Mevcut finansal bakiyeler yeniden hesaplanacak. Onaylıyor musun?'))return;
   button.disabled=true;
   try{
    await onSubmit(d);
    el('modal').close();await load();notice('Düzeltme kaydedildi; bağlı bakiyeler yenilendi.');
   }catch(error){notice(error.message,true);}finally{button.disabled=false;}
  });
  el('modal').showModal();
 }
 function editFirmMovement(id){
  if(currentRole==='viewer'){notice('Düzenleme yetkiniz yok.',true);return;}
  const m=(state.firmMovements||[]).find(x=>x.id===id);
  const f=(state.firms||[]).find(x=>x.id===m?.firm_id);
  if(!m||!f){notice('Hareket bulunamadı.',true);return;}
  const label=m.kind==='charge'?(f.category==='payable'?'Alış / firma borcunu düzelt':'Satış / alacağı düzelt'):
    (f.category==='payable'?'Firma ödemesini düzelt':'Tahsilatı düzelt');
  const fields=formField('Doğru tutar (₺)','amount','number',amountValueString(m.amount_kurus),'required')+
   formField('Gerçek işlem tarihi','date','date',m.on_date,'required')+
   (m.kind==='charge'?formField('Vade tarihi (isteğe bağlı)','due','date',m.due_date||''):'')+
   formField('Açıklama','note','text',m.note||'');
  showEditor(f.name+' · '+label,m.amount_kurus,async d=>{
   await api('firm-movements/'+id,'PATCH',{
    amount_kurus:amountValue(d.amount),on_date:d.date,
    due_date:m.kind==='charge'?(d.due||null):null,note:d.note||''
   });
  },fields);
 }
 function editCashEntry(id){
  if(currentRole==='viewer'){notice('Düzenleme yetkiniz yok.',true);return;}
  const entry=(state.entries||[]).find(x=>x.id===id);
  const account=(state.accounts||[]).find(a=>a.id===entry?.account_id);
  if(!entry||!account){notice('Banka/kasa hareketi bulunamadı.',true);return;}
  const options=(key,values,selected)=>{
   return '<div><label for="correct-'+key+'">'+(key==='direction'?'İşlem yönü':'Kategori')+'</label>'+
    '<select id="correct-'+key+'" name="'+key+'">'+
    values.map(([value,name])=>'<option value="'+value+'"'+(value===selected?' selected':'')+'>'+name+'</option>').join('')+
    '</select></div>';
  };
  const fields=formField('Doğru tutar (₺)','amount','number',amountValueString(entry.amount_kurus),'required')+
   formField('Gerçek işlem tarihi','date','date',entry.entry_date,'required')+
   options('direction',[['in','Para girişi'],['out','Para çıkışı']],entry.direction)+
   options('category',[['income','Gelir'],['expense','Gider'],['other','Diğer']],entry.category)+
   formField('Açıklama','note','text',entry.note||'');
  showEditor(account.name+' · Hesap hareketini düzelt',entry.amount_kurus,async d=>{
   await api('entries/'+id,'PATCH',{amount_kurus:amountValue(d.amount),
    entry_date:d.date,direction:d.direction,category:d.category,note:d.note||''});
  },fields);
 }
 function editCardPayment(id){
  if(currentRole==='viewer'){notice('Düzenleme yetkiniz yok.',true);return;}
  const p=(state.payments||[]).find(x=>x.id===id);
  if(!p){notice('Kart ödemesi bulunamadı.',true);return;}
  const stmt=(state.statements||[]).find(x=>x.id===p.statement_id);
  const card=(state.cards||[]).find(x=>x.id===stmt?.card_id);
  const fields=formField('Doğru ödeme tutarı','amount','number',amountValueString(p.amount_kurus),'required')+
    formField('Ödeme tarihi','date','date',p.paid_on,'required')+
    formField('Açıklama','note','text',p.note||'');
  showEditor((card?.bank||'Kredi kartı')+' · Ekstre ödemesini düzelt',
   p.amount_kurus,async d=>{
    await api('payments/'+id,'PATCH',{statement_id:p.statement_id,amount_kurus:amountValue(d.amount),
     paid_on:d.date,note:d.note||''});
   },fields);
 }
 document.addEventListener('click',event=>{
  const cancel=event.target.closest('[data-v13-cancel]');
  if(cancel){el('modal').close();return;}
  const firm=event.target.closest('[data-firm-movement-edit]');
  if(firm){editFirmMovement(firm.dataset.firmMovementEdit);return;}
  const entry=event.target.closest('[data-suite-edit-entry]');
  if(entry){editCashEntry(entry.dataset.suiteEditEntry);return;}
  const payment=event.target.closest('[data-v13-edit-payment]');
  if(payment){editCardPayment(payment.dataset.v13EditPayment);return;}
 });
 window.editFirmMovement=editFirmMovement;
 window.editCashEntry=editCashEntry;
 window.editCardPayment=editCardPayment;
})();
