const {chromium}=require(process.env.SERVICOM_PLAYWRIGHT_PATH||'playwright');
const {createUsersDB}=require('./helpers/usuarios-db.cjs');
const {createHandler}=require('../api/staff-users.js');
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
(async()=>{
 const {db,users,branch}=await createUsersDB();let queue=Promise.resolve();const serial=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result};
 const passwords=new Map(),errors=[];
 const args={get_my_staff_role:[],is_admin:[],staff_record_session:['p_action'],staff_list_users:['p_search','p_role','p_status','p_limit','p_offset'],staff_update_user:['p_user','p_name','p_role','p_active','p_version'],staff_list_activity:['p_actor','p_subject','p_role','p_module','p_from','p_to','p_limit','p_offset'],staff_begin_auth_operation:['p_actor','p_action','p_user','p_email','p_name','p_role','p_request'],staff_finish_auth_operation:['p_actor','p_request','p_success','p_user'],get_staff_dashboard:['p_days'],support_admin_get:['p_id'],support_admin_reply:['p_id','p_message'],support_admin_set_status:['p_id','p_status'],finance_sales_status:[],finance_sync_sales:['p_history','p_limit'],finance_report:['p_branch','p_from','p_to'],finance_report_general:['p_from','p_to'],finance_record_cash:['p_branch','p_date','p_direction','p_amount','p_cash','p_counter','p_description','p_reference','p_request']};
 async function role(id,service=false){await db.exec(`reset role;set role ${service?'service_role':'authenticated'};set request.jwt.claim.sub='${id||''}'`)}
 async function rpc(name,values){assert(args[name],name);return (await db.query(`select public.${name}(${args[name].map((_,i)=>'$'+(i+1)).join(',')}) x`,args[name].map(key=>values[key]??null))).rows[0].x}
 const fetcher=async(url,options)=>{
  const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):{},token=options.headers.Authorization;
  return serial(async()=>{
   try{
    if(path==='/auth/v1/user'){
     const id=token.replace('Bearer test-','');await db.exec('reset role');const row=(await db.query('select id,email from auth.users where id=$1',[id])).rows[0];return Response.json(row||{},{status:row?200:401});
    }
    if(path.startsWith('/rest/v1/rpc/')){const service=token==='Bearer secret-in-test';await role(service?'':token.replace('Bearer test-',''),service);return Response.json(await rpc(path.split('/').at(-1),body))}
    await db.exec('reset role');
    if(path==='/auth/v1/admin/users'&&options.method==='POST'){
     const duplicate=(await db.query('select id from auth.users where email=$1',[body.email])).rows[0];if(duplicate)return Response.json({code:'email_exists'},{status:422});
     const id=randomUUID();await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,body.email,JSON.stringify(body.user_metadata)]);passwords.set(id,body.password);return Response.json({id});
    }
    const id=path.split('/').at(-1);if(options.method==='PUT'){passwords.set(id,body.password);return Response.json({id})}if(options.method==='DELETE'){await db.query('delete from auth.users where id=$1',[id]);return Response.json({})}
    throw Error('Unknown endpoint');
   }catch(error){return Response.json({code:error.code||'P0001',message:error.message},{status:400})}
  });
 };
 const handler=createHandler({env:{SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret-in-test'},fetcher});
 function sdk(user){
  const request=(type,body)=>fetch('/__users/'+type,{method:'POST',body:JSON.stringify(body)}).then(r=>r.json());
  window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user,access_token:'test-'+user.id}}}),signOut:async()=>({})},rpc:(name,values={})=>request('rpc',{name,values}),from(table){let columns='*',orders=[],filters=[],start=0,end=499,action='select',data;
   const read=()=>request('table',{table,columns,orders,filters,start,end,action,data});
   return {select(v='*'){columns=v;return this},order(column,opts={}){orders.push({column,desc:opts.ascending===false});return this},eq(key,value){filters.push({key,value});return this},range(a,b){start=a;end=b;return read()},update(v){action='update';data=v;return this},then(a,b){return read().then(a,b)}};
  }})};
 }
 const browser=await chromium.launch({executablePath:process.env.SERVICOM_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 async function makePage(id,email,options={}){
  const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/__recargar',r=>r.abort());
  await context.route('https://**/*',r=>r.request().url().includes('cdn.jsdelivr.net/npm/@supabase/supabase-js@2')?r.fulfill({contentType:'application/javascript',body:`(${sdk.toString()})(${JSON.stringify({id,email})})`}):r.abort());
  await context.route('**/api/staff-users',async r=>{
   if(options.staticServer)return r.fulfill({status:200,contentType:'text/html',body:'<html>Una página estática no confirma una cuenta</html>'});
   if(options.missingFunction)return r.fulfill({status:404,contentType:'text/html',body:'<html>NOT_FOUND</html>'});
   if(options.noServer)return r.fulfill({status:503,json:{error:{code:'SETUP_REQUIRED',message:'Falta configurar SUPABASE_SERVICE_ROLE_KEY en Production. Vuelve a desplegar.'}}});
   let status,headers,result;const req={method:r.request().method(),headers:r.request().headers(),...(r.request().method()==='POST'?{body:r.request().postDataJSON()}:{})};
   await handler(req,{setHeader(){},writeHead(s,h){status=s;headers=h},end(v){result=v}});await r.fulfill({status,headers,body:result});
  });
  await context.route('**/__users/*',async route=>{
   const body=route.request().postDataJSON();if(options.noSQL&&body.name==='staff_list_users')return route.fulfill({json:{error:{code:'PGRST202'}}});
   try{const data=await serial(async()=>{
    await role(id);
    if(route.request().url().endsWith('/rpc'))return rpc(body.name,body.values);
    assert(/^[a-z_]+$/.test(body.table)&&/^[a-z_,*]+$/.test(body.columns));const valid=x=>{assert(/^[a-z_]+$/.test(x));return x};let values=[],query;
    if(body.action==='select')query='select '+body.columns+' from public.'+body.table;
    else {assert(body.action==='update');query='update public.'+body.table+' set '+Object.entries(body.data).map(([key,value])=>{values.push(value);return valid(key)+'=$'+values.length}).join(',')}
    if(body.filters.length)query+=' where '+body.filters.map(f=>{values.push(f.value);return valid(f.key)+'=$'+values.length}).join(' and ');
    if(body.action==='update')query+=' returning '+body.columns;else{if(body.orders.length)query+=' order by '+body.orders.map(o=>valid(o.column)+(o.desc?' desc':' asc')).join(',');query+=` limit ${body.end-body.start+1} offset ${body.start}`}
    return (await db.query(query,values)).rows;
   });await route.fulfill({json:{data}})}catch(e){await route.fulfill({json:{error:{code:e.code||'P0001',message:e.message}}})}
  });return page;
 }
 async function text(page,selector,value){await page.waitForFunction(({selector,value})=>document.querySelector(selector).textContent.includes(value),{selector,value})}
 async function ready(page){await page.waitForFunction(()=>usersReady&&!usersLoading&&usersServerReady)}
 const owner=await makePage(users.admin,'admin@example.com');await owner.goto('http://127.0.0.1:5173/admin/#usuarios');await ready(owner);assert.equal(await owner.locator('.sidebar-link:not(.hidden)').count(),7);
 await owner.locator('#usersNew').click();for(const [name,value] of Object.entries({full_name:'María Atención',email:'maria@example.com',password:'Inicial_segura_123',confirm_password:'Inicial_segura_123'}))await owner.fill(`#managementForm [name=${name}]`,value);await owner.selectOption('#managementForm [name=role]','employee');await owner.locator('#managementSubmit').click();await owner.waitForFunction(()=>document.getElementById('managementModal').classList.contains('hidden'));await ready(owner);await text(owner,'#usersTable','maria@example.com');assert.equal(await owner.evaluate(()=>staffRole),'admin');assert.equal(await owner.locator('#managementForm input[type=password]').evaluateAll(xs=>xs.every(x=>!x.value)),true);
 const maria=await serial(async()=>{await db.exec('reset role');return (await db.query("select id from auth.users where email='maria@example.com'")).rows[0].id});assert.equal(passwords.get(maria),'Inicial_segura_123');
 await owner.selectOption('#usersRole','employee');await owner.fill('#usersSearch','maria');await text(owner,'#usersCount','1 usuarios');await owner.locator('[data-user-activity]').click();await owner.selectOption('#usersLogMode','subject');await text(owner,'#usersLogTable','Creó una cuenta');
 const employee=await makePage(maria,'maria@example.com');await employee.goto('http://127.0.0.1:5173/admin/#usuarios');await employee.waitForFunction(()=>location.hash==='#pedidos');await text(employee,'#ordersTable','PRIVATE-ORDER-1');assert.equal(await employee.locator('[data-view=usuarios]').isVisible(),false);
 await employee.locator('[data-order-open="PRIVATE-ORDER-1"]').click();await employee.selectOption('#orderStatusEdit','Enviando');employee.once('dialog',d=>d.accept());await employee.locator('#orderStatusSave').click();await text(employee,'#orderStatusFeedback','Estado guardado');await employee.locator('#orderDetailDone').click();
 await owner.selectOption('#usersLogMode','actor');await text(owner,'#usersLogTable','Cambió el estado de un pedido');assert(!(await owner.locator('#usersLogTable').innerText()).includes('Cliente Privado'));
 await owner.locator('[data-user-edit]').click();await owner.selectOption('#managementForm [name=role]','accountant');await owner.locator('#managementSubmit').click();await owner.waitForFunction(()=>document.getElementById('managementModal').classList.contains('hidden'));await owner.selectOption('#usersRole','accountant');await ready(owner);await text(owner,'#usersTable','María Atención');
 await employee.evaluate(()=>pollStaffAccess());await employee.waitForFunction(()=>staffRole==='accountant');assert.equal(await employee.locator('.sidebar-link:not(.hidden)').count(),2);assert.equal(await employee.locator('[data-view=usuarios]').isVisible(),false);
 await employee.evaluate(async branch=>{const r=await requireClient().rpc('finance_record_cash',{p_branch:branch,p_date:managementToday(),p_direction:'expense',p_amount:25,p_cash:'1000',p_counter:'5300',p_description:'Servicio contable',p_reference:'',p_request:crypto.randomUUID()});if(r.error)throw Error(r.error.message)},branch);
 await owner.locator('[data-user-activity]').click();await owner.selectOption('#usersAuditRole','employee');await text(owner,'#usersLogTable','Cambió el estado de un pedido');await owner.selectOption('#usersAuditRole','accountant');await text(owner,'#usersLogTable','Registró un asiento contable');await owner.selectOption('#usersAuditRole','');
 await owner.locator('[data-user-edit]').click();await owner.selectOption('#managementForm [name=active]','false');await owner.locator('#managementSubmit').click();await owner.waitForFunction(()=>document.getElementById('managementModal').classList.contains('hidden'));await ready(owner);await text(owner,'#usersTable','Desactivado');await employee.evaluate(()=>pollStaffAccess());await employee.waitForFunction(()=>!document.getElementById('loginModal').classList.contains('hidden'));
 await owner.locator('[data-user-activity]').click();await owner.locator('#usersResetPassword').click();await owner.fill('#managementForm [name=password]','Nueva_segura_456');await owner.fill('#managementForm [name=confirm_password]','Nueva_segura_456');await owner.locator('#managementSubmit').click();await owner.waitForFunction(()=>document.getElementById('managementModal').classList.contains('hidden'));await ready(owner);assert.equal(passwords.get(maria),'Nueva_segura_456');await owner.selectOption('#usersLogMode','subject');await text(owner,'#usersLogTable','Restableció una contraseña');assert(!(await owner.locator('#usersLogTable').innerText()).includes('Nueva_segura'));
 const serverOptions={noServer:true},fallback=await makePage(users.admin,'admin@example.com',serverOptions);await fallback.goto('http://127.0.0.1:5173/admin/#usuarios');await fallback.waitForFunction(()=>usersReady&&!usersLoading);assert(await fallback.locator('#usersNew').isDisabled());assert(await fallback.locator('#usersServerNotice').isVisible());await text(fallback,'#usersServerReason','SUPABASE_SERVICE_ROLE_KEY');assert((await fallback.locator('[data-user-edit]').count())>0);
 serverOptions.noServer=false;await fallback.locator('#usersRefresh').click();await ready(fallback);assert(await fallback.locator('#usersNew').isEnabled());assert(await fallback.locator('#usersServerNotice').isHidden());
 await fallback.locator('[data-user-activity]').first().click();serverOptions.noServer=true;await fallback.locator('#usersRefresh').click();await fallback.waitForFunction(()=>usersReady&&!usersLoading);assert(await fallback.locator('#usersNew').isDisabled());assert(await fallback.locator('#usersResetPassword').isDisabled());await text(fallback,'#usersServerReason','SUPABASE_SERVICE_ROLE_KEY');
 const notFound=await makePage(users.admin,'admin@example.com',{missingFunction:true});await notFound.goto('http://127.0.0.1:5173/admin/#usuarios');await notFound.waitForFunction(()=>usersReady&&!usersLoading);assert(await notFound.locator('#usersNew').isDisabled());await text(notFound,'#usersServerReason','No se encontró /api/staff-users');
 const staticPage=await makePage(users.admin,'admin@example.com',{staticServer:true});await staticPage.goto('http://127.0.0.1:5173/admin/#usuarios');await staticPage.waitForFunction(()=>usersReady&&!usersLoading);assert(await staticPage.locator('#usersNew').isDisabled());
 await text(staticPage,'#usersServerReason','no respondió como una función');
 const missing=await makePage(users.admin,'admin@example.com',{noSQL:true});await missing.goto('http://127.0.0.1:5173/admin/#usuarios');await text(missing,'#usersFeedback','Falta activar');assert(await missing.locator('#usersNew').isDisabled());
 // Paginación y búsquedas sobre cuentas sin rol ya creadas fuera del panel.
 await serial(async()=>{await db.exec('reset role');for(let n=0;n<28;n++)await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[randomUUID(),`lote${n}@example.com`,JSON.stringify({full_name:'Lote '+n})])});
 await owner.selectOption('#usersRole','');await owner.fill('#usersSearch','');await ready(owner);await text(owner,'#usersCount','33 usuarios');assert.equal(await owner.locator('[data-user-edit]').count(),25);await owner.locator('#usersNext').click();await ready(owner);assert.equal(await owner.locator('[data-user-edit]').count(),8);
 await owner.fill('#usersSearch','admin@example.com');await text(owner,'#usersCount','1 usuarios');await owner.locator('[data-user-edit]').click();await owner.fill('#managementForm [name=full_name]','Dueño de prueba');await owner.selectOption('#managementForm [name=role]','employee');await owner.locator('#managementSubmit').click();await text(owner,'#managementModalFeedback','propio acceso');await owner.locator('#managementClose').click();
 await owner.fill('#usersSearch','maria');await text(owner,'#usersCount','1 usuarios');await owner.locator('[data-user-activity]').click();await text(owner,'#usersActivityTitle','María Atención');await owner.selectOption('#usersLogMode','actor');await text(owner,'#usersLogTable','Registró un asiento');
 for(const theme of ['light','dark']){await owner.evaluate(t=>applyTheme(t),theme);await owner.waitForTimeout(200);for(const width of [390,768,1360]){await owner.setViewportSize({width,height:1000});assert(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Overflow '+theme+' '+width)}await owner.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await owner.screenshot({path:'/tmp/servicom-usuarios-'+theme+'.png',fullPage:true})}
 await owner.setViewportSize({width:390,height:844});await owner.screenshot({path:'/tmp/servicom-usuarios-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);await queue;await browser.close();await db.close();console.log('PASS usuarios navegador + API + PostgreSQL: creación real simulada en Auth, sesión del dueño conservada, búsqueda y roles, historial individual y de cuenta, acciones verificadas, cambio y revocación, contraseña sin registros sensibles, paginación, permisos, configuración ausente, temas y móvil.');
})().catch(e=>{console.error(e);process.exit(1)});
