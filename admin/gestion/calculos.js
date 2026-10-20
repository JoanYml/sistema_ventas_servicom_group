const EMPLOYEE_STATUSES={active:'Activo',leave:'De licencia',inactive:'Inactivo'};
const FINANCE_KINDS={asset:'Activo',liability:'Pasivo',equity:'Patrimonio',income:'Ingreso',expense:'Gasto'};
function managementNormalize(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
function managementToday(){return dashboardDay(new Date())}
function financeCents(value){
 const text=String(value??0);if(!/^-?\d+(?:\.\d{1,2})?$/.test(text))throw Error('Importe monetario inválido');
 const negative=text.startsWith('-'),[whole,fraction='']=text.replace('-','').split('.');const amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(amount))throw Error('Importe fuera del rango admitido');return negative?-amount:amount;
}
function financeDecimal(cents){return (cents<0?'-':'')+Math.floor(Math.abs(cents)/100)+'.'+String(Math.abs(cents)%100).padStart(2,'0')}
function financeMoneyCents(cents){return 'S/ '+new Intl.NumberFormat('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(cents===0?0:cents/100)}
function financeMoney(value){return financeMoneyCents(financeCents(value))}
function financeTrialBalance(accounts){
 const rows=accounts.filter(a=>[a.opening,a.debit,a.credit,a.closing].some(value=>financeCents(value)!==0)).map(account=>{
  const opening=financeCents(account.opening),closing=financeCents(account.closing);
  return {account,amounts:[Math.max(opening,0),Math.max(0-opening,0),financeCents(account.debit),financeCents(account.credit),Math.max(closing,0),Math.max(0-closing,0)]};
 });
 const totals=rows.reduce((sum,row)=>sum.map((value,index)=>value+row.amounts[index]),[0,0,0,0,0,0]);
 return {rows,totals};
}
function managementFilterEmployees(rows,filters){
 const query=managementNormalize(filters.search);
 return rows.filter(row=>(!filters.branch||row.branch_id===filters.branch)&&(!filters.status||row.status===filters.status)&&(!query||managementNormalize([row.employee_code,row.full_name,row.document_number,row.job_title,row.email].join(' ')).includes(query))).sort((a,b)=>a.full_name.localeCompare(b.full_name,'es'));
}
function financeSummary(report){
 const sum=(predicate,fn)=>report.accounts.filter(predicate).reduce((total,a)=>total+fn(a),0);
 const income=sum(a=>a.kind==='income',a=>financeCents(a.credit)-financeCents(a.debit));
 const expense=sum(a=>a.kind==='expense',a=>financeCents(a.debit)-financeCents(a.credit));
 const assets=sum(a=>a.kind==='asset',a=>financeCents(a.closing));
 const liabilities=0-sum(a=>a.kind==='liability',a=>financeCents(a.closing));
 const equity=0-sum(a=>a.kind==='equity',a=>financeCents(a.closing));
 const accumulated=0-sum(a=>['income','expense'].includes(a.kind),a=>financeCents(a.closing));
 return {income,expense,result:income-expense,assets,liabilities,equity,accumulated,difference:assets-liabilities-equity-accumulated,
  cashOpening:sum(a=>a.is_cash,a=>financeCents(a.opening)),cashIn:sum(a=>a.is_cash,a=>financeCents(a.debit)),cashOut:sum(a=>a.is_cash,a=>financeCents(a.credit)),cash:sum(a=>a.is_cash,a=>financeCents(a.closing))};
}
function financeDocumentStatus(doc,today=managementToday()){
 if(doc.status==='voided')return 'voided';if(financeCents(doc.outstanding)===0)return 'paid';if(doc.due_date<today)return 'overdue';return financeCents(doc.paid_amount)>0?'partial':'pending';
}
function financeFilterDocuments(rows,filters,today=managementToday()){
 const query=managementNormalize(filters.search);
 return rows.filter(row=>(!filters.branch||row.branch_id===filters.branch)&&(!filters.direction||row.direction===filters.direction)&&(!filters.status||(filters.status==='pending'?row.status==='active'&&financeCents(row.outstanding)>0:financeDocumentStatus(row,today)===filters.status))&&(!query||managementNormalize(row.counterparty+' '+row.reference).includes(query))).sort((a,b)=>a.due_date.localeCompare(b.due_date));
}
function financeFilterJournals(rows,filters){
 const query=managementNormalize(filters.search);
 return rows.filter(row=>(!filters.branch||row.branch_id===filters.branch)&&row.entry_date>=filters.from&&row.entry_date<=filters.to&&(!query||managementNormalize([row.entry_no,row.description,row.reference].join(' ')).includes(query))).sort((a,b)=>b.entry_date.localeCompare(a.entry_date)||Number(b.entry_no)-Number(a.entry_no));
}
function managementCSV(rows){const cell=value=>'"'+String(value??'').replace(/^[=+\-@\t\r]/,"'$&").replace(/"/g,'""')+'"';return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')}
function managementDownload(filename,rows){const url=URL.createObjectURL(new Blob([managementCSV(rows)],{type:'text/csv;charset=utf-8;'})),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
