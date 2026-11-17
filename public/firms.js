'use strict';
// Mevcut HesapTakip teması ve oturumu üzerinde firma cari hesapları.
let selectedFirmId = '';
function firmMovements(firmId) { return (state.firmMovements||[]).filter(m=>m.firm_id===firmId); }
function firmBalance(firmId) {
  const movements=firmMovements(firmId);
  const charges=movements.filter(m=>m.kind==='charge').reduce((n,m)=>n+m.amount_kurus,0);
  const settled=movements.filter(m=>m.kind==='settlement').reduce((n,m)=>n+m.amount_kurus,0);
  return {charges,settled,remaining:charges-settled};
}
function payoutSelect(selected=''){
 const active=(state.institutions||[]).filter(i=>i.is_active||i.id===selected);
 const group=(label,items)=>'<optgroup label="'+label+'">'+
  items.map(i=>'<option value="'+esc(i.id)+'"'+(i.id===selected?' selected':'')+'>'+
   esc(i.id==='garanti-odeme'?'Tami POS / Garanti Ödeme':i.name)+'</option>').join('')+'</optgroup>';
 return '<div class="v9-payout-field"><label for="firm-payout">Paranın geleceği banka / ödeme kuruluşu</label>'+
  '<select id="firm-payout" name="payout_institution_id"><option value="">Seçim yapmadım</option>'+
  group('Bankalar',active.filter(i=>i.type==='bank'))+
  group('Ödeme kuruluşları / POS',active.filter(i=>i.type==='payment'))+'</select>'+
  '<p class="hint">PayTR, iyzico, Kuveyt Türk, Tami POS veya kullandığın diğer kuruluş.</p></div>';
}
function firmLabel(category) { return category==='payable'?'Borç':'Alacak'; }
function renderFirms() {
  for (const category of ['payable','receivable']) {
    const view=category==='payable'?'payables':'receivables';
    const firms=(state.firms||[]).filter(f=>f.category===category);
    const totals=firms.map(f=>firmBalance(f.id));
    const sum=key=>totals.reduce((n,s)=>n+s[key],0);
    el(view+'Stats').innerHTML=
      stat(category==='payable'?'TOPLAM BORÇ':'TOPLAM ALACAK',money(sum('charges')),firms.length+' firma')+
      stat(category==='payable'?'ÖDENEN':'TAHSİL EDİLEN',money(sum('settled')),'Cari hesap hareketleri','accent')+
      stat('KALAN '+firmLabel(category).toUpperCase(),money(sum('remaining')),'Açık cari bakiye',category==='payable'?'danger':'accent');
    el(view+'Rows').innerHTML=firms.length?firms.map(f=>{
      const b=firmBalance(f.id);
      return '<tr><td><strong>'+esc(f.name)+'</strong></td><td><small>'+esc(f.phone||'')+'</small><br><small>'+esc(f.note||'')+'</small></td>'+
        '<td>'+money(b.charges)+'</td><td>'+money(b.settled)+'</td><td><strong>'+money(b.remaining)+'</strong></td><td>'+
        '<div class="row-actions firm-buttons">'+
        '<button class="mini-btn" data-firm-view="'+f.id+'">Hareketler</button>'+
        '<button class="mini-btn" data-firm-charge="'+f.id+'">'+(category==='payable'?'Borç ekle':'Alacak ekle')+'</button>'+
        (b.remaining>0?'<button class="mini-btn" data-firm-settle="'+f.id+'">'+(category==='payable'?'Öde':'Tahsil et')+'</button>':'')+
        '<button class="mini-btn" data-firm-edit="'+f.id+'">Düzenle</button>'+
        '<button class="mini-btn delete" data-firm-delete="'+f.id+'">Sil</button></div></td></tr>';
    }).join(''):'<tr><td class="empty" colspan="6">Bu bölümde henüz firma yok. “Firma ekle” ile başlayın.</td></tr>';
    const ledger=el(view+'Ledger'), firm=firms.find(f=>f.id===selectedFirmId);
    ledger.hidden=!firm;
    if(firm){
      const movements=firmMovements(firm.id);
      ledger.innerHTML='<div class="section-head"><div><h2>'+esc(firm.name)+' · Hesap hareketleri</h2><p class="muted">Kalan bakiye: '+money(firmBalance(firm.id).remaining)+'</p></div>'+
        '<div class="row-actions"><button class="mini-btn" data-firm-excel="'+firm.id+'">Excel</button><button class="mini-btn" data-firm-pdf="'+firm.id+'">PDF</button><button class="text-btn" data-firm-close="1">Kapat ×</button></div></div>'+
        '<div class="table-wrap"><table><thead><tr><th>Tarih</th><th>İşlem</th><th>Tutar</th><th>Vade</th><th>Not</th><th></th></tr></thead><tbody>'+
        (movements.length?movements.map(m=>'<tr><td>'+esc(showDate(m.on_date))+'</td><td>'+
          (m.kind==='charge'?(category==='payable'?'Borç':'Alacak'):(category==='payable'?'Ödeme':'Tahsilat'))+
          '</td><td><strong>'+money(m.amount_kurus)+'</strong></td><td>'+esc(showDate(m.due_date)||'—')+'</td><td>'+esc(m.note||'—')+'</td>'+
          '<td><div class="row-actions">'+
           '<button class="mini-btn" data-firm-movement-edit="'+m.id+'">Düzenle</button>'+
           '<button class="mini-btn delete" data-firm-movement-delete="'+m.id+'">Sil</button>'+
           '</div></td></tr>').join(''):'<tr><td colspan="6" class="empty">Henüz cari hareket yok.</td></tr>')+
        '</tbody></table></div>';
    }
  }
}
function firmModal(mode, value, group='general', suggestedName='') {
  const editing=mode==='edit';
  const existingMoves=editing?firmMovements(value):[];
  const chargeMoves=existingMoves.filter(m=>m.kind==='charge');
  const singleCharge=chargeMoves.length===1?chargeMoves[0]:null;
  const hasNoMoves=editing&&existingMoves.length===0;
  const firm=editing||mode==='charge'||mode==='settlement'?(state.firms||[]).find(f=>f.id===value):null;
  const category=firm?.category||value;
  if(!['payable','receivable'].includes(category)) {notice('Firma bulunamadı.',true);return;}
  let body='',title='';
  const optional=(name,label,value='',type='text',extra='')=>'<div><label for="firm-'+name+'">'+esc(label)+'</label><input id="firm-'+name+'" name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+extra+'></div>';
  const required=(name,label,value='',type='text',extra='')=>optional(name,label,value,type,'required '+extra);
  const note=(value='')=>'<div><label for="firm-note">Açıklama (isteğe bağlı)</label><textarea id="firm-note" name="note" maxlength="280">'+esc(value)+'</textarea></div>';
  if(mode==='new'||editing){
    const groupLabels={meal:'Yemek kartı alacağı',platform:'Platform alacağı',person:'Şahıs alacağı',pos:'POS hesabı',general:'Diğer alacak'};
    title=editing?'Cari hesap düzenle':(category==='payable'?'Firmaya borç kaydı aç':groupLabels[group]||'Alacak kaydı aç');
    body=required('name',category==='payable'?'Firma adı':'Kuruluş / şahıs adı',firm?.name||suggestedName,'text','maxlength="120"')+
      (category==='receivable'?'<div><label for="firm-receivable_group">Alacak türü</label><select id="firm-receivable_group" name="receivable_group">'+
        [['meal','Yemek kartı'],['platform','Platform'],['pos','POS Cirosu'],['person','Şahıs'],['general','Diğer / eski alacak']].map(([k,v])=>
         '<option value="'+k+'" '+((firm?.receivable_group||group)===k?'selected':'')+'>'+v+'</option>').join('')+'</select></div>':'')+
      (category==='receivable'?payoutSelect(firm?.payout_institution_id||'')+
       '<div class="v9-desktop-logo"><label for="firm-logo-upload">Kuruluş logosu ekle (yalnızca PC)</label>'+
       '<input type="file" id="firm-logo-upload" accept="image/png,image/jpeg,image/webp">'+
       '<p class="hint">Logo yoksa PC üzerinden PNG/JPG/WebP ekleyebilirsin.</p></div>':'')+
      ((mode==='new'||singleCharge||hasNoMoves)?
        '<section class="v14-money-fields"><h3>'+(editing&&singleCharge?'Tutarı ve tarihleri düzelt':'İlk alacak / borç girişini yap')+'</h3>'+
        '<p class="hint">'+(singleCharge?'Bu hareketin tutarını değiştirince kalan alacak/borç otomatik hesaplanır.':
            (editing?'Buradan ilk tutarı ekleyebilirsin; boş bırakırsan bakiye değişmez.':
             'Buradan tutar girebilirsin; boş bırakırsan hesabı sıfır bakiyeyle açarsın.'))+'</p>'+
        optional('amount',category==='payable'?'Mal alış / borç tutarı (₺)':'Alacağım tutar (₺)',
          singleCharge?(singleCharge.amount_kurus/100).toFixed(2):'','number','min="0.01" step="0.01" inputmode="decimal"')+
        optional('on_date','İşlem tarihi',singleCharge?.on_date||trDate(),'date')+
        optional('due_date',category==='payable'?'Vade / ödeme tarihi':'Tahmini paranın geleceği tarih',
          singleCharge?.due_date||'','date')+
        optional('movement_note','Bu para girişinin açıklaması (isteğe bağlı)',singleCharge?.note||'')+
        '</section>':
        editing?'<section class="v14-money-fields"><h3>Alacak / borç hareketlerini düzenle</h3>'+
          '<p class="hint">Bu hesapta birden fazla işlem var. Yanlış bir toplam oluşturmamak için her tutarı ayrı düzenle.</p>'+
          existingMoves.map(m=>'<div class="v14-movement-row"><span>'+
           esc(showDate(m.on_date))+' · '+(m.kind==='charge'?'Alacak / Borç':'Tahsilat / Ödeme')+
           ' · <strong>'+money(m.amount_kurus)+'</strong></span>'+
           '<button type="button" class="mini-btn" data-v14-edit-movement="'+esc(m.id)+'">Düzenle</button></div>').join('')+
          '</section>':'')+
      optional('phone','Telefon (isteğe bağlı)',firm?.phone||'','tel','maxlength="40"')+
      note(firm?.note||'');
  } else {
    const settlement=mode==='settlement', remaining=firmBalance(firm.id).remaining;
    if(settlement && remaining<=0){notice('Bu firmada ödenecek / tahsil edilecek bakiye yok.',true);return;}
    title=settlement?(category==='payable'?'Ödeme kaydet':'Tahsilat kaydet'):(category==='payable'?'Borç kaydet':'Alacak kaydet');
    body='<p class="muted">'+esc(firm.name)+' · Kalan: '+money(remaining)+'</p>'+
      required('amount','Tutar (₺)','','number','min="0.01" step="0.01"')+
      required('on_date',settlement?'İşlem tarihi':'Borç / alacak tarihi',trDate(),'date')+
      (settlement?'':optional('due_date','Vade tarihi (isteğe bağlı)','','date'))+
      note();
  }
  el('modalTitle').textContent=title;
  el('modalContents').innerHTML='<form id="firmForm" class="modal-form">'+body+
    '<div class="form-actions"><button class="btn subtle" id="cancelFirmForm" type="button">Vazgeç</button>'+
    '<button class="btn primary" type="submit">Kaydet</button></div></form>';
  el('cancelFirmForm').onclick=()=>el('modal').close();
  el('firmForm').querySelectorAll('[data-v14-edit-movement]').forEach(button=>
    button.addEventListener('click',()=>{
      const id=button.dataset.v14EditMovement;
      el('modal').close();
      if(window.editFirmMovement)window.editFirmMovement(id);
    }));

  el('firmForm').onsubmit=async e=>{
    e.preventDefault();const submit=e.currentTarget.querySelector('[type=submit]');submit.disabled=true;
    const d=Object.fromEntries(new FormData(e.currentTarget));
    try{
      if(mode==='new'||editing){
        const uploaded=e.currentTarget.querySelector('#firm-logo-upload')?.files?.[0];
        const logo_data=uploaded?await reduceLogo(uploaded):firm?.logo_data||'';
        const accountData={
          name:d.name,category,receivable_group:d.receivable_group||'general',phone:d.phone,
          note:d.note||'',payout_institution_id:d.payout_institution_id||null,logo_data
        };
        const hasAmount=d.amount!==undefined&&d.amount!=='';
        const movement=hasAmount?{
          amount_kurus:amountValue(d.amount),on_date:d.on_date,
          due_date:d.due_date||null,note:d.movement_note||''
        }:null;
        if(editing){
          if(movement&&(singleCharge||hasNoMoves)){
            await api('firms/'+firm.id+'/details','PATCH',{
              ...accountData,movement:{...movement,id:singleCharge?.id||null}
            });
          }else await api('firms/'+firm.id,'PATCH',accountData);
        }else if(movement){
          await api('firms/with-charge','POST',{
            ...accountData,...movement,movement_note:d.movement_note||''
          });
        }else await api('firms','POST',accountData);
      } else {
        await api('firm-movements','POST',{
          firm_id:firm.id,kind:mode==='settlement'?'settlement':'charge',
          amount_kurus:amountValue(d.amount),on_date:d.on_date,
          due_date:mode==='charge'?(d.due_date||null):null,note:d.note||''
        });
      }
      el('modal').close();selectedFirmId=firm?.id||selectedFirmId;await load();notice('Firma kaydı güncellendi.');
    } catch(err){notice(err.message,true);}finally{submit.disabled=false;}
  };
  el('modal').showModal();
}
async function deleteFirm(firmId){
  if(!confirm('Firmayı silmek istiyor musunuz? Hareketi bulunan firma silinemez.'))return;
  try{await api('firms/'+firmId,'DELETE');if(selectedFirmId===firmId)selectedFirmId='';await load();notice('Firma silindi.');}
  catch(err){notice(err.message,true);}
}
async function deleteFirmMovement(id){
  if(!confirm('Bu cari hareketi silmek istiyor musunuz?'))return;
  try{await api('firm-movements/'+id,'DELETE');await load();notice('Cari hareket silindi.');}
  catch(err){notice(err.message,true);}
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-firm-new],[data-firm-edit],[data-firm-charge],[data-firm-settle],[data-firm-view],[data-firm-close],[data-firm-delete],[data-firm-movement-delete],[data-firm-excel],[data-firm-pdf]');
  if(!b)return;
  if(b.dataset.firmNew)firmModal('new',b.dataset.firmNew);
  else if(b.dataset.firmEdit)firmModal('edit',b.dataset.firmEdit);
  else if(b.dataset.firmCharge)firmModal('charge',b.dataset.firmCharge);
  else if(b.dataset.firmSettle)window.openSettlementForm(b.dataset.firmSettle);
  else if(b.dataset.firmView){selectedFirmId=b.dataset.firmView;renderFirms();const f=(state.firms||[]).find(x=>x.id===selectedFirmId);el((f?.category==='payable'?'payables':'receivables')+'Ledger').scrollIntoView({behavior:'smooth',block:'nearest'});}
  else if(b.dataset.firmClose){selectedFirmId='';renderFirms();}
  else if(b.dataset.firmDelete)deleteFirm(b.dataset.firmDelete);
  else if(b.dataset.firmMovementDelete)deleteFirmMovement(b.dataset.firmMovementDelete);
  else if(b.dataset.firmExcel)window.exportFirmStatement(b.dataset.firmExcel,'excel');
  else if(b.dataset.firmPdf)window.exportFirmStatement(b.dataset.firmPdf,'pdf');
});
window.renderFirms=renderFirms;
window.openFirmForm=firmModal;
