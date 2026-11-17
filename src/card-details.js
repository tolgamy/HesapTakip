import {ApiError,requiredText,optionalText,lastFour,positiveMoney,isoDate} from './validation.js';

const enumField=(v,values,label,fallback)=> {
 const value=v===undefined||v===null||v===''?fallback:v;
 if(!values.includes(value))throw new ApiError(400,label+' geçersiz.');
 return value;
};
const amountOptional=(v)=>v===undefined||v===null||v===''?null:positiveMoney(v,true);
const dateOptional=(v)=>v===undefined||v===null||v===''?null:isoDate(v);
const dayOptional=(v)=> {
 if(v===undefined||v===null||v==='')return null;
 if(!Number.isInteger(v)||v<1||v>31)throw new ApiError(400,'Ayın günü 1-31 arasında olmalı.');
 return v;
};
export function parseCardDetails(data) {
 const bank=requiredText(data.bank,'Kurum/Banka',120);
 const institution_id=data.institution_id===undefined||data.institution_id===null||data.institution_id===''?null:
  (/^[a-z0-9][a-z0-9_-]{1,79}$/.test(data.institution_id)?data.institution_id:
    (()=>{throw new ApiError(400,'Kurum seçimi geçersiz.');})());
 const credit_limit_kurus=amountOptional(data.credit_limit_kurus);
 const available_limit_kurus=amountOptional(data.available_limit_kurus);
 const cash_advance_limit_kurus=amountOptional(data.cash_advance_limit_kurus);
 if(credit_limit_kurus!==null&&available_limit_kurus!==null&&available_limit_kurus>credit_limit_kurus)
  throw new ApiError(400,'Kullanılabilir limit toplam limiti aşamaz.');
 const min_payment_percent=data.min_payment_percent===undefined||data.min_payment_percent===null||data.min_payment_percent===''?
  null:Number(data.min_payment_percent);
 if(min_payment_percent!==null&&(!Number.isFinite(min_payment_percent)||min_payment_percent<0||min_payment_percent>100))
  throw new ApiError(400,'Asgari ödeme oranı 0-100 arasında olmalı.');
 const linked_iban=optionalText(data.linked_iban,40).replace(/\s/g,'').toUpperCase();
 if(linked_iban&&!/^[A-Z]{2}[A-Z0-9]{13,32}$/.test(linked_iban))
  throw new ApiError(400,'IBAN biçimi geçersiz.');
 const color=optionalText(data.color,7)||'#0a2c38';
 if(!/^#[a-fA-F0-9]{6}$/.test(color))throw new ApiError(400,'Renk geçersiz.');
 return {
  owner:requiredText(data.owner,'Kart sahibi',70),
  bank,nickname:requiredText(data.nickname,'Kart adı',70),
  last4:lastFour(data.last4),institution_id,
  card_type:enumField(data.card_type,['credit','debit','virtual','pos'],'Kart tipi','credit'),
  usage_type:enumField(data.usage_type,['personal','business'],'Kart kullanımı','personal'),
  is_additional:data.is_additional===true||data.is_additional===1?1:0,
  credit_limit_kurus,available_limit_kurus,cash_advance_limit_kurus,
  statement_day:dayOptional(data.statement_day),
  due_day:dayOptional(data.due_day),
  current_statement_date:dateOptional(data.current_statement_date),
  current_due_date:dateOptional(data.current_due_date),
  next_statement_date:dateOptional(data.next_statement_date),
  next_due_date:dateOptional(data.next_due_date),
  currency:enumField(data.currency,['TRY','USD','EUR','GBP'],'Para birimi','TRY'),
  status:enumField(data.status,['active','passive','cancelled'],'Kart durumu','active'),
  reminder_enabled:data.reminder_enabled===false||data.reminder_enabled===0?0:1,
  min_payment_percent,interest_note:optionalText(data.interest_note,280),
  commission_note:optionalText(data.commission_note,280),
  linked_iban,note:optionalText(data.note,280),color
 };
}
export const cardDetailsKeys=['owner','bank','nickname','last4','institution_id','card_type','usage_type',
 'is_additional','credit_limit_kurus','available_limit_kurus','cash_advance_limit_kurus',
 'statement_day','due_day','current_statement_date','current_due_date',
 'next_statement_date','next_due_date','currency','status','reminder_enabled',
 'min_payment_percent','interest_note','commission_note','linked_iban','note','color'];
function dayInMonth(year,month,day){
 return String(year)+'-'+String(month).padStart(2,'0')+'-'+String(Math.min(day,new Date(Date.UTC(year,month,0)).getUTCDate())).padStart(2,'0');
}
function addMonth(year,month,diff){
 const d=new Date(Date.UTC(year,month-1+diff,1));
 return [d.getUTCFullYear(),d.getUTCMonth()+1];
}
export function estimateCardDates(card,today) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(today))throw new ApiError(400,'Hesaplama tarihi geçersiz.');
 const statement_day=card.statement_day, due_day=card.due_day;
 if(!statement_day||!due_day)return {estimated_statement_date:null,estimated_due_date:null,
  following_statement_date:null,following_due_date:null};
 const year=Number(today.slice(0,4)),month=Number(today.slice(5,7));
 let [y,m]=[year,month];
 let statement=dayInMonth(y,m,statement_day);
 if(statement<=today){[y,m]=addMonth(y,m,1);statement=dayInMonth(y,m,statement_day);}
 const dueMonthShift=due_day<=statement_day?1:0;
 const [dy,dm]=addMonth(y,m,dueMonthShift);
 const [fy,fm]=addMonth(y,m,1);
 const [fdy,fdm]=addMonth(fy,fm,dueMonthShift);
 return {
  estimated_statement_date:statement,estimated_due_date:dayInMonth(dy,dm,due_day),
  following_statement_date:dayInMonth(fy,fm,statement_day),
  following_due_date:dayInMonth(fdy,fdm,due_day)
 };
}
export function enrichCard(card,today){
 const estimated=estimateCardDates(card,today);
 const credit=card.credit_limit_kurus,available=card.available_limit_kurus;
 return {...card,...estimated,display_next_statement_date:card.next_statement_date||estimated.estimated_statement_date,
  display_next_due_date:card.next_due_date||estimated.estimated_due_date,
  used_limit_kurus:credit!==null&&available!==null?Math.max(0,credit-available):null};
}
