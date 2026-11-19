import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {posArchiveRoute,workflowSchema} from '../src/workflows-v22.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ID='12345678-1234-1234-1234-123456789012';
const path='/api/pos-archive';
const req=(url,data,method='POST')=>new Request('https://test.local/api/'+url,{
 method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)
});
function fake(){
 const archive=new Map(),sql=[];
 const db={
  prepare(query){
   let args=[];
   return {bind(...items){args=items;return this;},
    async first(){
     sql.push(query);
     if(query.includes('FROM firms WHERE id='))return {id:ID,name:'TEB Bank POS',
      category:'receivable',receivable_group:'pos'};
     if(query.includes('FROM archived_pos_firms'))return archive.get(args[0])||null;
     return null;
    },
    async all(){sql.push(query);return {results:[...archive.values()]};},
    async run(){
     sql.push(query);
     if(query.startsWith('INSERT INTO archived_pos_firms'))archive.set(args[0],{
      firm_id:args[0],firm_name:args[1],archived_at:'2026-11-18'});
     if(query.startsWith('DELETE FROM archived_pos_firms')){
      const existed=archive.delete(args[0]);return {meta:{changes:existed?1:0}};
     }
     return {meta:{changes:1}};
    }
   };
  }
 };
 return {env:{DB:db},archive,sql};
}
test('V46 POS ciro delete archives instead of destroying linked movement history',async()=>{
 const x=fake(),params={firm_id:ID,firm_name:'TEB Bank POS',confirmation:'KALDIR'};
 assert.ok(workflowSchema.some(s=>s.includes('CREATE TABLE IF NOT EXISTS archived_pos_firms')));
 const saved=await posArchiveRoute(req('pos-archive',params),x.env,path,'POST','admin');
 assert.equal(saved.archived,true);
 assert.equal(x.archive.size,1);
 assert.ok(x.sql.some(s=>s.startsWith('INSERT INTO archived_pos_firms')));
 assert.ok(!x.sql.some(s=>s.includes('DELETE FROM firm_movements')));
 assert.ok(!x.sql.some(s=>s.includes('DELETE FROM cash_entries')));
 const shown=await posArchiveRoute(new Request('https://test.local/api/pos-archive'),
  x.env,path,'GET','admin');
 assert.equal(shown.archivedPos[0].firm_name,'TEB Bank POS');
 await assert.rejects(()=>posArchiveRoute(req('pos-archive',params),x.env,path,'POST','admin'),
  /zaten arşivde/);
 const result=await posArchiveRoute(req('pos-archive/'+ID+'/restore',{}),
  x.env,path+'/'+ID+'/restore','POST','admin');
 assert.equal(result.ok,true);
 assert.equal(x.archive.size,0);
 const server=read('src/firms.js');
 assert.match(server,/AND id NOT IN \(SELECT firm_id FROM archived_pos_firms\)/);
 assert.match(server,/AND firm_id NOT IN \(SELECT firm_id FROM archived_pos_firms\)/);
});
test('V46 POS archive rejects viewers, forged names and invalid confirmations',async()=>{
 const x=fake(),params={firm_id:ID,firm_name:'TEB Bank POS',confirmation:'KALDIR'};
 await assert.rejects(()=>posArchiveRoute(req('pos-archive',params),x.env,path,'POST','user'),
  {status:403});
 await assert.rejects(()=>posArchiveRoute(req('pos-archive',{...params,firm_name:'Başka'}),
  x.env,path,'POST','admin'),{status:403});
 await assert.rejects(()=>posArchiveRoute(req('pos-archive',{...params,confirmation:'SİL'}),
  x.env,path,'POST','admin'),{status:403});
 assert.equal(x.archive.size,0);
});
test('V46 POS rows expose edit / delete for both daily POS ciro and bank POS accounts',()=>{
 const pos=read('public/pos-v21.js'),manager=read('public/pos-manage-v46.js');
 const html=read('public/index.html'),ledger=read('public/ledger-v10.js');
 assert.match(pos,/data-v46-pos-account-new/);
 assert.match(pos,/data-v46-pos-firm-edit/);
 assert.match(pos,/data-v46-pos-firm-archive/);
 assert.match(pos,/data-v46-pos-account-edit/);
 assert.match(pos,/data-v46-pos-account-delete/);
 assert.match(pos,/data-v46-pos-archive-show/);
 assert.match(manager,/openSuiteForm\('account'\)/);
 assert.match(manager,/form\.elements\.is_pos\.value='1'/);
 assert.match(manager,/HTEditAccountV10\(a.id\)/);
 assert.match(ledger,/window\.HTEditAccountV10=editAccount/);
 assert.match(manager,/api\('pos-archive','POST'/);
 assert.match(manager,/api\('accounts\/'\+a\.id,'DELETE'\)/);
 assert.match(manager,/movements\.length/);
 assert.match(manager,/api\('pos-archive\/'\+data\.v46PosRestore\+'\/restore'/);
 assert.match(html,/pos-v21\.js\?v=53-ledger/);
 assert.match(html,/pos-manage-v46\.js\?v=46/);
 assert.match(html,/pos-manage-v46\.css\?v=46/);
 assert.match(html,/name="ht-build" content="v52"/);
});
test('V46 bank summary keeps waiting receivables separate from spendable bank cash',()=>{
 const html=read('public/workflows-v22.js');
 assert.match(html,/Bankadaki kullanılabilir para/);
 assert.match(html,/POS hesabındaki para/);
 assert.match(html,/Bekleyen POS tahsilatları/);
 assert.match(html,/tamamı kullanılabilir nakit değildir/);
 assert.match(html,/const posTotal=posAccounts\+awaiting/);
 const context={state:{accounts:[
  {id:'bank',type:'bank'},{id:'pos',type:'bank'}]},
  el:id=>id==='v22BankTotalValues'?context.target:null,
  currentBalance:id=>id==='bank'?55131:0,
  money:n=>(n/100).toFixed(2),currentRole:'admin',esc:String,
  window:{renderFirms(){},renderCoreMoney(){},renderSettings(){},
   HTPOS21:{readPos(){return {posAccounts:[{id:'pos'}],pending:9705373};}}},
  document:{addEventListener(){}},Intl,Date,target:{innerHTML:''}};
 vm.runInNewContext(html,context);
 context.window.HTV22.renderBankTotal();
 assert.match(context.target.innerHTML,/97605\.04/);
 assert.match(context.target.innerHTML,/551\.31/);
 assert.match(context.target.innerHTML,/97053\.73/);
});
