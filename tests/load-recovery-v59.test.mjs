import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Execute the actual pure loading/warning section with controlled API results.
// There is no live database access or mutation in these regression checks.
const code=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const begin=code.indexOf('function showDataLoadWarning(');
const end=code.indexOf('function stat(',begin);
assert.ok(begin>0&&end>begin,'load recovery section exists');
const compiled=new Function('api','el','renderAll','window','currentRole','console',
 'let state={cards:[],firms:[],accounts:[]};\n'+code.slice(begin,end)+
 '\nreturn {load,getState:()=>state};');

function environment(failures=[]){
 const panels={
   htDataLoadWarning:{hidden:true,classList:{toggle(){}},dataset:{}},
   appPage:{classList:{toggle(name,on){panels.mainUnavailable=on;}}},
   addAction:{disabled:false},
   htDataLoadMessage:{textContent:''}
 };
 const payload={
   data:{cards:[{id:'card-1'}],statements:[],payments:[]},
   firms:{firms:[{id:'firm-1'}],firmMovements:[]},
   finance:{accounts:[{id:'cash-1'}],entries:[],instruments:[],reminders:[],backupRuns:[]},
   audit:{events:[]},institutions:{institutions:[]},
   directory:{companies:[],contacts:[],templates:[]},logos:{logos:[]},
   'catalog-prefs':{catalogPrefs:[]},'firm-profiles':{profiles:[]},
   'payment-plans':{plans:[],dues:[]},bills:{bills:[]}
 };
 let draws=0,loaded=0;
 const context={HTIdentity:{role:'admin',permissions:[]},HTV26:{afterLoad(){loaded++;}}};
 const api=async path=>{
   if(failures.includes(path))throw Error('Transient server error');
   return payload[path];
 };
 return {
   ...compiled(api,id=>panels[id],()=>{draws++;},context,'admin',{error(){}}),
   panels,getDraws:()=>draws,getAfterLoad:()=>loaded
 };
}

test('one optional endpoint failure never hides real cards firms and accounts',async()=>{
 const run=environment(['bills','catalog-prefs']);
 assert.equal(await run.load(),true);
 assert.deepEqual(run.getState().cards,[{id:'card-1'}]);
 assert.deepEqual(run.getState().firms,[{id:'firm-1'}]);
 assert.deepEqual(run.getState().accounts,[{id:'cash-1'}]);
 assert.equal(run.getDraws(),1);
 assert.equal(run.panels.mainUnavailable,false);
 assert.equal(run.panels.htDataLoadWarning.hidden,false);
 assert.match(run.panels.htDataLoadMessage.textContent,/Faturalar/);
});

test('failure of an essential endpoint never renders misleading zero balances',async()=>{
 const run=environment(['finance']);
 assert.equal(await run.load(),false);
 assert.equal(run.getDraws(),0);
 assert.equal(run.panels.mainUnavailable,true);
 assert.equal(run.panels.addAction.disabled,true);
 assert.match(run.panels.htDataLoadMessage.textContent,/Banka ve kasa/);
 assert.match(run.panels.htDataLoadMessage.textContent,/silinmiş anlamına gelmez/);
});

test('successful retry restores complete core state without database changes',async()=>{
 const run=environment([]);
 assert.equal(await run.load(),true);
 assert.equal(run.panels.htDataLoadWarning.hidden,true);
 assert.equal(run.panels.addAction.disabled,false);
 assert.equal(run.getState().cards.length,1);
 assert.equal(run.getState().firms.length,1);
 assert.equal(run.getState().accounts.length,1);
});
