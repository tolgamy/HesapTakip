/* HesapTakip V60 — 20 practical improvements, local PDF/Excel only. */
(function(){
'use strict';
const root=document.getElementById('v60Center');
if(!root||!window.HTV60Core)return;
const core=window.HTV60Core,byId=x=>document.getElementById(x);
const safe=x=>esc(String(x??''));
const fmt=x=>typeof money==='function'?money(x):new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(Number(x||0)/100);
const today=()=>typeof trDate==='function'?trDate():new Date().toISOString().slice(0,10);
const cashValue=x=>fmt(x);
const identity=()=>window.HTIdentity||{};
const admin=()=>['admin','tenant'].includes(identity().role);
const reportCols=['Tarih','Tür','Kayıt / kurum','Açıklama','Tutar','Para birimi'];
let lastRows=[],lastModel=null;
function boxRow(label,value,note=''){
 return '<div class="v60-row"><div><strong>'+safe(label)+'</strong>'+
  (note?'<small>'+safe(note)+'</small>':'')+'</div><b>'+safe(value)+'</b></div>';
}
function listRows(rows,format,cap=40){
 if(!rows.length)return '<p class="v60-empty">Bu koşullarda kayıt bulunmuyor.</p>';
 return rows.slice(0,cap).map(format).join('')+
  (rows.length>cap?'<p class="v60-empty">İlk '+cap+' kayıt gösteriliyor. Filtreleri daraltın.</p>':'');
}
function status(x,msg='',bad=false){
 const n=byId(x);if(!n)return;n.textContent=msg;n.dataset.error=bad?'1':'0';
}
function openTab(name){
 const allowed=['overview','cards','banking','payables','bills','directory','settings','payments','firmactivity','calendar','people','instruments','reports','search'];
 if(allowed.includes(name)&&typeof window.tab==='function')window.tab(name);
}
function dueMarkup(x){
 const days=core.diff(x.date,today());
 return '<div class="v60-row"><div><strong>'+safe(x.name)+'</strong><small>'+safe(x.type)+' · '+safe(x.date)+
  ' · '+(days<0?'Gecikmiş '+Math.abs(days)+' gün':days===0?'Bugün':days+' gün sonra')+
  '</small></div><b>'+safe(x.currency==='TRY'?fmt(x.amount):String(x.amount/100)+' '+x.currency)+'</b></div>';
}
function updateReport(){
 const filters={q:byId('v60SearchText').value,kind:byId('v60SearchType').value,
  from:byId('v60From').value,to:byId('v60To').value};
 lastRows=core.search(state,filters);
 byId('v60FilteredCount').textContent=lastRows.length+' kayıt';
 byId('v60FilteredResults').innerHTML=listRows(lastRows,x=>boxRow(
  x.name,x.currency==='TRY'?fmt(x.amount):(x.amount/100).toFixed(2)+' '+x.currency,
  x.date+' · '+x.type+' · '+x.details),60);
}
function render(){
 if(!state||!Array.isArray(state.cards)||!Array.isArray(state.firms)||!Array.isArray(state.accounts)){
  status('v60Status','Finans verileri henüz yüklenmedi. Kayıtlar silinmiş anlamına gelmez.',true);return;
 }
 const t=today(),data=core.summary(state,t);lastModel=data;
 const count=[state.cards.length,state.firms.length,state.accounts.length];
 byId('v60RecordCheck').textContent=count[0]+' kart · '+count[1]+' firma · '+count[2]+' banka/kasa';
 status('v60Status',count.some(Boolean)?'Kayıtlar yüklendi. Hesaplamalar yalnız mevcut finans kayıtlarına dayanır.':
  'Kayıtlar boş görünüyor. Yetkili kullanıcı olduğunuzu ve internet bağlantısını kontrol edin.',!count.some(Boolean));
 const funds=data.balances.reduce((sum,a)=>sum+a.balance_kurus,0);
 const payable=data.firms.filter(x=>x.category==='payable').reduce((sum,x)=>sum+Math.max(0,x.remaining),0);
 const credit=data.firms.filter(x=>x.category==='payable').reduce((sum,x)=>sum+Math.max(0,-x.remaining),0);
 const receivable=data.firms.filter(x=>x.category==='receivable').reduce((sum,x)=>sum+x.remaining,0);
 byId('v60Headline').innerHTML=[
  ['Bugün ödeme / tahsilat',data.dueToday.length+' kayıt'],
  ['Geciken vadeler',data.overdue.length+' kayıt'],
  ['Kasa ve banka',fmt(funds)],
  ['Firma borçları',fmt(payable)]
 ].map(([k,v])=>'<div class="v60-metric"><span>'+safe(k)+'</span><strong>'+safe(v)+'</strong></div>').join('');
 byId('v60Today').innerHTML=listRows(data.dueToday,dueMarkup,18);
 byId('v60Overdue').innerHTML=listRows(data.overdue,dueMarkup,30);
 byId('v60NextWeek').innerHTML=listRows(data.next7,dueMarkup,30);
 const future=data.dues.filter(x=>x.date>t).slice(0,60);
 byId('v60Future').innerHTML=listRows(future,dueMarkup,30);
 const rec=window.HTCardToday28?.recommend?.(state.cards,t);
 byId('v60CardAdvice').textContent=rec?
  rec.bank+' · '+(rec.nickname||rec.last4||'Kart')+' — son hesap kesim: '+
  (window.HTCardToday28.latestClosing(rec,t)||'belirsiz')+'. Limit öneriyi etkilemez.':
  'Hesap kesim günü geçmiş aktif kredi kartı bulunamadı. Tahmini tarihler bankadan doğrulanmaz.';
 const visits=data.visits;
 byId('v60Visits').innerHTML=listRows(visits,x=>'<div class="v60-row"><div><strong>'+
  safe(x.company)+'</strong><small>'+safe(x.name)+'</small></div>'+
  (x.phone?'<a href="https://wa.me/'+String(x.phone).replace(/\D/g,'')+'" target="_blank" rel="noopener noreferrer">WhatsApp</a>':'')+'</div>',20);
 const accounts=data.balances;
 byId('v60Accounts').innerHTML=listRows(accounts,x=>boxRow(x.name,fmt(x.balance_kurus),
  (x.type==='cash'?'Kasa':'Banka')+(Number(x.is_pos)===1?' · POS':'')),35);
 const supplierCredits=data.firms.filter(f=>f.category==='payable'&&f.remaining<0);
 byId('v60Credit').innerHTML='<p class="v60-inline">Firmalara fazla ödemelerden alacağınız: <strong>'+fmt(credit)+'</strong>. Firmalardan alacak toplamı: '+fmt(receivable)+'.</p>'+
  listRows(supplierCredits,f=>boxRow(f.name,fmt(-f.remaining),'Fazla ödeme'),30);
 const dup=data.duplicates;
 byId('v60Duplicates').innerHTML=listRows(dup,g=>boxRow(
  g[0].type+' · '+g[0].date,fmt(g[0].amount),g.length+' benzer kayıt · otomatik silinmez'),25);
 const issues=data.issues;
 byId('v60Issues').innerHTML='<p class="v60-inline">'+issues.length+' kontrol bulgusu. Bunlar uyarıdır; hiçbir kayıt otomatik değiştirilmez.</p>'+
  listRows(issues,x=>'<div class="v60-row"><div><strong>'+safe(x.description)+
  '</strong><small>'+safe(x.code)+'</small></div><b>'+safe(x.level==='error'?'Kontrol et':x.level==='warn'?'Uyarı':'Bilgi')+'</b></div>',50);
 const posAccounts=accounts.filter(a=>Number(a.is_pos)===1||/(^|\W)pos(\W|$)/i.test(a.name||''));
 const posFirms=data.firms.filter(f=>f.category==='receivable'&&f.receivable_group==='pos');
 byId('v60Pos').innerHTML=boxRow('POS kurumlarında bekleyen alacak',
  fmt(posFirms.reduce((s,f)=>s+Math.max(0,f.remaining),0)),
  posFirms.length+' POS cari hesabı')+
  boxRow('POS işaretli banka hesapları',
  fmt(posAccounts.reduce((s,a)=>s+a.balance_kurus,0)),
  posAccounts.length+' hesap · Bu iki tutar otomatik olarak toplanmaz');
 byId('v60Bills').innerHTML=listRows(data.dues.filter(x=>x.type==='Fatura'),dueMarkup,25);
 byId('v60Month').innerHTML=data.monthly.map(x=>'<div class="v60-row"><div><strong>'+safe(x.period)+
  '</strong><small>'+x.count+' kasa/banka hareketi</small></div><b>+'+fmt(x.income)+' / −'+fmt(x.expense)+
  '</b></div>').join('');
 byId('v60Installments').innerHTML=listRows(data.dues.filter(x=>x.type==='Taksit'),dueMarkup,25);
 const audit=Array.isArray(state.audit)?state.audit:[];
 byId('v60Audit').innerHTML=listRows(audit.slice(0,20),x=>
  boxRow(x.method+' '+(x.entity||''),x.role||'',
  String(x.occurred_at||'').slice(0,16)),20);
 const undo=window.HTV60Undo;
 byId('v60Undo').hidden=!admin()||!undo;
 byId('v60Undo').textContent=undo?'Son kart ödemesini geri al ('+fmt(undo.amount)+')':'';
 byId('v60Role').textContent=identity().role==='admin'?
  'Ana yönetici · kendi veritabanı':
  identity().role==='tenant'?'Kişisel Hesap · yalnızca kendi verilerin':
  'Kullanıcı hesabı';
 const finder=byId('v60PdfCard'),existing=finder.value;
 finder.innerHTML='<option value="">Kart seçin</option>'+state.cards.filter(c=>(c.card_type||'credit')==='credit').map(c=>
  '<option value="'+safe(c.id)+'">'+safe(c.bank)+' · '+safe(c.nickname||c.last4)+'</option>').join('');
 if(state.cards.some(c=>c.id===existing))finder.value=existing;
 updateReport();
}
async function safeRender(){
 try{render();}catch(err){
  console.error('V60 overview display error',err?.name||'Error');
  status('v60Status','Kontrol Merkezi açılırken hata oluştu. Mevcut hesap kayıtları değiştirilmedi.',true);
 }
}
function makeReportTables(){
 const rows=[reportCols,...lastRows.map(x=>[x.date,
  {firm:'Firma',cash:'Banka/Kasa',statement:'Ekstre',payment:'Kart ödemesi',bill:'Fatura'}[x.type]||x.type,
  x.name,x.details,Number((x.amount/100).toFixed(2)),x.currency])];
 const t=today();
 const summary=[['Filtreli HesapTakip V60 raporu',''],['Rapor tarihi',t],
 ['Kayıt sayısı',lastRows.length],['Başlangıç',byId('v60From').value||'Tümü'],
 ['Bitiş',byId('v60To').value||'Tümü'],
 ['Not','Tutarlar para birimi ayrılarak gösterilir; hareket türleri farklıdır, toplamları tek net borç sayılmaz.']];
 return [{name:'Rapor Özeti',rows:summary},{name:'Filtreli Hareketler',rows}];
}
function printReport(){
 const w=window.open('','_blank');if(!w){notice('PDF yazdırması için açılır pencereye izin verin.',true);return;}
 const tables=makeReportTables();
 const html=tables.map(t=>'<section class="report-section"><h2>'+safe(t.name)+'</h2><table><tbody>'+
  t.rows.map((r,i)=>'<tr>'+r.map(x=>'<'+(i===0?'th':'td')+'>'+safe(x)+'</'+(i===0?'th':'td')+'>').join('')+'</tr>').join('')+
  '</tbody></table></section>').join('');
 let done=false;const printing=()=>{if(done||w.closed)return;done=true;w.focus();w.print();};
 w.addEventListener('load',printing,{once:true});
 w.document.open();
 w.document.write('<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>HesapTakip V60 Filtreli Rapor</title>'+
  '<link rel="stylesheet" href="/report.css"></head><body><h1>HesapTakip · Filtreli Rapor</h1>'+html+
  '<footer>Yalnız uygulamada kayıtlı finansal hareketler.</footer></body></html>');
 w.document.close();setTimeout(printing,1200);
}
function excelReport(){
 if(typeof makeXlsx!=='function'||typeof downloadExport!=='function')
  throw Error('Excel bileşeni hazır değil.');
 downloadExport(makeXlsx(makeReportTables()),'HesapTakip-V60-Filtreli-'+today()+'.xlsx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
function duplicateWarning(action,body,id=''){
 if(!body||id||!admin())return true;
 let matches=[];
 if(action==='create-payment')matches=(state.payments||[]).filter(x=>
  x.statement_id===body.statement_id&&x.paid_on===body.paid_on&&Number(x.amount_kurus)===Number(body.amount_kurus));
 if(action==='create-statement')matches=(state.statements||[]).filter(x=>
  x.card_id===body.card_id&&x.period===body.period&&Number(x.amount_kurus)===Number(body.amount_kurus));
 if(!matches.length)return true;
 return confirm('Dikkat: Aynı tarih/dönem ve tutarda '+matches.length+
  ' kayıt zaten var. Mükerrer işlem olabilir. Yine de kaydetmek istiyor musun?');
}
function posCompare(){
 const gross=Number(byId('v60Gross').value),fee=Number(byId('v60Fee').value),
  received=Number(byId('v60Received').value);
 if(![gross,fee,received].every(Number.isFinite)||gross<0||fee<0||fee>100||received<0){
  status('v60PosCheck','Tutarlar pozitif, komisyon 0–100 arasında olmalı.',true);return;
 }
 const expected=gross*(1-fee/100),gap=received-expected;
 status('v60PosCheck','Beklenen net: '+new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(expected)+
  ' · Girilen net: '+new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(received)+
  ' · Fark: '+new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(gap)+
  '. Bu manuel hesaplamadır, bankaya bağlanmaz.',Math.abs(gap)>0.009);
}
async function comparePdf(){
 const file=byId('v60PdfFile').files?.[0],id=byId('v60PdfCard').value;
 if(!file||!id){status('v60PdfStatus','PDF dosyası ve kayıtlı bir kart seçin.',true);return;}
 if(file.size>8*1024*1024||file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf')){
  status('v60PdfStatus','En fazla 8 MB PDF seçin.',true);return;
 }
 status('v60PdfStatus','PDF tarayıcınızda okunuyor; hiçbir dosya sunucuya gönderilmiyor.');
 const button=byId('v60PdfInspect');button.disabled=true;
 try{
  const pdfjs=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  let all='';
  for(let i=1;i<=Math.min(pdf.numPages,10);i++){
   const page=await pdf.getPage(i),text=await page.getTextContent();
   all+=' '+text.items.map(x=>x.str||'').join(' ');
   if(all.length>180000)throw Error('PDF metni çok uzun.');
  }
  if(!all.trim()){status('v60PdfStatus','PDF taranmış görsel; seçilebilir metin yok. Bu dosya otomatik kontrol edilemez.',true);return;}
  const card=(state.cards||[]).find(x=>x.id===id);
  const digits=String(card?.last4||'');
  const compact=all.replace(/[\s•·*xX-]+/g,'');
  const matched=digits.length===4&&compact.includes(digits);
  const statement=(state.statements||[]).filter(x=>x.card_id===id)
    .sort((a,b)=>String(b.period).localeCompare(String(a.period)))[0];
  const amount=statement?fmt(statement.amount_kurus):'kayıtlı ekstre yok';
  const amounts=[...all.matchAll(/(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g)].slice(0,150)
    .map(m=>Number(m[0].replace(/\./g,'').replace(',','.')));
  const same=!!statement&&amounts.some(x=>Math.abs(x-Number(statement.amount_kurus)/100)<0.01);
  const verdict=matched?'Kart son dört hanesi PDF metninde bulundu.':'Kart son dört hanesi PDF metninde bulunamadı.';
  status('v60PdfStatus',verdict+' Son kayıtlı ekstre: '+amount+'. Ekstre tutarı PDF içinde '+
   (same?'bulundu.':'bulunamadı veya ayrıştırılamadı.')+
   ' Bu ön kontroldür; satır satır banka mutabakatı değildir.',!matched||!same);
 }catch(e){status('v60PdfStatus','PDF okunamadı: '+(e?.message||'Tarayıcı modül hatası')+'. Dosya yüklenmedi.',true);}
 finally{button.disabled=false;}
}
async function undoPayment(){
 const item=window.HTV60Undo;
 if(!item||!admin()||item.kind!=='payment')return;
 const found=(state.payments||[]).find(x=>x.id===item.id);
 if(!found){window.HTV60Undo=null;await safeRender();return;}
 if(!confirm('Bu oturumda yeni eklediğiniz son kart ödemesini geri almak (silmek) istiyor musunuz? Bu işlem bakiyeyi etkiler.'))return;
 try{
  await api('payments/'+encodeURIComponent(found.id),'DELETE');
  window.HTV60Undo=null;
  await load();
  notice('Son kart ödemesi geri alındı.');
 }catch(e){notice('Geri alma başarısız: '+e.message,true);}
}
root.addEventListener('click',async e=>{
 const button=e.target.closest('[data-v60-action],[data-v60-nav]');if(!button)return;
 if(button.dataset.v60Nav){openTab(button.dataset.v60Nav);return;}
 const action=button.dataset.v60Action;
 if(action==='excel'){try{excelReport();}catch(err){notice(err.message,true);}}
 if(action==='pdf')try{printReport();}catch(err){notice(err.message,true);}
 if(action==='refresh')try{await load();}catch(err){status('v60Status','Kayıtlar okunamadı: '+err.message,true);}
 if(action==='pos')posCompare();
 if(action==='pdf-check')await comparePdf();
 if(action==='undo')await undoPayment();
});
for(const id of ['v60From','v60To','v60SearchType','v60SearchText'])
 byId(id)?.addEventListener(id==='v60SearchText'?'input':'change',()=>{try{updateReport();}catch{}});
window.HTV60={render:safeRender,duplicateWarning,undoPayment,model:()=>lastModel};
window.renderV60=safeRender;
})();