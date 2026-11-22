'use strict';
// v81 presentation preference only. No account, document, PIN or money state is read/written.
(function(){
  const root=document.documentElement;
  const storageKey='ht-ui-theme-v81';
  const system=typeof window.matchMedia==='function'
    ?window.matchMedia('(prefers-color-scheme: dark)'):null;
  let explicit=null;
  try{
    const stored=window.localStorage.getItem(storageKey);
    if(stored==='dark'||stored==='light')explicit=stored;
  }catch(_error){/* Private browsing and blocked storage: toggle still works in memory. */}
  let active=explicit||(system?.matches?'dark':'light');
  function reflect(){
    root.dataset.htTheme=active;
    const button=document.getElementById('htThemeToggle');
    if(!button)return;
    const dark=active==='dark';
    button.setAttribute('aria-pressed',String(dark));
    button.setAttribute('aria-label',dark?'Açık moda geç':'Koyu moda geç');
    button.title=dark?'Açık modu aç':'Koyu modu aç';
  }
  function choose(next,remember){
    if(next!=='dark'&&next!=='light')return;
    active=next;
    if(remember){
      explicit=next;
      try{window.localStorage.setItem(storageKey,next);}catch(_error){}
    }
    reflect();
  }
  // This file is loaded early, before first paint, to honor saved appearance.
  reflect();
  const bind=()=>{
    const button=document.getElementById('htThemeToggle');
    if(!button)return;
    reflect();
    button.addEventListener('click',()=>choose(active==='dark'?'light':'dark',true));
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
  if(system){
    const change=event=>{if(explicit===null)choose(event.matches?'dark':'light',false);};
    if(typeof system.addEventListener==='function')system.addEventListener('change',change);
    else if(typeof system.addListener==='function')system.addListener(change);
  }
  // Public API is read-only; UI state cannot affect accounting functions.
  window.HTTheme={get:()=>active};
})();