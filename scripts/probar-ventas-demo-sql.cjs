// Prueba local sobre PostgreSQL; no se conecta a Supabase ni usa claves reales.
const {createUsersDB}=require('./helpers/usuarios-db.cjs');
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');

(async()=>{
 const {db,users,readSQL}=await createUsersDB();
 const seed=readSQL('ventas_demo.sql');
 const one=async(sql,values=[])=> (await db.query(sql,values)).rows[0];
 const originalOrders=(await db.query('select * from public.orders order by id')).rows;
 const originalProducts=(await db.query('select * from public.products order by id')).rows;
 const originalJournals=Number((await one('select count(*) n from public.finance_journals')).n);

 await db.exec(seed);
 let summary=await one(`select count(*)::integer n,count(distinct status)::integer statuses,
   count(*) filter(where created_at>now())::integer future,
   count(*) filter(where customer->>'email' not like '%@example.invalid')::integer invalid_email
   from public.orders where id like 'DEMO-VENTA-%'`);
 assert.deepEqual(summary,{n:120,statuses:4,future:0,invalid_email:0});
 assert.deepEqual((await db.query('select * from public.products order by id')).rows,originalProducts);
 assert.deepEqual((await db.query("select * from public.orders where id not like 'DEMO-VENTA-%' order by id")).rows,originalOrders);
 assert.equal(Number((await one('select count(*) n from public.finance_journals')).n),originalJournals+120);
 assert.equal((await one(`select count(*)::integer n from public.orders o where o.id like 'DEMO-VENTA-%'
   and o.total<>(select sum((x->>'qty')::numeric*(x->>'price')::numeric) from jsonb_array_elements(o.items) x)`)).n,0);
 const finance=await one(`select count(*)::integer n,count(*) filter(where s.status='posted' and j.branch_id is null and j.source='order')::integer posted,
   count(*) filter(where s.amount<>o.total)::integer mismatch
   from public.orders o join public.finance_order_sales s on s.order_id=o.id
   left join public.finance_journals j on j.id=s.journal_id where o.id like 'DEMO-VENTA-%'`);
 assert.deepEqual(finance,{n:120,posted:120,mismatch:0});
 assert.equal((await one(`select count(*)::integer n from public.finance_journals j
   where order_id like 'DEMO-VENTA-%' and (select sum(debit-credit) from public.finance_lines where journal_id=j.id)<>0`)).n,0);

 // Los indicadores del dueño y el dashboard agregado del contable coinciden.
 const context=vm.createContext({Intl,Date,LOW_STOCK_LIMIT:10});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../admin/panel/metricas.js'),'utf8'),context);
 const orders=(await db.query('select id,created_at as date,items,total,status from public.orders')).rows;
 const now=new Date((await one('select now() as t')).t);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${users.accountant}'`);
 for(const days of [7,30,90]){
  const m=context.dashboardMetrics({products:originalProducts,orders},days,now);
  const aggregate=(await one('select public.get_staff_dashboard($1) x',[days])).x;
  assert(m.revenue>0);assert(m.orders.length>0);assert(m.topProducts.length>0);
  assert.notEqual(m.revenueChange,null);assert.notEqual(m.ordersChange,null);
  assert.equal(aggregate.orderCount,m.orders.length);assert(Math.abs(Number(aggregate.revenue)-m.revenue)<0.001);
  assert.equal(aggregate.series.length,days);
  assert.equal(aggregate.statuses.reduce((sum,x)=>sum+Number(x.count),0),m.orders.length);
 }
 await db.exec('reset role');

 // Repetir conserva incluso los snapshots después de cambiar un precio actual.
 const firstOrders=(await db.query("select * from public.orders where id like 'DEMO-VENTA-%' order by id")).rows;
 const firstSales=(await db.query("select * from public.finance_order_sales where order_id like 'DEMO-VENTA-%' order by order_id")).rows;
 const firstLogs=Number((await one('select count(*) n from public.staff_activity_log')).n);
 await db.exec(seed);
 assert.deepEqual((await db.query("select * from public.orders where id like 'DEMO-VENTA-%' order by id")).rows,firstOrders);
 assert.deepEqual((await db.query("select * from public.finance_order_sales where order_id like 'DEMO-VENTA-%' order by order_id")).rows,firstSales);
 assert.equal(Number((await one('select count(*) n from public.staff_activity_log')).n),firstLogs);
 assert.equal(Number((await one('select count(*) n from public.finance_journals')).n),originalJournals+120);
 await db.exec('update public.products set price=price+10 where id=1');await db.exec(seed);
 assert.deepEqual((await db.query("select * from public.orders where id like 'DEMO-VENTA-%' order by id")).rows,firstOrders);

 // La carga no omite la protección contable de pedidos ni instala RPC públicas.
 await assert.rejects(db.exec("delete from public.orders where id='DEMO-VENTA-0001'"),/registro contable/);
 await db.exec('alter table public.orders disable trigger finance_capture_order');
 await assert.rejects(db.exec(seed),/ventas_contabilidad.sql/);await db.exec('rollback');
 await db.exec('alter table public.orders enable trigger finance_capture_order');
 await db.exec('update public.products set active=false');
 await assert.rejects(db.exec(seed),/producto activo/);await db.exec('rollback');
 assert.equal(Number((await one("select count(*) n from public.orders where id like 'DEMO-VENTA-%'")).n),120);
 await db.close();
 console.log('PASS ventas demo SQL: 120 pedidos ficticios, totales exactos, fechas sin futuro, cuatro estados, stock e historial conservados, ingresos generales balanceados, dashboard de dueño/contable en 7/30/90 días, repetición sin duplicados y validación de requisitos.');
})().catch(error=>{console.error(error);process.exit(1)});
