'use strict';
// V49: searchable, filterable, explicit multi-recipient WhatsApp drafts.
// Every recipient is opened separately; no message is sent automatically.
(function(){
  const days=['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar'];
  const safe=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const norm=x=>String(x||'').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g,' ');
  const digits=x=>String(x||'').replace(/\D/g,'');
  const weekday=offset=>{
    const name=new Intl.DateTimeFormat('tr-TR',{weekday:'long',timeZone:'Europe/Istanbul'})
      .format(new Date(Date.now()+offset*86400000));
    return name[0].toLocaleUpperCase('tr-TR')+name.slice(1);
  };
  const visitDay=t=>t.person?.visit_day||t.company?.visit_day||'';
  let queue=[],queuePosition=0,queueTemplate='';

  function buildTargets(data){
    const companies=new Map((data.companies||[]).map(c=>[String(c.id),c]));
    const seen=new Set(),targets=[];
    const add=(company,person,phone)=>{
      const number=digits(phone);
      if(!company||number.length<10)return;
      // The same telephone number belonging to the same firm is one recipient.
      // Prefer the representative's name over a duplicate company line.
      const dedup=String(company.id)+'|'+number;
      if(seen.has(dedup))return;
      seen.add(dedup);
      targets.push({company,person:person||null,phone,
        key:String(company.id)+'|'+String(person?.id||'firm')+'|'+number});
    };
    for(const p of data.contacts||[])add(companies.get(String(p.company_id)),p,p.phone);
    for(const c of data.companies||[])add(c,null,c.phone);
    return targets.sort((a,b)=>a.company.name.localeCompare(b.company.name,'tr')||
      String(a.person?.full_name||'').localeCompare(String(b.person?.full_name||''),'tr'));
  }

  function filterTargets(targets,{search='',companyId='',day=''}={}){
    const q=norm(search),numberQuery=digits(search);
    const chosenDay=day==='today'?weekday(0):day==='tomorrow'?weekday(1):day;
    return targets.filter(t=>{
      if(companyId&&String(t.company.id)!==String(companyId))return false;
      if(chosenDay&&visitDay(t)!==chosenDay)return false;
      if(!q)return true;
      const haystack=norm([t.company.name,t.person?.full_name||'Firma hattı',t.phone].join(' '));
      return haystack.includes(q)||(numberQuery.length>0&&digits(t.phone).includes(numberQuery));
    });
  }

  function ensureQueueBar(){
    const dialog=el('dirMessageDialog');
    if(!dialog||el('dirRecipientQueueBar'))return;
    dialog.insertAdjacentHTML('beforeend',
      '<section id="dirRecipientQueueBar" class="dir-recipient-queue" hidden>'+
      '<p id="dirRecipientQueueStatus" role="status" aria-live="polite"></p>'+
      '<div class="dir-recipient-queue-actions">'+
      '<button type="button" class="btn subtle" id="dirRecipientPrev">Önceki alıcı</button>'+
      '<button type="button" class="btn primary" id="dirRecipientNext">Sonraki alıcı</button></div>'+
      '<p class="hint">Her mesajı WhatsApp içinde kendin gönder. Sonraki alıcıya geçmek gönderim yapmaz.</p></section>');
    el('dirRecipientPrev').onclick=()=>openQueue(queuePosition-1);
    el('dirRecipientNext').onclick=()=>openQueue(queuePosition+1);
  }

  function refreshQueue(){
    ensureQueueBar();
    const bar=el('dirRecipientQueueBar');
    if(!bar)return;
    bar.hidden=queue.length<2;
    if(queue.length<2)return;
    el('dirRecipientQueueStatus').textContent='Alıcı '+(queuePosition+1)+' / '+queue.length+
      ' — '+queue[queuePosition].company.name+' · '+
      (queue[queuePosition].person?.full_name||'Firma hattı');
    el('dirRecipientPrev').disabled=queuePosition===0;
    el('dirRecipientNext').disabled=queuePosition===queue.length-1;
  }

  function clearQueue(){
    queue=[];queuePosition=0;queueTemplate='';
    const bar=el('dirRecipientQueueBar');
    if(bar)bar.hidden=true;
  }

  function openQueue(index){
    if(index<0||index>=queue.length)return;
    queuePosition=index;
    const t=queue[index],dialog=el('dirMessageDialog');
    if(dialog?.open)dialog.close();
    window.HTDirectory.openChat(t.company.id,t.person?.id||'',queueTemplate);
    refreshQueue();
  }

  function choose(templateId){
    const template=window.HTDirectory?.getTemplate?.(templateId);
    if(!template)return;
    clearQueue();
    const data=state.directory||{companies:[],contacts:[]};
    const targets=buildTargets(data);
    if(!targets.length){
      notice('WhatsApp için Firma Rehberi bölümünde telefon numarası kayıtlı olmalı.',true);
      return;
    }
    const firms=[...new Map(targets.map(t=>[String(t.company.id),t.company])).values()]
      .sort((a,b)=>a.name.localeCompare(b.name,'tr'));
    const selected=new Set();
    el('modalTitle').textContent=template.title+' · WhatsApp alıcıları';
    el('modalContents').innerHTML=
      '<form id="dirTemplateRecipientForm" class="modal-form">'+
      '<div class="dir-recipient-filters">'+
      '<div><label for="dirRecipientSearch">Firma, temsilci veya telefon ara</label>'+
      '<input id="dirRecipientSearch" type="search" autocomplete="off" placeholder="İsim veya telefon numarası..."></div>'+
      '<div><label for="dirRecipientFirmFilter">Firma filtresi</label>'+
      '<select id="dirRecipientFirmFilter"><option value="">Tüm firmalar</option>'+
      firms.map(c=>'<option value="'+safe(c.id)+'">'+safe(c.name)+'</option>').join('')+'</select></div>'+
      '<div><label for="dirRecipientDayFilter">Ziyaret günü</label>'+
      '<select id="dirRecipientDayFilter"><option value="">Tüm günler</option>'+
      '<option value="today">Bugün ziyaret edecekler</option>'+
      '<option value="tomorrow">Yarın ziyaret edecekler</option>'+
      days.map(day=>'<option value="'+safe(day)+'">'+safe(day)+'</option>').join('')+
      '</select></div></div>'+
      '<div class="dir-recipient-toolbar">'+
      '<label for="dirRecipientSelectAll"><input id="dirRecipientSelectAll" type="checkbox"> Görünenlerin tümünü seç</label>'+
      '<span id="dirRecipientCount" role="status" aria-live="polite"></span></div>'+
      '<div id="dirRecipientResults" class="dir-recipient-results" role="group" aria-label="WhatsApp alıcıları"></div>'+
      '<p class="hint">Seçili alıcılar filtre değişse de korunur. Her kişiye ayrı mesaj taslağı açılır; hiçbir mesaj otomatik gönderilmez.</p>'+
      '<div class="form-actions"><button type="button" class="btn subtle" id="dirTemplateRecipientCancel">Vazgeç</button>'+
      '<button class="btn primary" type="submit" id="dirRecipientPrepare" disabled>Mesajları hazırla</button></div></form>';
    el('dirRecipientDayFilter').value=templateId==='visit'?'tomorrow':'';
    const current=()=>filterTargets(targets,{
      search:el('dirRecipientSearch').value,
      companyId:el('dirRecipientFirmFilter').value,
      day:el('dirRecipientDayFilter').value
    });
    const repaint=()=>{
      const filtered=current();
      el('dirRecipientResults').innerHTML=filtered.length?filtered.map(t=>
        '<label class="dir-recipient-item"><input type="checkbox" data-dir-recipient-key="'+safe(t.key)+'"'+
        (selected.has(t.key)?' checked':'')+'>'+
        '<span><strong>'+safe(t.company.name)+'</strong>'+
        '<small>'+safe(t.person?.full_name||'Firma hattı')+' · '+safe(t.phone)+
        (visitDay(t)?' · '+safe(visitDay(t)):'')+'</small></span></label>').join(''):
        '<p class="dir-recipient-empty">Bu filtrelere uyan alıcı yok. Aramayı veya ziyaret gününü değiştirebilirsin.</p>';
      const all=el('dirRecipientSelectAll');
      all.disabled=filtered.length===0;
      all.checked=filtered.length>0&&filtered.every(t=>selected.has(t.key));
      all.indeterminate=filtered.some(t=>selected.has(t.key))&&!all.checked;
      el('dirRecipientCount').textContent=selected.size+' seçili · '+filtered.length+' görüntüleniyor';
      el('dirRecipientPrepare').disabled=selected.size===0;
    };
    el('dirRecipientSearch').addEventListener('input',repaint);
    el('dirRecipientFirmFilter').addEventListener('change',repaint);
    el('dirRecipientDayFilter').addEventListener('change',repaint);
    el('dirRecipientSelectAll').addEventListener('change',event=>{
      for(const t of current())event.target.checked?selected.add(t.key):selected.delete(t.key);
      repaint();
    });
    el('dirRecipientResults').addEventListener('change',event=>{
      const input=event.target.closest?.('[data-dir-recipient-key]');
      if(!input)return;
      input.checked?selected.add(input.dataset.dirRecipientKey):selected.delete(input.dataset.dirRecipientKey);
      repaint();
    });
    el('dirTemplateRecipientCancel').onclick=()=>el('modal').close();
    el('dirTemplateRecipientForm').onsubmit=event=>{
      event.preventDefault();
      queue=targets.filter(t=>selected.has(t.key));
      if(!queue.length){notice('En az bir alıcı seç.',true);return;}
      queueTemplate=templateId;
      queuePosition=0;
      el('modal').close();
      openQueue(0);
    };
    repaint();
    el('modal').showModal();
  }

  // Opening an unrelated one-to-one WhatsApp shortcut must not show a stale queue.
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('[data-dir-chat],[data-dir-visit-chat],[data-dir-template-send],#dirMessageClose'))
      clearQueue();
  },true);
  window.HTRecipientV49={choose,buildTargets,filterTargets,visitDay,weekday,clearQueue};
})();
