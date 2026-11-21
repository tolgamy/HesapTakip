import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {posArchiveRoute,workflowSchema} from '../src/workflows-v22.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ID='11111111-1111-4111-8111-111111111111';
const makeReq=(path,body)=>new Request('https://example.test/api/'+path,{
 method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function dbMock({group='pos',category='receivable',archived=false}={}){
 const queries=[];
 const db={prepare(sql){const q={sql,args:[],bind(...args){this.args=args;return this;},
  async first(){
   if(sql.includes('FROM firms WHERE id='))return {id:ID,name:'TEB Bank POS',category,receivable_group:group};
   if(sql.includes('FROM archived_pos_firms WHERE firm_id='))return archived?{firm_id:ID}:null;
   return null;
  },
  async all(){return {results:archived?[{firm_id:ID,firm_name:'TEB Bank POS'}]:[]};},
  async run(){queries.push({sql,args:this.args});return {meta:{changes:1}};}};
  return q;}};
 return {db,queries};
}
test('V46 archive keeps all POS movements: reversible, admin-only and confirmed',async()=>{
 const {db,queries}=dbMock();
 const body={firm_id:ID,firm_name:'TEB Bank POS',confirmation:'KALDIR'};
 const path='/api/pos-archive';
 await assert.rejects(()=>posArchiveRoute(makeReq('pos-archive',body),{DB:db},path,'POST','user'),/yalnız yönetici/);
 await assert.rejects(()=>posArchiveRoute(makeReq('pos-archive',{...body,confirmation:'X'}),{DB:db},path,'POST','admin'),/onayı geçersiz/);
 const ok=await posArchiveRoute(makeReq('pos-archive',body),{DB:db},path,'POST','admin');
 assert.deepEqual(ok,{ok:true,archived:true});
 assert.ok(queries.some(q=>q.sql.includes('INSERT INTO archived_pos_firms')&&q.args[0]===ID));
 assert.equal(queries.some(q=>/DELETE FROM (firms|firm_movements|cash_entries)/.test(q.sql)),false);
 const get=await posArchiveRoute(new Request('https://example.test/api/pos-archive'),{DB:db},path,'GET','admin');
 assert.ok(Array.isArray(get.archivedPos));
 const restore=await posArchiveRoute(makeReq('pos-archive/'+ID+'/restore',{}),{DB:db},
  path+'/'+ID+'/restore','POST','admin');
 assert.deepEqual(restore,{ok:true});
 assert.ok(queries.some(q=>q.sql.includes('DELETE FROM archived_pos_firms')));
});
test('V46 archive rejects non-POS accounts, duplicates and wrong firm names',async()=>{
 const body={firm_id:ID,firm_name:'TEB Bank POS',confirmation:'KALDIR'};
 for(const data of [{group:'platform'},{category:'payable'}]){
  const {db}=dbMock(data);
  await assert.rejects(()=>posArchiveRoute(makeReq('pos-archive',body),{DB:db},
   '/api/pos-archive','POST','admin'),/Yalnız POS/);
 }
 const {db}=dbMock({archived:true});
 await assert.rejects(()=>posArchiveRoute(makeReq('pos-archive',body),{DB:db},
  '/api/pos-archive','POST','admin'),/zaten arşivde/);
 assert.ok(workflowSchema.some(q=>q.includes('CREATE TABLE IF NOT EXISTS archived_pos_firms')));
});
test('V46 POS cards expose edit, delete and firm archive but no silent balance mutations',()=>{
 const pos=read('public/pos-v21.js'),manage=read('public/pos-manage-v46.js'),ledger=read('public/ledger-v10.js');
 const html=read('public/index.html'),money=read('public/workflows-v22.js');
 assert.match(pos,/data-v46-pos-firm-edit/);
 assert.match(pos,/data-v46-pos-firm-archive/);
 assert.match(pos,/data-v46-pos-account-edit/);
 assert.match(pos,/data-v46-pos-account-delete/);
 assert.match(pos,/data-v46-pos-account-new/);
 assert.doesNotMatch(pos,/data-v10-pos-new>\\+ POS hesabı aç/);
 assert.match(manage,/window\.openSuiteForm\('account'\)/);
 assert.match(manage,/form\.elements\.is_pos\.value='1'/);
 assert.match(manage,/window\.HTEditAccountV10/);
 assert.match(ledger,/window\.HTEditAccountV10=editAccount/);
 assert.match(manage,/movements\.length/);
 assert.match(manage,/api\('accounts\/'\+a\.id,'DELETE'\)/);
 assert.match(manage,/api\('pos-archive','POST'/);
 assert.match(manage,/data-v46-pos-restore/);
 assert.match(html,/pos-manage-v46\.js\?v=46/);
 assert.match(html,/pos-manage-v46\.css\?v=46/);
 assert.match(html,/ledger-v10\.js\?v=46/);
 assert.match(money,/Bankadaki kullanılabilir para/);
 assert.match(money,/POS hesabındaki para/);
 assert.match(money,/Bekleyen POS tahsilatları/);
 assert.match(money,/money\(b\+posTotal\)/);
 assert.match(read('src/firms.js'),/AND id NOT IN \(SELECT firm_id FROM archived_pos_firms\)/);
 assert.match(read('src/index.js'),/posArchiveRoute/);
 assert.equal(JSON.parse(read('public/version.json')).version,'v70');
});
test('V46 POS summary remains one transaction with no double count',()=>{
 const elements={v22BankTotalValues:{innerHTML:''}};
 const accounts=[{id:'bank',type:'bank'}, {id:'pos',type:'bank',is_pos:1}];
 let bank=55131,account=0,pending=9705373;
 const ctx={state:{accounts},el:id=>elements[id]||null,esc:String,
  currentBalance:id=>id==='bank'?bank:account,money:n=>n.toString(),currentRole:'admin',
  document:{addEventListener(){}},
  window:{renderFirms(){},renderCoreMoney(){},renderSettings(){},
   HTPOS21:{readPos:()=>({posAccounts:[accounts[1]],pending})}},Intl,Date};
 vm.runInNewContext(read('public/workflows-v22.js'),ctx);
 ctx.window.HTV22.renderBankTotal();
 assert.match(elements.v22BankTotalValues.innerHTML,/9760504/);
 bank+=100000;pending-=100000;
 ctx.window.HTV22.renderBankTotal();
 assert.match(elements.v22BankTotalValues.innerHTML,/9760504/);
 assert.match(elements.v22BankTotalValues.innerHTML,/Bankadaki kullanılabilir para/);
});
