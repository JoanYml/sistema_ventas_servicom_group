const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const context=vm.createContext({Intl,Date,LOW_STOCK_LIMIT:10});
vm.runInContext(fs.readFileSync(require.resolve('../admin/panel/metricas.js'),'utf8'),context);
const {dashboardMetrics,dashboardDay,dashboardChange}=context;
const now=new Date('2026-10-20T18:00:00Z');
const order=(date,total,items=[],status='Confirmado')=>({date,total,items,status});

test('agrupa por fecha peruana y respeta los límites de ambos períodos',()=>{
  const db={products:[],orders:[
    order('2026-10-14T04:59:59Z',30), // 13 de octubre en Lima: período anterior.
    order('2026-10-14T05:00:00Z',100),
    order('2026-10-20T17:00:00Z',50),
    order('2026-10-20T19:00:00Z',999), // Fecha futura, incluso dentro del día actual.
    order('2026-10-07T05:00:00Z',20),
    order('2026-10-07T04:59:59Z',999),
    order('fecha inválida',999)
  ]};
  const m=dashboardMetrics(db,7,now);
  assert.equal(m.start,'2026-10-14');
  assert.equal(m.orders.length,2);
  assert.equal(m.revenue,150);
  assert.equal(m.ticket,75);
  assert.equal(m.revenueChange,200);
  assert.equal(m.ordersChange,0);
  assert.equal(m.series.length,7);
  assert.equal(m.series[0].total,100);
  assert.equal(m.series[6].total,50);
  assert.equal(m.series[1].total,0);
  assert.equal(dashboardDay('2026-10-20T04:30:00Z'),'2026-10-19');
});

test('usa cantidades y precios históricos; conserva productos eliminados en el ranking',()=>{
  const m=dashboardMetrics({products:[{id:1,price:999,stock:12,active:true,category:'Laptops'},{id:2,stock:0,price:20,active:false,category:'Audio'}],orders:[
    order('2026-10-20T12:00:00Z',80,[{id:1,name:'Laptop',price:10,qty:2},{id:99,name:'Eliminado',price:20,qty:3}],'Entregado'),
    order('2026-10-19T12:00:00Z',10,[{id:1,name:'Laptop',price:10,qty:1}],'Enviando')
  ]},30,now);
  assert.equal(m.topProducts[0].name,'Eliminado');
  assert.equal(m.topProducts[0].revenue,60);
  assert.equal(m.topProducts[1].qty,3);
  assert.equal(m.topProducts[1].revenue,30);
  assert.equal(m.pending,1);
  assert.equal(m.units,12);
  assert.equal(m.active,1);
  assert.equal(m.inventoryValue,11988);
  assert.equal(m.lowStock.length,1);
  assert.equal(m.statuses.find(s=>s.name==='Entregado').count,1);
});

test('sin ventas no produce NaN ni porcentajes inventados',()=>{
  const m=dashboardMetrics({products:[],orders:[]},90,now);
  assert.equal(m.revenue,0);assert.equal(m.ticket,0);assert.equal(m.ordersChange,0);
  assert.equal(m.series.length,90);assert.equal(m.topProducts.length,0);
  assert.equal(dashboardChange(100,0),null);
  assert.equal(dashboardChange(0,100),-100);
});

test('el filtro cambia ventas; pendientes e inventario consideran todo el historial',()=>{
  const db={products:[{stock:5,price:10,category:'Audio',active:true}],orders:[order('2026-09-15T12:00:00Z',50),order('2026-10-19T12:00:00Z',100)]};
  const short=dashboardMetrics(db,7,now),long=dashboardMetrics(db,90,now);
  assert.equal(short.revenue,100);assert.equal(long.revenue,150);
  assert.equal(short.pending,long.pending);assert.equal(short.lowStock.length,1);
  assert.equal(short.categories[0].stock,5);
});

test('la exportación CSV escapa comillas y neutraliza fórmulas',()=>{
  const nodes=new Map();
  const csvContext=vm.createContext({$:s=>{if(!nodes.has(s))nodes.set(s,{});return nodes.get(s)},Intl,Date,setTimeout});
  vm.runInContext(fs.readFileSync(require.resolve('../admin/panel/metricas.js'),'utf8'),csvContext);
  vm.runInContext(fs.readFileSync(require.resolve('../admin/panel/panel.js'),'utf8'),csvContext);
  const csv=csvContext.dashboardCSV({orders:[{id:'=1+1',date:now,status:'Con "comillas", prueba',total:10}]});
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"Con ""comillas"", prueba"'));
  assert.ok(csv.includes('"10.00"'));
});

test('la carga administrativa pagina más de 1000 registros y propaga errores',async()=>{
  const dataContext=vm.createContext({window:{}});
  vm.runInContext(fs.readFileSync(require.resolve('../compartido/js/datos.js'),'utf8'),dataContext);
  const rows=Array.from({length:1001},(_,id)=>({id})),ranges=[];
  let fail=false;
  const query={select(){return this},order(){return this},async range(start,end){ranges.push([start,end]);return fail?{error:new Error('Sin conexión')}:{data:rows.slice(start,end+1)}}};
  const client={from:()=>query};
  const result=await dataContext.readAllAdminRows(client,'orders','created_at',false);
  assert.equal(result.length,1001);assert.equal(result[1000].id,1000);
  assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499]]);
  fail=true;await assert.rejects(dataContext.readAllAdminRows(client,'orders','created_at'),/Sin conexión/);
});
