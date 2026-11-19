'use strict';
// V37: search section headings AND locally loaded, permitted record names.
// Never search credentials, saved secrets, notes or password values; no extra network requests.
(function(){
 const entries=[
  {title:'Genel Bakış',area:'Ana Sayfa',path:'overview',perms:['overview'],terms:'ana sayfa anasayfa finansal özet toplam borç alacak'},
  {title:'Finans',area:'Finans',path:'banking',perms:['banking','cards','meal'],terms:'finans yönetimi para'},
  {title:'Kredi Kartlarım',area:'Finans',path:'cards',perms:['cards'],terms:'kredi kartı kredi kartları kartlar kart kesim limit ekstre ödeme'},
  {title:'Bankalarım',area:'Finans',path:'banking',perms:['banking'],terms:'banka bankalar hesap para girişi para çıkışı'},
  {title:'POS ve Ödeme Kuruluşları',area:'Finans',path:'banking',perms:['banking'],terms:'pos sanal pos ciro tahsilat ödeme kuruluşu banka'},
  {title:'Yemek Kartları',area:'Finans',path:'meal',perms:['meal'],terms:'yemek kartı setcard multinet sodexo edenred'},
  {title:'Hesaplar',area:'Hesaplar',section:'accounts',perms:['vault','people','platforms'],terms:'hesaplar alacaklar kullanıcı işlemleri'},
  {title:'Kullanıcı İşlemleri',area:'Hesaplar',section:'accounts',account:'vault',perms:['vault'],terms:'giriş bilgileri şifre parola admin kullanıcı adı kopyala platform banka'},
  {title:'Şahıs Alacaklarım',area:'Hesaplar',section:'accounts',account:'people',perms:['people'],terms:'şahıs şahıslar kişiler kişi alacağı'},
  {title:'Platform Alacaklarım',area:'Hesaplar',section:'accounts',account:'platforms',perms:['platforms'],terms:'platform platformlar getir trendyol yemeksepeti hakediş'},
  {title:'Firmalar',area:'Firmalar',section:'firms',perms:['payables','directory'],terms:'firma rehberi firmalar cari hesap temsilciler'},
  {title:'Firma Borçlarım',area:'Firmalar',path:'payables',perms:['payables'],terms:'firma borçları firmaya ödeme tedarikçi cari'},
  {title:'Faturalar',area:'Firmalar',path:'bills',perms:['payables'],terms:'elektrik doğalgaz su telefon internet abonelik fatura geciken ödeme'},
  {title:'Firma Temsilcileri',area:'Firmalar',path:'directory',perms:['directory'],terms:'rehber firma temsilcisi ziyaret günü telefon whatsapp iletişim'},
  {title:'Temsilci İletişimi',area:'Firmalar',path:'representatives',perms:['directory'],terms:'temsilciler firma temsilcileri whatsapp ziyaret arama'},
  {title:'Ayarlar',area:'Ayarlar',path:'settings',adminOnly:true,terms:'kurumlar logolar logo kategori kullanıcı yönetimi ayar'},
  {title:'Gelişmiş Arama',area:'Diğer',path:'search',adminOnly:true,terms:'tüm finans kayıtlarında ara kayıt araması filtre'},
 ];
 const form=document.getElementById('v36HomeSearchForm');
 const input=document.getElementById('v36HomeSearchInput');
 const list=document.getElementById('v36HomeSearchResults');
 if(!form||!input||!list)return;
 function normalize(value){
  return String(value||'').toLocaleLowerCase('tr-TR').replace(/ı/g,'i')
   .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .replace(/[^a-z0-9]+/g,' ').trim();
 }
 function allowed(entry){
  const identity=window.HTIdentity||{};
  if(identity.role!=='user')return true;
  if(entry.adminOnly)return false;
  const perms=identity.permissions||[];
  return (entry.perms||[]).some(p=>perms.includes(p));
 }
 function records(){
  // Read only data already loaded for the current authorized session.
  const data=typeof state!=='undefined'&&state?state:{};
  const found=[];
  const add=(item)=>{if(item.title&&allowed(item))found.push(item);};
  for(const company of data.directory?.companies||[]){
   add({title:company.name,area:'Firma Rehberi · Firma',kind:'company',
     id:company.id,path:'directory',perms:['directory']});
  }
  for(const person of data.directory?.contacts||[]){
   const company=(data.directory?.companies||[]).find(x=>x.id===person.company_id);
   add({title:person.full_name,area:(company?.name||'Firma')+' · Temsilci',
     kind:'contact',id:person.id,path:'representatives',perms:['directory'],
     terms:company?.name||''});
  }
  for(const firm of data.firms||[]){
   if(firm.category==='payable'){
    add({title:firm.name,area:'Firma Borçlarım · Cari hesap',kind:'payable',
      id:firm.id,path:'payables',perms:['payables']});
   }else if(firm.category==='receivable'){
    const group=firm.receivable_group||'general';
    if(group==='person'||group==='platform'){
     add({title:firm.name,area:group==='person'?'Şahıs Alacaklarım':'Platform Alacaklarım',
      kind:group,id:firm.id,section:'accounts',account:group==='person'?'people':'platforms',
      perms:[group==='person'?'people':'platforms']});
    }else if(group==='meal'){
     add({title:firm.name,area:'Yemek Kartları',kind:'meal',
      id:firm.id,path:'meal',perms:['meal']});
    }else if(group==='pos'){
     add({title:firm.name,area:'POS ve Ödeme Kuruluşları',kind:'pos',
      id:firm.id,path:'banking',perms:['banking']});
    }else{
     add({title:firm.name,area:'Diğer Alacaklar',kind:'receivable',
      id:firm.id,path:'receivables',perms:['platforms','people']});
    }
   }
  }
  for(const card of data.cards||[]){
   add({title:[card.bank,card.nickname].filter(Boolean).join(' · '),
     area:'Kredi Kartlarım',kind:'card',id:card.id,path:'cards',perms:['cards']});
  }
  for(const account of data.accounts||[]){
   if(account.type!=='bank')continue;
   add({title:account.name,area:'Bankalarım',kind:'bank',id:account.id,
     path:'banking',perms:['banking']});
  }
  return found;
 }
 function find(query){
  const q=normalize(query);
  if(!q)return [];
  const terms=q.split(' ').filter(Boolean);
  const candidates=[...entries,...records()];
  return candidates.filter(item=>{
   if(!allowed(item))return false;
   const hay=normalize([item.title,item.area,item.terms].join(' '));
   // Match the record's name or a representative's parent company name.
   return terms.every(word=>hay.includes(word));
  }).sort((a,b)=>{
   const rank=x=>{
    const name=normalize(x.title);
    return name===q?0:name.startsWith(q)?1:name.includes(q)?2:3;
   };
   return rank(a)-rank(b)||a.title.localeCompare(b.title,'tr');
  }).slice(0,12);
 }
 function message(value){
  const p=document.createElement('p');p.className='v36-home-search-message';p.textContent=value;
  list.appendChild(p);
 }
 let visibleResults=[];
 function show(query){
  list.replaceChildren();
  list.hidden=false;
  const q=normalize(query);
  if(!q){message('Aramak istediğin bölüm adını yaz.');input.focus();return;}
  const found=find(query);
  visibleResults=found;
  if(!found.length){message('Bu adla erişebileceğin bölüm veya kayıt bulunamadı. Başka bir kelime dene.');return;}
  const title=document.createElement('p');title.className='v36-home-search-count';
  title.textContent=found.length+' sonuç bulundu';list.appendChild(title);
  for(const [index,item] of found.entries()){
   const button=document.createElement('button');
   button.type='button';button.className='v36-home-search-result';
   button.dataset.v36ResultIndex=String(index);
   button.dataset.v36Target=item.title;
   const name=document.createElement('strong');name.textContent=item.title;
   const area=document.createElement('span');area.textContent=item.area+' · Aç';
   button.append(name,area);list.appendChild(button);
  }
 }
 function focusRecord(item){
  if(item.kind==='company'){
   const day=document.getElementById('dirDayFilter');
   if(day)day.value='';
   const search=document.getElementById('dirSearch');
   if(search)search.value=item.title;
   window.HTDirectory?.render?.();
   document.querySelector('#directoryList .dir-card')?.scrollIntoView?.({block:'start'});
  }else if(item.kind==='contact'){
   const day=document.getElementById('dirQuickDayFilter');
   if(day)day.value='';
   const search=document.getElementById('dirQuickSearch');
   if(search)search.value=item.title;
   window.HTDirectory?.renderQuickRepresentatives?.();
   document.querySelector('#dirQuickList .v37-rep-card')?.scrollIntoView?.({block:'start'});
  }else if(item.kind==='payable'){
   // Existing ledger action navigates directly to the exact saved financial firm.
   const control=[...document.querySelectorAll('[data-firm-view]')]
    .find(node=>node.dataset.firmView===item.id);
   control?.click();
   control?.scrollIntoView?.({block:'center'});
  }else if(item.account){
   const input=document.getElementById('v8AccountSearch');
   if(input){
    input.value=item.title;
    input.dispatchEvent(new Event('input',{bubbles:true}));
   }
   document.querySelector('[data-v8-firm="'+item.id+'"]')?.scrollIntoView?.({block:'start'});
  }else if(item.kind==='bank'){
   const picker=document.getElementById('v31BankFilter');
   if(picker){
    picker.value=item.id;
    picker.dispatchEvent(new Event('change',{bubbles:true}));
   }
  }else if(item.kind==='card'){
   const search=document.getElementById('cardSearch');
   if(search){
    search.value=item.title.split(' · ')[0];
    search.dispatchEvent(new Event('input',{bubbles:true}));
   }
  }
 }
 function open(item){
  if(!allowed(item))return;
  if(item.section){
   if(window.HTV18?.openSection)window.HTV18.openSection(item.section);
   else window.tab?.(item.section==='accounts'?'collections':item.section==='firms'?'payables':'overview');
   if(item.account){
    document.querySelector('[data-v8-accounts="'+item.account+'"]')?.click();
   }
  }else window.tab?.(item.path);
  list.hidden=true;
  if(item.kind)focusRecord(item);
  else window.scrollTo?.({top:0,behavior:'auto'});
 }
 form.addEventListener('submit',event=>{
  event.preventDefault();
  show(input.value);
 });
 input.addEventListener('input',()=>{
  // Do not leave stale hits visible after the query changes.
  list.hidden=true;
  visibleResults=[];
  list.replaceChildren();
 });
 list.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-v36-target]');
  if(!button)return;
  const index=Number(button.dataset.v36ResultIndex);
  const item=Number.isInteger(index)&&index>=0?visibleResults[index]:null;
  if(item)open(item);
 });
 window.HTHomeSearch36={find,normalize};
})();
