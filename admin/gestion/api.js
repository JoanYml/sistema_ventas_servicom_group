function managementError(error){
 if(['PGRST202','PGRST205','42P01','42883'].includes(error?.code))return 'Falta activar estos módulos. Ejecuta supabase/gestion_empresarial.sql en el SQL Editor de Supabase.';
 if(error?.code==='23505')return 'Ya existe ese documento, código o registro. Revisa si la operación se guardó antes de volver a enviarla.';
 if(error?.code==='23514'||error?.code==='23502'||error?.code==='22P02'||error?.code==='22003')return 'Revisa los campos obligatorios, las fechas y los importes.';
 if(error?.code==='P0001')return error.message;
 return 'No se pudo completar la operación. Comprueba la conexión y actualiza los datos antes de reintentar.';
}
async function managementRPC(name,args){const {data,error}=await requireClient().rpc(name,args);if(error)throw error;return data}
async function managementRows(table,columns,order,primary='id',filter=null){
 const rows=[];
 for(let offset=0;;offset+=500){let query=requireClient().from(table).select(columns).order(order);if(order!==primary)query=query.order(primary);if(filter)query=query.eq(filter.key,filter.value);const {data,error}=await query.range(offset,offset+499);if(error)throw error;rows.push(...data);if(data.length<500)return rows}
}
const managementBranches=()=>managementRows('branches','id,code,name,address,phone,active','name');
const managementEmployees=()=>managementRows('employees','*','full_name');
const managementEmployeeHistory=id=>managementRows('employee_history','*','id','id',{key:'employee_id',value:id});
const managementSaveEmployee=(id,data,version)=>managementRPC('management_save_employee',{p_id:id,p_data:data,p_version:version});
const financeAccounts=()=>managementRows('finance_accounts','*','code','code');
const financeJournals=()=>managementRows('finance_journals','id,entry_no,branch_id,entry_date,description,reference,reverse_of,reversed_by,created_by,created_at','entry_no');
const financeDocuments=()=>managementRows('finance_document_balances','*','due_date');
const financePayments=()=>managementRows('finance_payments','id,document_id,amount,payment_date,cash_account,journal_id,created_at','payment_date');
const financeLocks=()=>managementRows('finance_period_locks','*','month','branch_id');
const financeGetReport=(branch,from,to)=>managementRPC('finance_report',{p_branch:branch||null,p_from:from,p_to:to});
const financeGetEntry=id=>managementRPC('finance_get_entry',{p_id:id});
async function financeAudit(){const {data,error}=await requireClient().from('finance_audit').select('id,action,entity_id,details,actor_id,created_at').order('created_at',{ascending:false}).order('id',{ascending:false}).range(0,99);if(error)throw error;return data}
