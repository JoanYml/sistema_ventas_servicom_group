const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({Intl,Date});
vm.runInContext(fs.readFileSync(require.resolve('../admin/panel/metricas.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(require.resolve('../admin/gestion/calculos.js'),'utf8'),context);
const {financeCents,financeDecimal,financeSummary,financeTrialBalance,financeDocumentStatus,financeFilterDocuments,financeFilterJournals,managementFilterEmployees,managementCSV}=context;

test('los importes usan céntimos exactos y rechazan fracciones adicionales y valores no finitos',()=>{
 assert.equal(financeCents('0.10')+financeCents('0.20'),30);
 assert.equal(financeDecimal(financeCents('-1234.56')),'-1234.56');
 for(const input of ['1.001','NaN','Infinity','1e5','S/ 10'])assert.throws(()=>financeCents(input));
});
test('los reportes distinguen resultado del período, saldo inicial y resultado acumulado',()=>{
 const account=(kind,opening,debit,credit,closing,is_cash=false)=>({kind,opening,debit,credit,closing,is_cash});
 const summary=financeSummary({accounts:[account('asset',1000,300,50,1250,true),account('equity',-800,0,0,-800),account('income',-200,0,300,-500),account('expense',0,50,0,50)]});
 assert.equal(summary.income,30000);assert.equal(summary.expense,5000);assert.equal(summary.result,25000);
 assert.equal(summary.accumulated,45000);assert.equal(summary.cashOpening,100000);assert.equal(summary.cash,125000);assert.equal(summary.difference,0);
});
test('las reversiones reducen el resultado en lugar de eliminar el historial',()=>{
 const summary=financeSummary({accounts:[{kind:'income',opening:-100,debit:100,credit:0,closing:0},{kind:'expense',opening:0,debit:0,credit:0,closing:0}]});
 assert.equal(summary.income,-10000);assert.equal(summary.result,-10000);assert.equal(summary.accumulated,0);
});
test('una venta de 1500 muestra caja deudora y ventas acreedoras sin cancelar sus totales',()=>{
 const accounts=[{code:'1000',opening:0,debit:1500,credit:0,closing:1500},{code:'4000',opening:0,debit:0,credit:1500,closing:-1500}];
 const trial=financeTrialBalance(accounts);
 assert.deepEqual(Array.from(trial.rows[0].amounts),[0,0,150000,0,150000,0]);
 assert.deepEqual(Array.from(trial.rows[1].amounts),[0,0,0,150000,0,150000]);
 assert.deepEqual(Array.from(trial.totals),[0,0,150000,150000,150000,150000]);
 assert.equal(accounts[1].closing,-1500);
});
test('el balance distingue el lado de cada saldo al cambiar de deudor a acreedor',()=>{
 const trial=financeTrialBalance([{opening:'10.10',debit:0,credit:'20.20',closing:'-10.10'},{opening:'-10.10',debit:'20.20',credit:0,closing:'10.10'}]);
 assert.deepEqual(Array.from(trial.totals),[1010,1010,2020,2020,1010,1010]);
 assert(trial.rows.every(row=>row.amounts.every(value=>value>=0)));
 assert.deepEqual(Array.from(financeTrialBalance([]).totals),[0,0,0,0,0,0]);
});
test('los documentos distinguen abonos, vencimientos, pago y anulación',()=>{
 const doc={status:'active',due_date:'2026-10-20',paid_amount:10,outstanding:90};
 assert.equal(financeDocumentStatus(doc,'2026-10-20'),'partial');
 assert.equal(financeDocumentStatus(doc,'2026-10-21'),'overdue');
 assert.equal(financeDocumentStatus({...doc,outstanding:0},'2026-10-21'),'paid');
 assert.equal(financeDocumentStatus({...doc,status:'voided',outstanding:0},'2026-10-21'),'voided');
 assert.equal(financeFilterDocuments([doc,{...doc,status:'voided',outstanding:0}],{status:'pending'},'2026-10-21').length,1);
});
test('el diario combina sucursal, fechas y búsqueda sin alterar el orden original',()=>{
 const rows=[{entry_no:1,branch_id:'ch',entry_date:'2026-10-01',description:'Alquiler',reference:'R-1'},{entry_no:2,branch_id:'nc',entry_date:'2026-10-02',description:'Alquiler',reference:'R-2'}];
 assert.equal(financeFilterJournals(rows,{branch:'ch',from:'2026-10-01',to:'2026-10-01',search:'alquiler'}).length,1);
 assert.equal(financeFilterJournals(rows,{from:'2026-10-01',to:'2026-10-02'})[0].entry_no,2);assert.equal(rows[0].entry_no,1);
});
test('los empleados se filtran por documento, nombre con tildes, sucursal y situación',()=>{
 const rows=[{full_name:'José Pérez',employee_code:'EMP-1',document_number:'12345678',job_title:'Ventas',branch_id:'ch',status:'active'},{full_name:'Ana Torres',employee_code:'EMP-2',document_number:'87654321',job_title:'Caja',branch_id:'nc',status:'leave'}];
 assert.equal(managementFilterEmployees(rows,{search:'JOSE PEREZ',branch:'ch',status:'active'}).length,1);
 assert.equal(managementFilterEmployees(rows,{search:'87654321',branch:'ch'}).length,0);
 assert.equal(managementFilterEmployees(rows,{search:'87654321',status:'leave'})[0].full_name,'Ana Torres');
});
test('el CSV conserva comillas y evita ejecutar fórmulas al abrirse',()=>{
 const csv=managementCSV([['=HYPERLINK("url")','Texto, con coma','+1','-50','@sum','Normal']]);
 assert(csv.includes('"\'=HYPERLINK(""url"")"'));assert(csv.includes('"Texto, con coma"'));assert(csv.includes('"\'-50"'));
});
