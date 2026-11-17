'use strict';
// Harici kütüphane veya sunucuya bilgi göndermeden Excel .xlsx ve PDF yazdırma raporları.
function exportTables(){
 const firms=state.firms||[], movements=state.firmMovements||[];
 const totals=f=>{const list=movements.filter(m=>m.firm_id===f.id);
  const charge=list.filter(m=>m.kind==='charge').reduce((n,m)=>n+m.amount_kurus,0);
  const settled=list.filter(m=>m.kind==='settlement').reduce((n,m)=>n+m.amount_kurus,0);
  return {charge,settled,remaining:charge-settled};};
 const firmType=f=>f.category==='payable'?'Borçlu olduğumuz firma':'Alacaklı olduğumuz firma';
 const kartPaid=id=>state.payments.filter(p=>p.statement_id===id).reduce((n,p)=>n+p.amount_kurus,0);
 const cardMap=new Map(state.cards.map(c=>[c.id,c]));
 const statementMap=new Map(state.statements.map(s=>[s.id,s]));
 const tl=n=>Number((n/100).toFixed(2));
 const borclar=firms.filter(f=>f.category==='payable').reduce((n,f)=>n+totals(f).remaining,0);
 const alacaklar=firms.filter(f=>f.category==='receivable').reduce((n,f)=>n+totals(f).remaining,0);
 const kartBorcu=state.statements.reduce((n,s)=>n+s.amount_kurus-kartPaid(s.id),0);
 const data=[
  {name:'Özet',rows:[['HesapTakip Finans Raporu',''],['Rapor tarihi',trDate()],
    ['Kredi kartı kalan borç (TL)',tl(kartBorcu)],['Firmalara kalan borç (TL)',tl(borclar)],
    ['Firmalardan kalan alacak (TL)',tl(alacaklar)],['Kayıtlı firma sayısı',firms.length],
    ['Not','Tutarlar TL cinsindedir. Banka ile otomatik mutabakat yapılmamıştır.']]},
  {name:'Firma Bakiyeleri',rows:[['Firma','Tür','Telefon','Toplam (TL)','Ödenen / Tahsilat (TL)','Kalan (TL)','Not'],
    ...firms.map(f=>{const t=totals(f);return [f.name,firmType(f),f.phone||'',tl(t.charge),tl(t.settled),tl(t.remaining),f.note||''];})]},
  {name:'Firma Hareketleri',rows:[['Firma','Tür','İşlem','İşlem tarihi','Vade','Tutar (TL)','Not'],
    ...movements.map(m=>{const f=firms.find(x=>x.id===m.firm_id);return [f?.name||'Silinen firma',f?firmType(f):'',
       m.kind==='charge'?'Borç / Alacak':'Ödeme / Tahsilat',m.on_date,m.due_date||'',tl(m.amount_kurus),m.note||''];})]},
  {name:'Kartlar',rows:[['Sahibi','Banka / Kuruluş','Kart adı','Son 4','Kart türü',
  'Bireysel/Ticari','Ek kart','Para birimi','Toplam limit','Kullanılabilir limit','Kullanılan limit',
  'Nakit avans limiti','Kesim günü','Ödeme günü','Son kesim','Son ödeme','Gelecek kesim',
  'Gelecek ödeme','Tahmini sonraki kesim','Tahmini sonraki ödeme','Asgari ödeme %',
  'Durum','Hatırlatmalar','Bağlı IBAN','Faiz notu','Komisyon notu','Not'],
    ...state.cards.map(c=>[c.owner,c.bank,c.nickname,c.last4||'',c.card_type||'credit',
      c.usage_type||'personal',c.is_additional?'Evet':'Hayır',c.currency||'TRY',
      c.credit_limit_kurus==null?'':tl(c.credit_limit_kurus),
      c.available_limit_kurus==null?'':tl(c.available_limit_kurus),
      c.used_limit_kurus==null?'':tl(c.used_limit_kurus),
      c.cash_advance_limit_kurus==null?'':tl(c.cash_advance_limit_kurus),
      c.statement_day||'',c.due_day||'',c.current_statement_date||'',c.current_due_date||'',
      c.display_next_statement_date||'',c.display_next_due_date||'',
      c.following_statement_date||'',c.following_due_date||'',c.min_payment_percent??'',
      c.status||'active',c.reminder_enabled===0?'Kapalı':'Açık',
      c.linked_iban||'',c.interest_note||'',c.commission_note||'',c.note||''])]},
  {name:'Ekstreler',rows:[['Banka / Kart','Sahibi','Dönem','Son ödeme','Ekstre (TL)','Ödenen (TL)','Kalan (TL)','Not'],
    ...state.statements.map(s=>{const c=cardMap.get(s.card_id),p=kartPaid(s.id);
      return [c?c.bank+' / '+c.nickname:'Kart',c?.owner||'',s.period,s.due_date,tl(s.amount_kurus),tl(p),tl(s.amount_kurus-p),s.note||''];})]},
  {name:'Kart Ödemeleri',rows:[['Banka / Kart','Dönem','Ödeme tarihi','Tutar (TL)','Not'],
    ...state.payments.map(p=>{const s=statementMap.get(p.statement_id),c=cardMap.get(s?.card_id);
      return [c?c.bank+' / '+c.nickname:'Kart',s?.period||'',p.paid_on,tl(p.amount_kurus),p.note||''];})]}
 ];
 const accounts=state.accounts||[],entries=state.entries||[],instruments=state.instruments||[];
 const getBalance=a=>a.opening_kurus+entries.filter(e=>e.account_id===a.id)
   .reduce((n,e)=>n+(e.direction==='in'?e.amount_kurus:-e.amount_kurus),0);
 data.push(
  {name:'Kurum Katalog',rows:[['Ad','Kısa ad','Tür','Web alan adı','Arama anahtarları','Durum'],
   ...(state.institutions||[]).map(i=>[i.name,i.short_name,i.type,i.domain,
      i.search_keywords,i.is_active?'Aktif':'Pasif'])]}
 );
 data.push(
  {name:'Kasa Banka',rows:[['Hesap adı','Tür','Açılış (TL)','Güncel bakiye (TL)','Not'],
   ...accounts.map(a=>[a.name,a.type==='cash'?'Kasa':'Banka',tl(a.opening_kurus),tl(getBalance(a)),a.note||''])]},
  {name:'Nakit Hareketleri',rows:[['Hesap','Tarih','Yön','Kategori','Tutar (TL)','Not'],
   ...entries.map(e=>[accounts.find(a=>a.id===e.account_id)?.name||'',e.entry_date,
     e.direction==='in'?'Giriş':'Çıkış',e.category,tl(e.amount_kurus),e.note||''])]},
  {name:'Cek Senet',rows:[['Evrak','Yön','Firma veya kişi','Evrak no','Tutar (TL)','Düzenleme','Vade','Durum','Not'],
   ...instruments.map(p=>[p.type==='check'?'Çek':'Senet',p.direction==='payable'?'Verilen':'Alınan',
     p.party,p.reference||'',tl(p.amount_kurus),p.issue_date,p.due_date,p.status,p.note||''])]},
  {name:'Hatirlatmalar',rows:[['Konu','Kaynak','Son tarih','Tutar (TL)','Gün kala','Oluşturuldu','Okundu'],
   ...(state.reminders||[]).map(r=>[r.subject,r.source,r.due_date,tl(r.amount_kurus),
      r.offset_days,r.generated_at,r.read_at||''])]}
 );
 return data;
}
const xmlEsc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const xmlSafe=s=>xmlEsc(String(s??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,''));
function sheetXml(rows){
 const lines=rows.map((row,i)=>{
  const cells=row.map((v,j)=>{
   const col=(n)=>{let out='';for(n++;n;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out;};
   const cell=col(j)+(i+1);
   if(typeof v==='number' && Number.isFinite(v))return '<c r="'+cell+'" s="1"><v>'+v+'</v></c>';
   return '<c r="'+cell+'" t="inlineStr"><is><t xml:space="preserve">'+xmlSafe(v)+'</t></is></c>';
  }).join('');
  return '<row r="'+(i+1)+'">'+cells+'</row>';
 }).join('');
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
 '<sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="17"/>'+
 '<sheetData>'+lines+'</sheetData></worksheet>';
}
function u16(n){return [n&255,(n>>8)&255];}
function u32(n){return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];}
function crc32(data){
 let crc=0xFFFFFFFF;
 for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xEDB88320:0);}
 return (crc^0xFFFFFFFF)>>>0;
}
// ZIP STORE: gerçek XLSX (OOXML) dosyası. Harici servis veya CDN gerekmez.
function makeZip(files){
 const encoder=new TextEncoder(),locals=[],centers=[];let offset=0,centerBytes=0;
 for(const [fileName,body] of files){
  const name=encoder.encode(fileName),data=encoder.encode(body),sum=crc32(data);
  const local=new Uint8Array([80,75,3,4,...u16(20),...u16(0x800),...u16(0),...u16(0),...u16(0),
    ...u32(sum),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0)]);
  locals.push(local,name,data);
  const central=new Uint8Array([80,75,1,2,...u16(20),...u16(20),...u16(0x800),...u16(0),
    ...u16(0),...u16(0),...u32(sum),...u32(data.length),...u32(data.length),...u16(name.length),
    ...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset)]);
  centers.push(central,name);
  offset+=local.length+name.length+data.length;
  centerBytes+=central.length+name.length;
 }
 const ending=new Uint8Array([80,75,5,6,...u16(0),...u16(0),...u16(files.length),
    ...u16(files.length),...u32(centerBytes),...u32(offset),...u16(0)]);
 const out=new Uint8Array(offset+centerBytes+ending.length);let cursor=0;
 for(const part of [...locals,...centers,ending]){out.set(part,cursor);cursor+=part.length;}
 return out;
}
function makeXlsx(tables){
 const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 const files=[
  ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
   '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
   '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
   '<Default Extension="xml" ContentType="application/xml"/>'+
   '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
   '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+
   tables.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>'],
  ['_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="'+rel+'/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
  ['xl/workbook.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="'+ns+'" xmlns:r="'+rel+'"><sheets>'+tables.map((t,i)=>'<sheet name="'+xmlSafe(t.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>'],
  ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+tables.map((t,i)=>'<Relationship Id="rId'+(i+1)+'" Type="'+rel+'/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId'+(tables.length+1)+'" Type="'+rel+'/styles" Target="styles.xml"/></Relationships>'],
  ['xl/styles.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="'+ns+'"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" xfId="0"/><xf numFmtId="2" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>'],
  ...tables.map((t,i)=>['xl/worksheets/sheet'+(i+1)+'.xml',sheetXml(t.rows)])
 ];
 return makeZip(files);
}
function downloadExport(content,name,type){
 const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');
 a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function exportExcel(){
 try{
  downloadExport(makeXlsx(exportTables()),'HesapTakip-rapor-'+trDate()+'.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  notice('Excel raporu indirildi. Dosyada finansal kayıtlar bulunur; güvenli saklayın.');
 }catch(e){notice('Excel raporu hazırlanamadı: '+e.message,true);}
}
function exportPdf(){
 const tables=exportTables();
 const win=window.open('','_blank');
 if(!win){notice('PDF için açılır pencereye izin verin.',true);return;}
 const body=tables.map(t=>'<section class="report-section"><h2>'+esc(t.name)+'</h2><table><thead><tr>'+
   (t.rows[0]||[]).map(v=>'<th>'+esc(v)+'</th>').join('')+'</tr></thead><tbody>'+
   t.rows.slice(1).map(row=>'<tr>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+
   '</tbody></table></section>').join('');
 let printed=false;
 const runPrint=()=>{if(printed||win.closed)return;printed=true;win.focus();win.print();};
 win.addEventListener('load',runPrint,{once:true});
 win.document.open();
 win.document.write('<!doctype html><html lang="tr"><head><meta charset="utf-8">'+
   '<title>HesapTakip Rapor '+trDate()+'</title><link rel="stylesheet" href="/report.css"></head>'+
   '<body><header><h1>HesapTakip • Finans Raporu</h1><p>Rapor tarihi: '+trDate()+
   ' · Tüm tutarlar Türk Lirası (TL) cinsindendir.</p></header>'+body+
   '<footer>Bu rapor elle girilen kayıtlardan hazırlanmıştır. Banka mutabakatı yerine geçmez.</footer></body></html>');
 win.document.close();
 setTimeout(runPrint,1000);
 // Bazı tarayıcılarda load olayı belgeler kapatılmadan tetiklenebilir.
 notice('Yazdırma ekranında hedef olarak “PDF olarak kaydet” seçin.');
}
el('excelBtn').addEventListener('click',exportExcel);
el('pdfBtn').addEventListener('click',exportPdf);


// Firma bazında hesap ekstresi: hareket tarihleri, borç/alacak, tahsilat/ödeme ve yürüyen bakiye.
function firmStatementTable(firmId) {
 const firm=(state.firms||[]).find(f=>f.id===firmId);
 if(!firm)throw new Error('Firma bulunamadı.');
 const isPayable=firm.category==='payable';
 const moves=(state.firmMovements||[]).filter(m=>m.firm_id===firmId)
   .slice().sort((a,b)=>a.on_date.localeCompare(b.on_date)||a.id.localeCompare(b.id));
 let balance=0,charge=0,settled=0;
 const records=moves.map(m=>{
  const positive=m.kind==='charge';
  if(positive)charge+=m.amount_kurus;else settled+=m.amount_kurus;
  balance+=positive?m.amount_kurus:-m.amount_kurus;
  return [m.on_date,positive?(isPayable?'Borç':'Alacak'):(isPayable?'Ödeme':'Tahsilat'),
    m.due_date||'',Number((m.amount_kurus/100).toFixed(2)),
    Number((balance/100).toFixed(2)),m.note||''];
 });
 const data=[
  ['Firma Cari Hesap Ekstresi',''],
  ['Firma adı',firm.name],['Cari hesap türü',isPayable?'Borçlu olduğumuz':'Alacaklı olduğumuz'],
  ['Rapor tarihi',trDate()],['Toplam borç/alacak (TL)',Number((charge/100).toFixed(2))],
  ['Toplam ödeme/tahsilat (TL)',Number((settled/100).toFixed(2))],
  ['Kalan bakiye (TL)',Number((balance/100).toFixed(2))],
  [],['Tarih','İşlem','Vade','Tutar (TL)','Bakiye (TL)','Açıklama'],
  ...records
 ];
 return {firm,records,totals:{charge,settled,balance},tables:[{name:'Cari Ekstre',rows:data}]};
}
function exportFirmStatement(firmId,format) {
 try {
  const report=firmStatementTable(firmId);
  const fileBase='HesapTakip-Cari-Ekstre-'+trDate();
  if(format==='excel'){
   downloadExport(makeXlsx(report.tables),fileBase+'.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
   notice('Firma cari ekstresi Excel olarak indirildi.');
   return;
  }
  if(format!=='pdf')throw new Error('Bilinmeyen rapor türü');
  const w=window.open('','_blank');
  if(!w){notice('PDF yazdırması için açılır pencere izni gerekli.',true);return;}
  const {firm,records,totals}=report;
  const head=['Tarih','İşlem','Vade','Tutar (TL)','Bakiye (TL)','Açıklama'];
  const table='<table><thead><tr>'+head.map(v=>'<th>'+esc(v)+'</th>').join('')+
    '</tr></thead><tbody>'+
    records.map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+
    '</tbody></table>';
  let printed=false;
  const printOnce=()=>{if(printed||w.closed)return;printed=true;w.focus();w.print();};
  w.addEventListener('load',printOnce,{once:true});
  w.document.open();
  w.document.write('<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>'+
    'HesapTakip Firma Cari Ekstre</title><link rel="stylesheet" href="/report.css"></head>'+
    '<body><header><h1>'+esc(firm.name)+' · Cari Hesap Ekstresi</h1>'+
    '<p>'+esc(firm.category==='payable'?'Borçlu olduğumuz firma':'Alacaklı olduğumuz firma')+
    ' · Rapor tarihi: '+trDate()+'</p></header>'+
    '<section class="report-section"><h2>Özet</h2><p>Toplam borç/alacak: '+money(totals.charge)+
    ' | Ödenen/tahsilat: '+money(totals.settled)+' | Kalan: '+money(totals.balance)+'</p>'+table+
    '</section><footer>Kaydedilmiş cari hesap hareketlerine göre oluşturulmuştur.</footer></body></html>');
  w.document.close();
  setTimeout(printOnce,1000);
  notice('Yazdırma penceresinde “PDF olarak kaydet” seçin.');
 }catch(e){notice(e.message,true);}
}
window.exportFirmStatement=exportFirmStatement;
