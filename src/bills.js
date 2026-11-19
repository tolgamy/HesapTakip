import {ApiError,requiredText,optionalText,positiveMoney,isoDate,monthPeriod,idText,readJSON} from './validation.js';

// V50: utility invoices are independent of supplier/firm financial movements.
export const billsSchema=[
  `CREATE TABLE IF NOT EXISTS utility_bills (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL CHECK(category IN ('electricity','gas','water','phone','internet','other')),
    provider TEXT NOT NULL,
    subscription_no TEXT NOT NULL DEFAULT '',
    invoice_no TEXT NOT NULL DEFAULT '',
    period TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    amount_kurus INTEGER NOT NULL CHECK(amount_kurus > 0),
    paid_kurus INTEGER NOT NULL DEFAULT 0 CHECK(paid_kurus >= 0),
    paid_on TEXT,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK(paid_kurus <= amount_kurus)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_utility_bills_due ON utility_bills(due_date)',
  'CREATE INDEX IF NOT EXISTS idx_utility_bills_period ON utility_bills(period)'
];

const categories=new Set(['electricity','gas','water','phone','internet','other']);
export function parseBill(data){
  if(!categories.has(data.category))throw new ApiError(400,'Fatura türü geçersiz.');
  const amount_kurus=positiveMoney(data.amount_kurus);
  const paid_kurus=positiveMoney(data.paid_kurus??0,true);
  if(paid_kurus>amount_kurus)throw new ApiError(409,'Ödenen tutar fatura tutarını aşamaz.');
  const paid_on=paid_kurus?isoDate(data.paid_on):null;
  const issue_date=isoDate(data.issue_date);
  const due_date=isoDate(data.due_date);
  if(due_date<issue_date)throw new ApiError(400,'Son ödeme tarihi fatura tarihinden önce olamaz.');
  return {
    category:data.category,
    provider:requiredText(data.provider,'Kurum',120),
    subscription_no:optionalText(data.subscription_no,120),
    invoice_no:optionalText(data.invoice_no,120),
    period:monthPeriod(data.period),
    issue_date,due_date,amount_kurus,paid_kurus,paid_on,
    note:optionalText(data.note,500)
  };
}
const fields=['category','provider','subscription_no','invoice_no','period','issue_date',
 'due_date','amount_kurus','paid_kurus','paid_on','note'];
export async function billsRoute(request,env,path,method){
  if(path==='/api/bills'&&method==='GET'){
    const res=await env.DB.prepare('SELECT * FROM utility_bills ORDER BY due_date ASC,created_at DESC,id DESC LIMIT 3000').all();
    return {bills:res.results};
  }
  if(path==='/api/bills'&&method==='POST'){
    const d=parseBill(await readJSON(request));
    await env.DB.prepare('INSERT INTO utility_bills(id,'+fields.join(',')+') VALUES ('+
      ['?',...fields.map(()=>'?')].join(',')+')')
      .bind(crypto.randomUUID(),...fields.map(key=>d[key])).run();
    return {ok:true};
  }
  const match=path.match(/^\/api\/bills\/([a-f0-9-]{36})$/);
  if(!match)throw new ApiError(404,'Fatura işlemi bulunamadı.');
  const id=idText(match[1]);
  const found=await env.DB.prepare('SELECT id FROM utility_bills WHERE id=?').bind(id).first();
  if(!found)throw new ApiError(404,'Fatura bulunamadı.');
  if(method==='PATCH'){
    const d=parseBill(await readJSON(request));
    await env.DB.prepare('UPDATE utility_bills SET '+fields.map(k=>k+'=?').join(',')+
      ",updated_at=datetime('now') WHERE id=?")
      .bind(...fields.map(k=>d[k]),id).run();
    return {ok:true};
  }
  if(method==='DELETE'){
    await env.DB.prepare('DELETE FROM utility_bills WHERE id=?').bind(id).run();
    return {ok:true};
  }
  throw new ApiError(405,'Bu işlem desteklenmiyor.');
}
