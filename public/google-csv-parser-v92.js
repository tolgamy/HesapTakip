'use strict';
// Google Password Manager CSV parser. Operates exclusively on local file text.
// Never logs or persists credentials. Values stay unmodified until explicit save.
(function(){
 function parse(text){
  if(typeof text!=='string'||!text.trim())throw new Error('CSV dosyası boş.');
  const rows=[];let row=[],cell='',quoted=false,closed=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
   const ch=text[i];
   if(quoted){
    if(ch==='"'){
     if(text[i+1]==='"'){cell+='"';i++;}
     else {quoted=false;closed=true;}
    }else cell+=ch;
   }else if(ch==='"'&&cell===''){quoted=true;closed=false;}
   else if(ch===','){row.push(cell);cell='';closed=false;}
   else if(ch==='\r'||ch==='\n'){
    if(ch==='\r'&&text[i+1]==='\n')i++;
    row.push(cell);cell='';closed=false;
    if(row.some(v=>v!==''))rows.push(row);
    row=[];
    if(rows.length>1501)throw new Error('CSV en fazla 1.500 giriş içerebilir.');
   }else{
    if(closed&&ch.trim())throw new Error('CSV tırnak/ayraç biçimi geçersiz.');
    cell+=ch;
   }
  }
  if(quoted)throw new Error('CSV dosyasında kapanmamış tırnak var.');
  row.push(cell);
  if(row.some(v=>v!==''))rows.push(row);
  if(rows.length<2)throw new Error('CSV içinde giriş kaydı bulunmadı.');
  const header=rows.shift().map(v=>v.toLowerCase().trim());
  const keys=['name','url','username','password','note'];
  if(header.length!==keys.length||keys.some(k=>header.filter(h=>h===k).length!==1))
   throw new Error('Google CSV başlıkları name, url, username, password, note olmalı.');
  const index=Object.fromEntries(keys.map(k=>[k,header.indexOf(k)]));
  const entries=rows.map((cells,i)=>{
   if(cells.length!==header.length)throw new Error((i+2)+'. satırın sütun sayısı geçersiz.');
   const value=k=>cells[index[k]];
   const entry={institution_name:value('name').trim(),
    login_name:value('username'),password:value('password'),
    source_url:value('url').trim(),notes:value('note')};
   if(!entry.institution_name||entry.institution_name.length>120||
      entry.login_name.length>120||entry.password.length>500||
      !entry.source_url||entry.source_url.length>500||
      /[\r\n]/.test(entry.source_url)||entry.notes.length>11000)
    throw new Error((i+2)+'. satırda eksik veya fazla uzun bir alan var.');
   return entry;
  });
  if(!entries.length||entries.length>1500)throw new Error('CSV en fazla 1.500 giriş içerebilir.');
  return entries;
 }
 const normalized=v=>String(v??'').trim().normalize('NFKC').toLocaleLowerCase('tr-TR');
 const identity=(name,user,source)=>JSON.stringify([normalized(name),normalized(user),normalized(source)]);
 const sourceType=url=>/^https:\/\//i.test(url)?'HTTPS':
  /^android:\/\//i.test(url)?'Android':/^http:\/\//i.test(url)?'HTTP':'Diğer';
 const sourceFromNotes=(notes,url)=>{
  const line=String(notes||'').split('\n').find(s=>s.startsWith('Google CSV kaynak adresi: '));
  return line?line.slice('Google CSV kaynak adresi: '.length):(url||'');
 };
 window.HTGoogleCSVParser92={parse,identity,sourceType,sourceFromNotes};
})();
