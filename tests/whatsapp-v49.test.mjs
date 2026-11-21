import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function picker(){
  const context={window:{},document:{addEventListener(){}},el:()=>null,state:{directory:{}},notice(){}};
  vm.runInNewContext(read('public/whatsapp-recipients-v49.js'),context);
  return context.window.HTRecipientV49;
}
const data={
  companies:[
    {id:'alpha',name:'ROSHED',phone:'+90 530 976 12 34',visit_day:'Cuma'},
    {id:'beta',name:'Beta Gıda',phone:'+90 532 123 45 67',visit_day:'Salı'},
    {id:'gamma',name:'Gamma',phone:'',visit_day:''}
  ],
  contacts:[
    {id:'a1',company_id:'alpha',full_name:'Adem Naturel',phone:'+90 530 976 12 34',visit_day:'Pazartesi'},
    {id:'a2',company_id:'alpha',full_name:'Ayşe',phone:'+90 530 976 12 35',visit_day:''},
    {id:'b1',company_id:'beta',full_name:'Mehmet',phone:'+90 533 123 45 67',visit_day:''},
    {id:'g1',company_id:'gamma',full_name:'Telefon Yok',phone:'',visit_day:''}
  ]
};
test('V49 targets include eligible reps and firm lines without duplicate numbers',()=>{
  const api=picker(),all=api.buildTargets(data);
  assert.equal(all.length,4);
  assert.deepEqual(Array.from(all.filter(t=>t.company.id==='alpha').map(t=>t.person?.full_name)),
    ['Adem Naturel','Ayşe']);
  assert.ok(all.some(t=>t.company.id==='beta'&&!t.person));
  assert.ok(all.every(t=>t.phone));
  assert.equal(new Set(all.map(t=>t.key)).size,all.length);
});
test('V49 filter matches Turkish firm, representative and digit-only telephone queries',()=>{
  const api=picker(),all=api.buildTargets(data);
  assert.equal(api.filterTargets(all,{search:'roshed'}).length,2);
  assert.equal(api.filterTargets(all,{search:'Adem'}).length,1);
  assert.equal(api.filterTargets(all,{search:'5309761235'}).length,1);
  assert.equal(api.filterTargets(all,{companyId:'beta'}).length,2);
  assert.equal(api.filterTargets(all,{search:'uymaz'}).length,0);
  assert.equal(api.filterTargets(all,{day:'Pazartesi'}).length,1);
  assert.equal(api.filterTargets(all,{day:'Cuma'}).length,1);
  assert.equal(api.filterTargets(all,{day:'Salı'}).length,2);
});
test('V49 relative visit filters follow Istanbul today and tomorrow',()=>{
  const api=picker(),all=api.buildTargets(data);
  const today=api.weekday(0),tomorrow=api.weekday(1);
  assert.deepEqual(Array.from(api.filterTargets(all,{day:'today'}).map(x=>x.key)),
    Array.from(api.filterTargets(all,{day:today}).map(x=>x.key)));
  assert.deepEqual(Array.from(api.filterTargets(all,{day:'tomorrow'}).map(x=>x.key)),
    Array.from(api.filterTargets(all,{day:tomorrow}).map(x=>x.key)));
});
test('V49 picker keeps explicit selections and opens separate manual drafts',()=>{
  const js=read('public/whatsapp-recipients-v49.js');
  const css=read('public/whatsapp-recipients-v49.css');
  const html=read('public/index.html'),directory=read('public/directory-v17.js');
  for(const id of ['dirRecipientSearch','dirRecipientFirmFilter','dirRecipientDayFilter',
    'dirRecipientSelectAll','dirRecipientResults','dirRecipientQueueStatus',
    'dirRecipientPrev','dirRecipientNext','dirRecipientPrepare'])
    assert.ok(js.includes(id),id);
  assert.match(js,/templateId==='visit'\?'tomorrow':''/);
  assert.match(js,/selected\.has\(t\.key\)/);
  assert.match(js,/window\.HTDirectory\.openChat\(/);
  assert.match(js,/hiçbir mesaj otomatik gönderilmez/);
  assert.match(directory,/HTRecipientV49\.choose/);
  assert.match(html,/whatsapp-recipients-v49\.js\?v=49/);
  assert.match(html,/whatsapp-recipients-v49\.css\?v=49/);
  assert.match(css,/@media\(max-width:650px\)/);
  assert.equal(JSON.parse(read('public/version.json')).version,'v79');
});
