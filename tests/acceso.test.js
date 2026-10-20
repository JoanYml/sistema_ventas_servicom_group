const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=name=>fs.readFileSync(require.resolve('../'+name),'utf8');
function context(){const c=vm.createContext({window:{}});vm.runInContext(source('compartido/js/datos.js'),c);vm.runInContext(source('admin/acceso.js'),c);return c}
test('cada rol tiene exactamente sus apartados y las cuentas desconocidas no reciben acceso',()=>{
 const c=context(),sections=['dashboard','productos','pedidos','atencion','empleados','contabilidad'];
 for(const [role,allowed] of Object.entries({admin:sections,employee:['pedidos','atencion'],accountant:['dashboard','contabilidad']})){
  assert.deepEqual(sections.filter(section=>c.staffCan(section,role)),allowed);
 }
 for(const role of [null,'','root','constructor','__proto__'])assert.equal(c.staffCan('dashboard',role),false);
 assert.equal(c.staffDefaultView('employee'),'pedidos');assert.equal(c.staffDefaultView('accountant'),'dashboard');
});
test('la carga del empleado pide sólo pedidos y excluye las llaves privadas',async()=>{
 const c=context(),queries=[];c.testClient={from(table){const query={select(columns){queries.push({table,columns});return this},order(){return this},async range(){return {data:[{id:'P-1',total:150,status:'Confirmado',customer:{name:'Cliente'},items:[]}]}}};return query}};
 vm.runInContext('requireClient=()=>testClient',c);c.initDB('admin');c.configureAdminData('employee');await c.refreshDB();
 assert.equal(queries.length,1);assert.equal(queries[0].table,'orders');assert(!queries[0].columns.includes('access_token'));assert(!queries[0].columns.includes('*'));assert.equal(c.getDB().products.length,0);
});
test('el contable carga el dashboard agregado sin consultar tablas de clientes ni productos',async()=>{
 const c=context(),calls=[];c.testClient={from(){throw Error('Lectura no autorizada')},async rpc(name,args){calls.push({name,args});return {data:{aggregated:true,revenue:150,orderCount:1}}}};
 vm.runInContext('requireClient=()=>testClient',c);c.initDB('admin');c.configureAdminData('accountant');await c.refreshDB();
 assert.equal(calls[0].name,'get_staff_dashboard');assert.equal(calls[0].args.p_days,30);assert.equal(c.getDB().orders.length,0);assert.equal(c.getDB().dashboard.revenue,150);
});
test('sin rol la carga administrativa no inicia consultas',async()=>{
 const c=context();c.testClient={from(){throw Error('No debe consultarse')}};vm.runInContext('requireClient=()=>testClient',c);c.initDB('admin');await assert.rejects(c.refreshDB(),/no tiene acceso/);
});
