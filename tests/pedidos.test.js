const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context=vm.createContext({Intl,Date});
vm.runInContext(fs.readFileSync(require.resolve('../admin/panel/metricas.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(require.resolve('../admin/pedidos/consultas.js'),'utf8'),context);
const {filterAdminOrders,paginateAdminOrders,summarizeAdminOrders}=context;
const orders=[
  {id:'SG-100',date:'2026-10-20T04:59:59Z',customer:{name:'José Pérez',email:'jose@example.com',dni:'12345678',phone:'999111222'},status:'Confirmado',total:100},
  {id:'SG-101',date:'2026-10-20T05:00:00Z',customer:{name:'Ana Torres'},status:'Enviando',total:300},
  {id:'SG-102',date:'2026-10-21T04:59:59Z',customer:{name:'Luis'},status:'Entregado',total:200},
  {id:'SG-103',date:'2026-10-21T05:00:00Z',customer:{name:'Ana Torres'},status:'Despachando',total:50}
];

test('busca sin tildes y por identificador, correo, DNI y teléfono',()=>{
  for(const search of [' JOSE PEREZ ','SG-100','jose@','12345678','999111222']){
    const result=filterAdminOrders(orders,{search});assert.equal(result.length,1);assert.equal(result[0].id,'SG-100');
  }
  assert.equal(filterAdminOrders(orders,{search:'inexistente'}).length,0);
});
test('combina búsqueda y estado; pendientes excluye entregados',()=>{
  assert.equal(filterAdminOrders(orders,{status:'pending'}).length,3);
  const result=filterAdminOrders(orders,{search:'ana',status:'Enviando'});
  assert.equal(result.length,1);assert.equal(result[0].id,'SG-101');
  assert.equal(filterAdminOrders(orders,{search:'ana',status:'Entregado'}).length,0);
});
test('el rango incluye el día completo de Perú y rechaza fechas invertidas',()=>{
  const result=filterAdminOrders(orders,{from:'2026-10-20',to:'2026-10-20'});
  assert.deepEqual(Array.from(result,o=>o.id),['SG-102','SG-101']);
  assert.equal(filterAdminOrders(orders,{from:'2026-10-21',to:'2026-10-20'}).length,0);
  assert.equal(filterAdminOrders([{date:'inválida'}],{from:'2026-10-20'}).length,0);
});
test('ordena por fecha e importe sin mutar el listado original',()=>{
  assert.equal(filterAdminOrders(orders,{sort:'newest'})[0].id,'SG-103');
  assert.equal(filterAdminOrders(orders,{sort:'oldest'})[0].id,'SG-100');
  assert.equal(filterAdminOrders(orders,{sort:'highest'})[0].id,'SG-101');
  assert.equal(filterAdminOrders(orders,{sort:'lowest'})[0].id,'SG-103');
  assert.equal(orders[0].id,'SG-100');
});
test('pagina sin omitir registros y ajusta la página tras cambiar filtros',()=>{
  const list=Array.from({length:27},(_,id)=>({id}));
  const last=paginateAdminOrders(list,3,10);
  assert.equal(last.items.length,7);assert.equal(last.from,21);assert.equal(last.to,27);
  assert.equal(paginateAdminOrders(orders,3,10).page,1);
  assert.equal(paginateAdminOrders(list,2,25).items.length,2);
  const empty=paginateAdminOrders([],10,10);
  assert.equal(empty.from,0);assert.equal(empty.to,0);assert.equal(empty.pages,1);
});
test('los contadores representan todo el historial',()=>{
  const result=summarizeAdminOrders(orders);
  assert.equal(result.total,4);assert.equal(result.pending,3);assert.equal(result.shipping,1);assert.equal(result.delivered,1);
});
test('la API compara el estado anterior y devuelve el pedido confirmado por el servidor',async()=>{
  const calls=[];let conflict=false;
  const row={id:'SG-100',created_at:orders[0].date,customer:{name:'José'},items:[],total:'100',status:'Enviando'};
  const query={update(value){calls.push(['update',value.status]);return this},eq(key,value){calls.push(['eq',key,value]);return this},async select(){return {data:conflict?[]:[row]}}};
  const apiContext=vm.createContext({window:{supabase:{createClient:()=>({from:()=>query})}},SUPABASE_URL:'https://test.invalid',SUPABASE_KEY:'test-public-key'});
  vm.runInContext(fs.readFileSync(require.resolve('../compartido/js/datos.js'),'utf8'),apiContext);
  const result=await apiContext.apiUpdateOrderStatus('SG-100','Enviando','Confirmado');
  assert.equal(result.status,'Enviando');assert.equal(result.total,100);
  assert.deepEqual(calls,[['update','Enviando'],['eq','id','SG-100'],['eq','status','Confirmado']]);
  conflict=true;await assert.rejects(apiContext.apiUpdateOrderStatus('SG-100','Entregado','Confirmado'),/El pedido cambió/);
});
