import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {institutionSchema,initializeCardCatalog,bulkInstitutionUpdate,institutionRoute} from '../src/card-catalog.js';
import {institutionSeeds} from '../src/institution-seeds.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const cards=read('public/cards-pro.js'),meal=read('public/receivables-v9.js');
const html=read('public/index.html'),pos=read('public/ledger-v10.js');
const catalog=read('src/card-catalog.js');

function mockDB({linkedCards={},linkedFirms={},institutions=[
  {id:'akbank',name:'Akbank',type:'bank',is_active:0,is_custom:0},
  {id:'qnb',name:'QNB',type:'bank',is_active:1,is_custom:0},
  {id:'custom-test',name:'Özel Banka',type:'bank',is_active:1,is_custom:1}
]}={}){
 const batched=[],queries=[],runQueries=[];
 const db={
  prepare(sql){
   const stmt={sql,args:[],
    bind(...args){this.args=args;return this;},
    async first(){
     queries.push(this);
     if(sql.startsWith('SELECT * FROM institutions WHERE id='))return institutions.find(x=>x.id===this.args[0])||null;
     if(sql.includes('COUNT(*)')&&sql.includes('cards'))return {n:linkedCards[this.args[0]]||0};
     if(sql.includes('COUNT(*)')&&sql.includes('firms'))return {n:linkedFirms[this.args[0]]||0};
     return null;
    },
    async all(){return {results:[]};},
    async run(){runQueries.push(this);return {success:true,meta:{changes:1}};}
   };
   return stmt;
  },
  async batch(items){batched.push(items);return items.map(()=>({success:true}))}
 };
 return {db,batched,queries,runQueries};
}

test('Altı yemek kartı ve ayrı EdenredPOS; MultiPay artık hazır seçimde yok',()=>{
 const six=['setcard','multinet','edenred','metropolcard','tokenflex','pluxee'];
 const match=cards.match(/const mealBrandIds=(\[[^\]]+\])/);
 assert.ok(match);
 const list=JSON.parse(match[1].replaceAll("'",'"'));
 assert.deepEqual(list,six);
 const section=meal.slice(meal.indexOf('meal:['),meal.indexOf('platform:['));
 assert.equal((section.match(/\['/g)||[]).length,6);
 for(const brand of ['Setcard','Multinet','Edenred','Metropolcard','Tokenflex','Pluxee'])
  assert.ok(section.includes("'"+brand+"'"));
 assert.doesNotMatch(section,/MultiPay|SETPOS|MultiPOS/);
 assert.doesNotMatch(pos,/data-v11-edenred-pos/);
 assert.doesNotMatch(html,/data-v11-edenred-pos/);
 assert.ok(institutionSeeds.some(i=>i.id==='edenred-pos'&&i.name==='EdenredPOS'&&i.type==='payment'));
 assert.ok(!institutionSeeds.some(i=>i.id==='multipay'));
});
test('Banka tablosunda tek tek seçim, gizliler filtresi, toplu gizle/sil ve banka ekle var',()=>{
 for(const fragment of ['data-v11-select-id','v11HiddenOnly','v11BanksOnly',
  'data-v11-bulk="hide"','data-v11-bulk="show"','data-v11-bulk="delete"',
  'data-v11-select="shown"','Yeni banka ekle','bankShowAll'])
   assert.ok(cards.includes(fragment),fragment);
 assert.match(cards,/confirm\(ids.length/);
 assert.match(html,/bank-manager-v11\.css/);
});
test('Toplu gizleme 2 bankayı tek veritabanı batch içinde pasife alır',async()=>{
 const m=mockDB();
 const result=await bulkInstitutionUpdate({DB:m.db},'hide',['akbank','qnb']);
 assert.equal(result.updated,2);assert.equal(result.action,'hide');
 assert.equal(m.batched.length,1);assert.equal(m.batched[0].length,2);
 assert.ok(m.batched[0].every(s=>s.sql.includes('UPDATE institutions SET is_active=?')&&s.args[0]===0));
});
test('Gizli banka ve yeni banka kalıcı silinebilir, seed yeniden eklenmez',async()=>{
 const m=mockDB();
 const result=await bulkInstitutionUpdate({DB:m.db},'delete',['akbank','custom-test']);
 assert.equal(result.updated,2);
 assert.equal(m.batched.length,1);assert.equal(m.batched[0].length,4);
 assert.equal(m.batched[0].filter(s=>s.sql.includes('deleted_institutions')).length,2);
 assert.equal(m.batched[0].filter(s=>s.sql.includes('DELETE FROM institutions')).length,2);
 assert.match(catalog,/NOT EXISTS \(SELECT 1 FROM deleted_institutions/);
 assert.ok(institutionSchema.some(sql=>sql.includes('deleted_institutions')));
 assert.ok(!institutionSchema.some(sql=>/DROP TABLE/i.test(sql)));
});
test('Kredi kartına veya cari POS kaydına bağlı kurumlar SİLİNMEZ ve toplu işlem yarım kalmaz',async()=>{
 const m=mockDB({linkedCards:{qnb:1}});
 await assert.rejects(()=>bulkInstitutionUpdate({DB:m.db},'delete',['akbank','qnb']),/kredi kartı/);
 assert.equal(m.batched.length,0);
 const other=mockDB({linkedFirms:{akbank:1}});
 await assert.rejects(()=>bulkInstitutionUpdate({DB:other.db},'delete',['akbank']),/cari alacak/);
 assert.equal(other.batched.length,0);
});
test('Tekil hazır banka silme rotası da aynı güvenlik kurallarını uygular',async()=>{
 const m=mockDB();
 const request=new Request('https://hesaptakip.test/api/institutions/akbank',{method:'DELETE'});
 const result=await institutionRoute(request,{DB:m.db},'/api/institutions/akbank','DELETE','admin');
 assert.equal(result.ok,true);
 assert.equal(m.batched.length,1);
});
test('Toplu işlem yalnızca admin; tekrarlı veya hatalı seçim reddedilir',async()=>{
 const m=mockDB();
 const req=new Request('https://hesaptakip.test/api/institutions/bulk',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({action:'hide',ids:['akbank']})
 });
 await assert.rejects(()=>institutionRoute(req,{DB:m.db},'/api/institutions/bulk','POST','viewer'),/yönetici/);
 await assert.rejects(()=>bulkInstitutionUpdate({DB:m.db},'delete',['akbank','akbank']),/birden fazla/);
 await assert.rejects(()=>bulkInstitutionUpdate({DB:m.db},'delete',[]),/1-100/);
 assert.equal(m.batched.length,0);
});
test('Gizli MultiPay otomatik olarak tekrar seçilebilir markaya dönüşmez',()=>{
 assert.match(catalog,/deleted_institutions\(id\) VALUES\('multipay'\)/);
 assert.match(catalog,/is_active=0 WHERE id='multipay'/);
});
