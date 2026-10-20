// Navegador y permisos reales sobre PostgreSQL local. No usa credenciales ni escrituras remotas.
const {chromium}=require(process.env.SERVICOM_PLAYWRIGHT_PATH||'playwright');
const {createRolesDB}=require('./helpers/roles-db.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
(async()=>{
 const {db,users,branch}=await createRolesDB();let queue=Promise.resolve();
 const serial=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result};
 const rpcArgs={get_my_staff_role:[],is_admin:[],get_staff_dashboard:['p_days'],support_admin_get:['p_id'],support_admin_reply:['p_id','p_message'],support_admin_set_status:['p_id','p_status'],management_save_employee:['p_id','p_data','p_version'],finance_record_cash:['p_branch','p_date','p_direction','p_amount','p_cash','p_counter','p_description','p_reference','p_request'],finance_report:['p_branch','p_from','p_to']};
 const tables=new Set(['products','orders','user_roles','employees','employee_history','branches','support_conversations','support_messages','finance_accounts','finance_journals','finance_document_balances','finance_payments','finance_period_locks','finance_audit']);
 const token=randomUUID(),conversation=(await db.query("select public.support_create_request($1,'Cliente de atención','Quisiera ayuda con mi compra') as data",[token])).rows[0].data;
 function sdk(user){
  let signedIn=true;const request=(type,body)=>fetch('/__roles/'+type,{method:'POST',body:JSON.stringify(body)}).then(response=>response.json());
  window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:signedIn?{user}:null}}),signOut:async()=>{signedIn=false;return {}},signInWithPassword:async()=>{signedIn=true;return {}}},rpc:(name,values)=>request('rpc',{name,values:values||{}}),from(table){
   let columns='*',orders=[],filters=[],start=0,end=499,action='select',data;
   const read=()=>request('table',{table,columns,orders,filters,start,end,action,data});
   return {select(value='*'){columns=value;return this},order(column,opts={}){orders.push({column,desc:opts.ascending===false});return this},eq(key,value){filters.push({key,value,op:'='});return this},neq(key,value){filters.push({key,value,op:'<>'});return this},gt(key,value){filters.push({key,value,op:'>'});return this},update(value){action='update';data=value;return this},insert(value){action='insert';data=value;return this},delete(){action='delete';return this},range(a,b){start=a;end=b;return read()},then(a,b){return read().then(a,b)}};
  }})};
 }
 const browser=await chromium.launch({executablePath:process.env.SERVICOM_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const errors=[];
 async function makePage(role,legacy=false){
  const context=await browser.newContext({viewport:{width:1360,height:950}}),page=await context.newPage(),requests=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(role+': '+error.message));
  await context.route('**/__recargar',route=>route.abort());
  await context.route('https://**/*',route=>route.request().url().includes('cdn.jsdelivr.net/npm/@supabase/supabase-js@2')?route.fulfill({contentType:'application/javascript',body:`(${sdk.toString()})(${JSON.stringify({id:users[role],email:role+'@example.com'})})`}):route.abort());
  await context.route('**/__roles/*',async route=>{
   const body=route.request().postDataJSON();requests.push(body);
   if(legacy&&body.name==='get_my_staff_role')return route.fulfill({json:{error:{code:'PGRST202'}}});
   try{const data=await serial(async()=>{
    await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${users[role]}'`);
    if(route.request().url().endsWith('/rpc')){
     assert(rpcArgs[body.name]);const values=rpcArgs[body.name].map(key=>{const value=body.values[key];return value&&typeof value==='object'?JSON.stringify(value):value});
     return (await db.query(`select public.${body.name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) as data`,values)).rows[0].data;
    }
    assert(tables.has(body.table));const valid=value=>{assert(/^[a-z_]+$/.test(value));return value};assert(/^[a-z_,*]+$/.test(body.columns));
    let values=[],sql;
    const where=()=>body.filters.length?' where '+body.filters.map(filter=>{assert(['=','<>','>'].includes(filter.op));values.push(filter.value);return valid(filter.key)+filter.op+'$'+values.length}).join(' and '):'';
    if(body.action==='select'){
     sql=`select ${body.columns} from public.${body.table}${where()}`;if(body.orders.length)sql+=' order by '+body.orders.map(order=>valid(order.column)+(order.desc?' desc':' asc')).join(',');sql+=` limit ${body.end-body.start+1} offset ${body.start}`;
    }else if(body.action==='update'){
     sql='update public.'+body.table+' set '+Object.entries(body.data).map(([key,value])=>{values.push(value&&typeof value==='object'?JSON.stringify(value):value);return valid(key)+'=$'+values.length}).join(',')+where()+' returning '+body.columns;
    }else if(body.action==='delete'){sql='delete from public.'+body.table+where()+' returning '+body.columns}
    else throw Error('Unsupported test mutation');
    return (await db.query(sql,values)).rows;
   });await route.fulfill({json:{data:Array.isArray(data)?data.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value instanceof Date&&(/_date$/.test(key)||key==='month')?value.toISOString().slice(0,10):value]))):data}})}
   catch(error){await route.fulfill({json:{error:{code:error.code||'P0001',message:error.message}}})}
  });return {page,requests};
 }
 async function ready(page){await page.waitForFunction(()=>!!staffRole&&!!dashboardLastSync)}
 async function text(page,selector,value){await page.waitForFunction(({selector,value})=>document.querySelector(selector).textContent.includes(value),{selector,value})}
 async function menu(page){return page.locator('.sidebar-link:not(.hidden)').evaluateAll(buttons=>buttons.map(button=>button.dataset.view))}
 const owner=await makePage('admin');await owner.page.goto('http://127.0.0.1:5173/admin/');await ready(owner.page);assert.equal((await menu(owner.page)).length,6);assert(await owner.page.locator('#dashboardNewProduct').isVisible());await owner.page.locator('#dashboardNewProduct').click();assert(await owner.page.locator('#adminModal').isVisible());await owner.page.locator('[data-close=adminModal]').click();
 const employee=await makePage('employee'),agent=employee.page;await agent.goto('http://127.0.0.1:5173/admin/#contabilidad');await ready(agent);assert.deepEqual(await menu(agent),['pedidos','atencion']);assert.equal(new URL(agent.url()).hash,'#pedidos');await text(agent,'#ordersTable','Cliente Privado');assert(!employee.requests.some(request=>request.table==='products'||request.table?.startsWith('finance_')||request.table==='employees'));
 await agent.locator('[data-order-open="PRIVATE-ORDER-1"]').click();await agent.selectOption('#orderStatusEdit','Enviando');agent.once('dialog',dialog=>dialog.accept());await agent.locator('#orderStatusSave').click();await text(agent,'#orderStatusFeedback','Estado guardado');await agent.locator('#orderDetailDone').click();
 await agent.locator('[data-view=atencion]').click();await text(agent,'#supportInboxItems','Cliente de atención');await agent.locator('.support-inbox-item').click();await text(agent,'#supportThreadMessages','Quisiera ayuda');await agent.fill('#supportReply','Hola, te ayudamos con tu compra.');await agent.locator('#supportReplySend').click();await text(agent,'#supportReplyFeedback','Respuesta guardada');
 for(const forbidden of ['dashboard','productos','empleados','contabilidad']){await agent.evaluate(hash=>location.hash=hash,forbidden);await agent.waitForFunction(()=>location.hash==='#pedidos');assert(!(await agent.locator('[data-panel="'+forbidden+'"]').isVisible()))}
 const accountant=await makePage('accountant'),book=accountant.page;await book.goto('http://127.0.0.1:5173/admin/#pedidos');await ready(book);assert.deepEqual(await menu(book),['dashboard','contabilidad']);assert.equal(new URL(book.url()).hash,'#dashboard');assert(!(await book.locator('#dashboardNewProduct').isVisible()));assert.equal(await book.locator('[data-edit-stock]').count(),0);assert.equal(await book.locator('[data-panel=dashboard] a[href="#pedidos"]:visible').count(),0);assert(!(await book.locator('#resetData').isVisible()));assert(!(await book.locator('#recentOrders').innerText()).includes('Cliente'));
 assert.equal(await book.evaluate(()=>getDB().orders.length),0);assert(!accountant.requests.some(request=>['orders','products','employees','support_conversations'].includes(request.table)));
 await book.selectOption('#dashboardPeriod','7');await book.waitForFunction(()=>getDB().dashboard?.days===7);assert.equal(await book.evaluate(()=>getDB().dashboard.revenue),150);assert.equal(await book.locator('#salesChart svg').count(),1);
 const downloadPromise=book.waitForEvent('download');await book.locator('#dashboardExport').click();const download=await downloadPromise,csv=fs.readFileSync(await download.path(),'utf8');assert(csv.includes('"Pedidos"'));assert(!csv.includes('PRIVATE-ORDER'));assert(!csv.includes('Cliente Privado'));
 await book.locator('[data-view=contabilidad]').click();await text(book,'#financeFeedback','Datos de Supabase');await book.locator('#financeNewCash').click();await book.selectOption('#managementForm [name=branch]',branch);await book.fill('#managementForm [name=description]','Ingreso registrado por contable');await book.fill('#managementForm [name=amount]','25');await book.selectOption('#managementForm [name=cash]','1000');await book.selectOption('#managementForm [name=counter]','4000');await book.locator('#managementSubmit').click();await book.waitForFunction(()=>document.getElementById('managementModal').classList.contains('hidden'));await text(book,'#financeSummary','25.00');
 for(const forbidden of ['pedidos','atencion','productos','empleados']){await book.evaluate(hash=>location.hash=hash,forbidden);await book.waitForFunction(()=>location.hash==='#dashboard')}
 const denied=await makePage('unassigned');await denied.page.goto('http://127.0.0.1:5173/admin/#contabilidad');await denied.page.waitForFunction(()=>!document.getElementById('loginModal').classList.contains('hidden'));assert(!(await denied.page.locator('.admin-layout').isVisible()));assert.equal((await menu(denied.page)).length,0);assert(!denied.requests.some(request=>request.table));
 const legacy=await makePage('admin',true);await legacy.page.goto('http://127.0.0.1:5173/admin/');await ready(legacy.page);assert(await legacy.page.locator('#staffSetupNotice').isVisible());assert.equal((await menu(legacy.page)).length,6);
 for(const page of [agent,book]){await page.evaluate(()=>applyTheme('dark'));for(const width of [390,768,1360]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}}
 await book.setViewportSize({width:1360,height:950});await book.screenshot({path:'/tmp/servicom-rol-contable.png',fullPage:true});await agent.screenshot({path:'/tmp/servicom-rol-empleado.png',fullPage:true});
 await serial(async()=>{await db.exec('reset role');await db.query("select public.assign_staff_role('employee@example.com','employee',false)")});await agent.evaluate(()=>pollStaffAccess());await agent.waitForFunction(()=>!document.getElementById('loginModal').classList.contains('hidden'));assert(!(await agent.locator('.admin-layout').isVisible()));
 assert.deepEqual(errors,[]);await queue;await browser.close();await db.close();console.log('PASS navegador + PostgreSQL roles: dueño, empleado, contable y cuenta sin rol; menús, enlaces directos, datos mínimos, pedido y atención operables, dashboard agregado y CSV, registro contable, transición desde esquema anterior, revocación con sesión abierta, temas y móvil.');
})().catch(error=>{console.error(error);process.exit(1)});
