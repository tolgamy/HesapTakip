'use strict';
// V10 daily ledger: linked incoming POS/meal/platform receipts, supplier card
// payments, cash sales and confirmed deletions. All figures come from D1 state.
(function(){
 const safe=x=>esc(String(x??''));
 const accountOption=a=>'<option value="account:'+safe(a.id)+'">'+
  safe((a.type==='cash'?'Nakit kasa: ':'Banka: ')+a.name+' · '+money(currentBalance(a.id)))+'</option>';
 const cardOption=c=>'<option value="card:'+safe(c.id)+'">'+
  safe(c.bank+' · '+(c.last4?'•••• '+c.last4:'Kredi kartı')+' · Kullanılabilir: '+
   cardMoney(c.available_limit_kurus,c))+'</option>';
 function settlementForm(id,requireBank=false){
  if(currentRole==='viewer'){notice('Bu işlem için düzenleme yetkisi gerekli.',true);return;}
  const f=(state.firms||[]).find(x=>x.id===id);
  if(!f){notice('Cari hesap bulunamadı.',true);return;}
  const amount=firmBalance(id).remaining;
  if(amount<=0){notice('Bu hesapta kalan açık bakiye bulunmuyor.',true);return;}
  const payable=f.category==='payable';
  const bankRequired=Boolean(requireBank&&!payable);
  if(bankRequired&&!(state.accounts||[]).some(a=>a.type==='bank')){
   notice('Tahsilat için önce Bankalarım bölümünde bir banka hesabı oluşturmalısın.',true);return;
  }
  const validCards=(state.cards||[]).filter(c=>['credit','virtual'].includes(c.card_type||'credit')&&
    (c.currency||'TRY')==='TRY'&&c.available_limit_kurus!==null&&c.available_limit_kurus>0);
  const sources=[
   bankRequired?'<option value="">Paranın geldiği banka hesabını seç</option>':
    '<option value="">Sadece cari borcu/alacağı düş (banka/kasa değişmez)</option>',
   '<optgroup label="Banka / nakit kasa">'+(state.accounts||[]).filter(a=>!bankRequired||a.type==='bank').map(accountOption).join('')+'</optgroup>',
   payable?'<optgroup label="Kredi kartları">'+validCards.map(cardOption).join('')+'</optgroup>':''
  ];
  el('modalTitle').textContent=payable?'Firmaya ödeme yap':'Tahsilat / Hesaba gelen para';
  el('modalContents').innerHTML='<form id="v10SettleForm" class="modal-form v10-entry-form">'+
   '<p class="v10-modal-balance"><strong>'+safe(f.name)+'</strong><br>Kalan: <b>'+money(amount)+'</b></p>'+
   '<div><label for="v10-amount">Tutar (₺)</label><input id="v10-amount" name="amount" type="number" min="0.01" step="0.01" value="'+
     (amount/100).toFixed(2)+'" required></div>'+
   '<div><label for="v10-date">İşlem tarihi</label><input id="v10-date" name="date" type="date" value="'+trDate()+'" required></div>'+
   '<div><label for="v10-source">'+(payable?'Ödeme kaynağı':'Paranın geldiği hesap')+'</label>'+
    '<select id="v10-source" name="source"'+(bankRequired?' required':'')+'>'+sources.join('')+'</select></div>'+
   '<p id="v24OverpayWarning" class="v24-overpay-warning" role="status" hidden></p>'+
   '<p class="hint">'+(bankRequired?
    'Kaydettiğinde alacak azalır ve seçtiğin bankanın bakiyesi artar. Banka seçmeden bu tahsilat kaydedilemez.':
    'Kredi kartıyla firma ödemesi yapılırsa kartın kullanılabilir limiti azalır. Banka/kasa seçilirse gerçek para girişi/çıkışı da kaydedilir. Kaynak seçilmezse yalnız cari bakiye güncellenir.')+'</p>'+
   '<div><label for="v10-note">Açıklama (isteğe bağlı)</label><input id="v10-note" name="note" maxlength="280" placeholder="Örn. Günlük POS tahsilatı"></div>'+
   '<div class="form-actions"><button type="button" class="btn subtle" data-v10-cancel>Vazgeç</button>'+
   '<button type="submit" class="btn primary">Kaydet</button></div></form>';
  el('modal').showModal();
  if(payable){
   const input=el('v10-amount'),warning=el('v24OverpayWarning');
   const update=()=>{
    try{
     const entered=amountValue(input.value);
     const excess=Math.max(0,entered-amount);
     warning.hidden=excess===0;
     warning.textContent=excess?
      'Fazla ödeme: '+money(excess)+' · Bu tutar '+f.name+' firmasından alacağın olarak kaydedilecek.':'';
    }catch{warning.hidden=true;}
   };
   input.addEventListener('input',update);update();
  }
  el('v10SettleForm').onsubmit=async e=>{
   e.preventDefault();const button=e.currentTarget.querySelector('[type=submit]');
   button.disabled=true;
   try{
    const d=Object.fromEntries(new FormData(e.currentTarget));
    const payload={firm_id:id,amount_kurus:amountValue(d.amount),on_date:d.date,note:d.note||''};
    if(d.source.startsWith('account:'))payload.account_id=d.source.slice(8);
    else if(d.source.startsWith('card:'))payload.card_id=d.source.slice(5);
    const excess=payable?Math.max(0,payload.amount_kurus-amount):0;
    if(excess&&!confirm('Fazla ödeme uyarısı! '+f.name+' firmasına '+money(payload.amount_kurus)+
      ' ödeyeceksin. Borcun '+money(amount)+
      ', fazladan '+money(excess)+' alacağın oluşacak. Kaydedilsin mi?'))return;
    await api('settlements','POST',payload);
    el('modal').close();await load();
    notice(excess?'Fazla ödeme kaydedildi. '+money(excess)+' firma alacağın oluştu.':
      'İşlem kaydedildi. Cari hesap bakiyesi güncellendi.');
   }catch(err){notice(err.message,true);}
   finally{button.disabled=false;}
  };
 }
 function cashSale(accountId){
  if(currentRole==='viewer'){notice('Kayıt ekleme yetkiniz yok.',true);return;}
  const account=(state.accounts||[]).find(a=>a.id===accountId&&a.type==='cash');
  if(!account){notice('Nakit kasa bulunamadı.',true);return;}
  el('modalTitle').textContent='Günlük nakit satış';
  el('modalContents').innerHTML='<form id="v10SaleForm" class="modal-form v10-entry-form">'+
   '<p class="v10-modal-balance"><strong>'+safe(account.name)+'</strong><br>Şimdiki bakiye: '+
     money(currentBalance(accountId))+'</p>'+
   '<div><label for="v10-sale-amount">Nakit satış (₺)</label><input name="amount" id="v10-sale-amount" type="number" min="0.01" step="0.01" required></div>'+
   '<div><label for="v10-sale-date">Tarih</label><input name="date" id="v10-sale-date" type="date" value="'+trDate()+'" required></div>'+
   '<div><label for="v10-sale-note">Açıklama</label><input name="note" id="v10-sale-note" maxlength="280" placeholder="Gün sonu nakit satış"></div>'+
   '<div class="form-actions"><button type="button" class="btn subtle" data-v10-cancel>Vazgeç</button>'+
   '<button type="submit" class="btn primary">+ Nakit satışı kaydet</button></div></form>';
  el('modal').showModal();
  el('v10SaleForm').onsubmit=async e=>{
   e.preventDefault();const button=e.currentTarget.querySelector('[type=submit]');button.disabled=true;
   try{
    const d=Object.fromEntries(new FormData(e.currentTarget));
    await api('entries','POST',{account_id:accountId,direction:'in',category:'income',
     amount_kurus:amountValue(d.amount),entry_date:d.date,note:d.note||'Nakit satış'});
    el('modal').close();await load();notice('Nakit satış kasaya eklendi.');
   }catch(err){notice(err.message,true);}
   finally{button.disabled=false;}
  };
 }
 function purchaseForm(){
  if(currentRole==='viewer'){notice('Kayıt ekleme yetkiniz yok.',true);return;}
  const existing=(state.firms||[]).filter(f=>f.category==='payable');
  el('modalTitle').textContent='Firmadan mal / hizmet alışı';
  el('modalContents').innerHTML='<form id="v10PurchaseForm" class="modal-form v10-entry-form">'+
   '<div><label for="v10-supplier">Firma</label><select name="firm_id" id="v10-supplier">'+
     '<option value="">Yeni firma oluştur</option>'+
     existing.map(f=>'<option value="'+safe(f.id)+'">'+safe(f.name)+'</option>').join('')+'</select></div>'+
   '<div id="v10-purchase-name"><label for="v10-supplier-name">Yeni firma adı</label>'+
     '<input id="v10-supplier-name" name="name" maxlength="120" required placeholder="Örn. A Gıda"></div>'+
   '<div><label for="v10-purchase-amount">Mal / hizmet bedeli (₺)</label>'+
    '<input name="amount" id="v10-purchase-amount" type="number" min="0.01" step="0.01" required></div>'+
   '<div><label for="v10-purchase-date">Alış tarihi</label><input name="date" id="v10-purchase-date" type="date" value="'+trDate()+'" required></div>'+
   '<div><label for="v10-purchase-due">Vade (isteğe bağlı)</label><input name="due" id="v10-purchase-due" type="date"></div>'+
   '<div><label for="v10-purchase-note">Açıklama</label><input name="note" id="v10-purchase-note" maxlength="280" placeholder="Gelen ürünler / fatura"></div>'+
   '<div class="form-actions"><button type="button" class="btn subtle" data-v10-cancel>Vazgeç</button>'+
   '<button type="submit" class="btn primary">+ Borç kaydet</button></div></form>';
  el('modal').showModal();
  el('v10-supplier').addEventListener('change',e=>{
   const isNew=!e.target.value;
   const node=el('v10-purchase-name');
   node.hidden=!isNew;el('v10-supplier-name').required=isNew;
  });
  el('v10PurchaseForm').onsubmit=async e=>{
   e.preventDefault();const button=e.currentTarget.querySelector('[type=submit]');button.disabled=true;
   try{
    const d=Object.fromEntries(new FormData(e.currentTarget)),amount=amountValue(d.amount);
    if(d.firm_id){
     await api('firm-movements','POST',{firm_id:d.firm_id,kind:'charge',
      amount_kurus:amount,on_date:d.date,due_date:d.due||null,note:d.note||''});
    }else{
     await api('firms/with-charge','POST',{name:d.name,category:'payable',
      amount_kurus:amount,on_date:d.date,due_date:d.due||null,
      phone:'',note:'',movement_note:d.note||''});
    }
    el('modal').close();await load();notice('Firma borcu eklendi.');
   }catch(err){notice(err.message,true);}
   finally{button.disabled=false;}
  };
 }
 function editAccount(id){
  if(currentRole==='viewer'){notice('Düzenleme yetkiniz yok.',true);return;}
  const account=(state.accounts||[]).find(a=>a.id===id);
  if(!account)return;
  el('modalTitle').textContent=account.type==='bank'?'Banka hesabını düzenle':'Nakit kasayı düzenle';
  el('modalContents').innerHTML='<form id="v10AccountEdit" class="modal-form v10-entry-form">'+
   '<p class="v10-modal-balance">Bakiye: <strong>'+money(currentBalance(id))+'</strong></p>'+
   '<div><label for="v10-account-name">Hesap adı</label><input id="v10-account-name" name="name" required maxlength="100" value="'+safe(account.name)+'"></div>'+
   (account.type==='bank'&&window.HTBankInstitutionSelect?
     window.HTBankInstitutionSelect(account.institution_id||''):'')+
   '<div><label for="v10-account-opening">Doğru açılış bakiyesi (₺)</label>'+
     '<input id="v10-account-opening" name="opening" type="number" min="0" step="0.01" value="'+
     (Number(account.opening_kurus)/100).toFixed(2)+'" required></div>'+
   '<div><label for="v10-account-note">Açıklama</label><input id="v10-account-note" name="note" maxlength="280" value="'+safe(account.note||'')+'"></div>'+
   '<p class="hint">Hareket geçmişi korunur. Açılış bakiyesi değişirse mevcut banka/kasa bakiyesi de fark kadar düzelir.</p>'+
   '<div class="form-actions"><button type="button" class="btn subtle" data-v10-cancel>Vazgeç</button>'+
   '<button class="btn primary" type="submit">Kaydet</button></div></form>';
  el('modal').showModal();
  if(account.type==='bank'){
    const form=el('v10AccountEdit');
    const search=form.querySelector('#suite-bank-search'),select=form.elements.institution_id;
    if(search&&select){
      const all=[...select.options].map(o=>({id:o.value,name:o.textContent}));
      search.addEventListener('input',()=>{
        const term=search.value.toLocaleLowerCase('tr-TR');
        const selected=select.value;
        select.innerHTML=all.filter(o=>!term||!o.id||o.name.toLocaleLowerCase('tr-TR').includes(term))
          .map(o=>'<option value="'+safe(o.id)+'">'+safe(o.name)+'</option>').join('');
        if([...select.options].some(o=>o.value===selected))select.value=selected;
      });
    }
  }
  el('v10AccountEdit').onsubmit=async e=>{
   e.preventDefault();const button=e.currentTarget.querySelector('[type="submit"]');button.disabled=true;
   try{
    const d=Object.fromEntries(new FormData(e.currentTarget));
    if(!confirm('Banka/kasa açılış bakiyesi ve adını düzeltmek istediğine emin misin?'))return;
    await api('accounts/'+id,'PATCH',{name:d.name,note:d.note||'',opening_kurus:amountValue(d.opening),
      institution_id:account.type==='bank'?d.institution_id||null:null});
    el('modal').close();await load();notice('Hesap güncellendi.');
   }catch(err){notice(err.message,true);}finally{button.disabled=false;}
  };
 }
 async function deleteAccount(id){
  if(currentRole==='viewer'){notice('Silme yetkiniz yok.',true);return;}
  const account=(state.accounts||[]).find(a=>a.id===id);
  if(!account)return;
  if(!confirm(account.name+' hesabını gerçekten silmek istiyor musun? Bu işlem geri alınamaz.'))return;
  try{
   await api('accounts/'+id,'DELETE');await load();notice('Hesap silindi.');
  }catch(err){notice(err.message+' Önce hesaba bağlı hareketleri silmen gerekebilir.',true);}
 }
 document.addEventListener('click',e=>{
  if(e.target.closest('[data-v10-cancel]')){el('modal').close();return;}
  const newPos=e.target.closest('[data-v10-pos-new]');
  if(newPos){window.openFirmForm('new','receivable','pos');return;}
  const newCash=e.target.closest('[data-v10-cash-new]');
  if(newCash){window.openSuiteForm('account');const field=el('suite-type');if(field)field.value='cash';return;}
  const newPurchase=e.target.closest('[data-v10-supplier-new]');
  if(newPurchase){purchaseForm();return;}
  const cash=e.target.closest('[data-v10-cash-sale]');
  if(cash){cashSale(cash.dataset.v10CashSale);return;}
  const edit=e.target.closest('[data-v10-account-edit]');
  if(edit){editAccount(edit.dataset.v10AccountEdit);return;}
  const remove=e.target.closest('[data-v10-account-remove]');
  if(remove){deleteAccount(remove.dataset.v10AccountRemove);return;}
  const credit=e.target.closest('[data-v10-card-open]');
  if(credit){window.openProCardForm(credit.dataset.v10CardOpen);return;}
 });
 document.addEventListener('change',e=>{
  if(e.target.matches('#v10-supplier')){
   const newName=el('v10-purchase-name');
   newName.hidden=!!e.target.value;
   el('v10-supplier-name').required=!e.target.value;
  }
 });
 window.openSettlementForm=settlementForm;
 window.openSupplierPurchaseForm=purchaseForm;
 window.openCashSaleForm=cashSale;
})();
