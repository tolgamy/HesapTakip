'use strict';
// V36: search app headings and navigate to existing pages. No record contents
// or passwords are searched, persisted, indexed or sent to a server.
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
 function find(query){
  const q=normalize(query);
  if(!q)return [];
  const terms=q.split(' ').filter(Boolean);
  return entries.filter(item=>{
   if(!allowed(item))return false;
   const hay=normalize([item.title,item.area,item.terms].join(' '));
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
 function show(query){
  list.replaceChildren();
  list.hidden=false;
  const q=normalize(query);
  if(!q){message('Aramak istediğin bölüm adını yaz.');input.focus();return;}
  const found=find(query);
  if(!found.length){message('Bu adla erişebileceğin bir bölüm bulunamadı. Başka bir kelime dene.');return;}
  const title=document.createElement('p');title.className='v36-home-search-count';
  title.textContent=found.length+' bölüm bulundu';list.appendChild(title);
  for(const item of found){
   const button=document.createElement('button');
   button.type='button';button.className='v36-home-search-result';
   button.dataset.v36Target=item.title;
   const name=document.createElement('strong');name.textContent=item.title;
   const area=document.createElement('span');area.textContent=item.area+' · Aç';
   button.append(name,area);list.appendChild(button);
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
  window.scrollTo?.({top:0,behavior:'auto'});
 }
 form.addEventListener('submit',event=>{
  event.preventDefault();
  show(input.value);
 });
 input.addEventListener('input',()=>{
  // Do not leave stale hits visible after the query changes.
  list.hidden=true;
  list.replaceChildren();
 });
 list.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-v36-target]');
  if(!button)return;
  const item=entries.find(x=>x.title===button.dataset.v36Target);
  if(item)open(item);
 });
 window.HTHomeSearch36={find,normalize};
})();
