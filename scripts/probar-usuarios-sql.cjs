const {createUsersDB}=require('./helpers/usuarios-db.cjs');
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
(async()=>{
 const {db,users,readSQL,branch}=await createUsersDB();
 async function as(role,user=users[role]||''){await db.exec(`reset role;set role ${role==='anon'?'anon':role==='service_role'?'service_role':'authenticated'};set request.jwt.claim.sub='${user}'`)}
 async function rpc(name,args=[]){return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) x`,args)).rows[0].x}
 await as('admin');let list=await rpc('staff_list_users');assert.equal(list.total,4);assert.equal(list.summary.active,3);assert(!JSON.stringify(list).includes('raw_user_meta_data'));
 assert.equal((await rpc('staff_list_users',['employee','employee','',25,0])).total,1);
 assert.equal((await rpc('staff_list_users',['','unassigned','unassigned',25,0])).total,1);
 assert.equal((await rpc('staff_list_users',['','accountant','',25,0])).total,1);
 for(const role of ['employee','accountant','unassigned']){
  await as(role);await assert.rejects(rpc('staff_list_users'),/administrador/);await assert.rejects(rpc('staff_list_activity'),/administrador/);
  await assert.rejects(rpc('staff_update_user',[users.admin,'Intruso','employee',false,1]),/administrador/);
  await assert.rejects(db.query('select * from public.staff_activity_log'),/permission denied/);
  await assert.rejects(rpc('staff_append_activity',[users.admin,'usuarios','fake','staff_user',users.admin,{}]),/permission denied/);
  await assert.rejects(rpc('staff_begin_auth_operation',[users.admin,'create',null,'x@example.com','Falso','admin',randomUUID()]),/permission denied/);
 }
 await as('anon');await assert.rejects(rpc('staff_list_users'),/permission denied/);await assert.rejects(rpc('staff_list_activity'),/permission denied/);
 await as('admin');await assert.rejects(db.query('delete from public.staff_activity_log'),/permission denied/);
 await assert.rejects(rpc('staff_update_user',[users.admin,'Dueño','employee',true,1]),/propio/);
 await assert.rejects(rpc('staff_update_user',[users.admin,'Dueño','admin',false,1]),/propio/);
 await as('service_role');await assert.rejects(rpc('assign_staff_role',['admin@example.com','admin',false]),/al menos/);
 // Mutaciones de empleados y contables se registran en el servidor, sin depender de la UI.
 await as('employee');await db.query("update public.orders set status='Enviando' where id='PRIVATE-ORDER-1'");
 const supportToken=randomUUID();await as('anon');const conv=await rpc('support_create_request',[supportToken,'Cliente privado','No registrar este mensaje privado']);
 await as('employee');await rpc('support_admin_reply',[conv.id,'Respuesta de contenido privado']);await rpc('support_admin_set_status',[conv.id,'closed']);
 await as('admin');let logs=await rpc('staff_list_activity',[users.employee]);assert(logs.items.some(x=>x.module==='pedidos'&&x.details.previous_status==='Confirmado'&&x.details.status==='Enviando'));
 assert(logs.items.some(x=>x.module==='atencion'&&x.action==='replied'));assert(logs.items.every(x=>x.actor_id===users.employee&&x.actor_role==='employee'));
 let employee=(await rpc('staff_list_users',['employee@example.com'])).items[0];
 await rpc('staff_update_user',[users.employee,'José Operador','accountant',true,employee.version]);
 await assert.rejects(rpc('staff_update_user',[users.employee,'Cambio obsoleto','employee',true,employee.version]),/Otro administrador/);
 assert.equal((await rpc('staff_list_users',['jose operador','accountant'])).total,1);
 await as('employee');assert.equal((await db.query("update public.orders set status='Entregado' where id='PRIVATE-ORDER-1' returning id")).rows.length,0);
 await rpc('finance_record_cash',[branch,(await db.query("select (now() at time zone 'America/Lima')::date::text d")).rows[0].d,'expense',10,'1000','5300','Servicio de prueba','',randomUUID()]);
 await as('admin');logs=await rpc('staff_list_activity',[users.employee]);assert(logs.items.some(x=>x.actor_role==='employee'));assert(logs.items.some(x=>x.actor_role==='accountant'&&x.module==='contabilidad'));
 const oldRole=await rpc('staff_list_activity',[users.employee,null,'employee']);assert(oldRole.items.every(x=>x.actor_role==='employee'));assert(oldRole.total>0);
 const accountChanges=await rpc('staff_list_activity',[null,users.employee]);assert(accountChanges.items.some(x=>x.actor_id===users.admin&&x.action==='role_changed'));
 await db.query("update public.products set price=price+1,stock=stock+1,description='Texto que no debe copiarse al log' where id=1");
 await rpc('management_save_employee',[randomUUID(),{full_name:'Nombre de prueba',document_number:'AAA12345',job_title:'Ventas',branch_id:branch,hire_date:'2026-11-01',base_salary:9876,notes:'Nota que no debe copiarse'},null]);
 logs=await rpc('staff_list_activity');const serialized=JSON.stringify(logs);
 for(const privateValue of ['No registrar este mensaje privado','Respuesta de contenido privado','Texto que no debe copiarse al log','Nota que no debe copiarse','privado@example.com','9876','access_token','password'])assert(!serialized.includes(privateValue),privateValue);
 assert(logs.items.some(x=>x.module==='productos'&&x.details.fields.includes('price')));assert(logs.items.some(x=>x.module==='empleados'));
 await rpc('staff_record_session',['opened']);await rpc('staff_record_session',['opened']);assert.equal((await rpc('staff_list_activity',[users.admin,null,'','sesion'])).total,1);
 // Alta privada: antes de Auth se deja una solicitud durable; al finalizar se asignan permisos y autor.
 const id=randomUUID(),request=randomUUID();await as('service_role');let ticket=await rpc('staff_begin_auth_operation',[users.admin,'create',null,'nuevo@example.com','Ana Contable','accountant',request]);assert(ticket.fresh);
 assert.equal((await rpc('staff_begin_auth_operation',[users.admin,'create',null,'nuevo@example.com','Ana Contable','accountant',request])).fresh,false);
 await assert.rejects(rpc('staff_begin_auth_operation',[users.admin,'create',null,'otro@example.com','Ana Contable','accountant',request]),/otros datos/);
 await db.exec('reset role');await db.query('insert into auth.users(id,email) values($1,$2)',[id,'nuevo@example.com']);await as('service_role');await rpc('staff_finish_auth_operation',[users.admin,request,true,id]);
 assert.equal((await rpc('staff_begin_auth_operation',[users.admin,'create',null,'nuevo@example.com','Ana Contable','accountant',request])).status,'done');
 await as('admin');assert.equal((await rpc('staff_list_users',['Ana Contable'])).items[0].role,'accountant');
 const created=await rpc('staff_list_activity',[null,id]);assert(created.items.some(x=>x.action==='created'&&x.actor_id===users.admin));
 assert(created.items.filter(x=>x.action==='role_changed').every(x=>x.actor_id===users.admin));
 // Desactivación inmediata y conservación del historial.
 employee=(await rpc('staff_list_users',['employee@example.com'])).items[0];await rpc('staff_update_user',[users.employee,'José Operador','accountant',false,employee.version]);
 await as('employee');assert.equal(await rpc('get_my_staff_role'),null);await assert.rejects(rpc('finance_sales_status'),/permiso/);
 await as('admin');assert((await rpc('staff_list_activity',[users.employee])).total>0);
 await assert.rejects(rpc('staff_list_activity',[null,null,'bogus']),/Filtros/);await assert.rejects(rpc('staff_list_users',['','', '',1000,0]),/Filtros/);
 const paged=await rpc('staff_list_activity',[null,null,'','',null,null,2,0]);assert.equal(paged.items.length,2);assert(paged.total>2);
 const future=await rpc('staff_list_activity',[null,null,'','', '2099-01-01','2099-01-02']);assert.equal(future.total,0);
 // Los pedidos públicos siguen funcionando; su asiento queda como Sistema.
 await as('anon');const publicOrder=await rpc('create_order',[{name:'Compra privada',dni:'12345678',phone:'999111222',email:'no-copiar@example.com',address:'Dirección que no se copia'},[{id:4,qty:1}]]);assert(publicOrder.id);
 await as('admin');const system=await rpc('staff_list_activity',[null,null,'system','contabilidad']);assert(system.items.some(x=>x.action==='posted'&&x.actor_id===null));assert(!JSON.stringify(system).includes('no-copiar@example.com'));
 // Repetir la migración no borra usuarios ni reinicia el historial.
 await db.exec('reset role');const before=(await db.query('select count(*) n from public.staff_activity_log')).rows[0].n;await db.exec(readSQL('usuarios_auditoria.sql'));assert.equal((await db.query('select count(*) n from public.staff_activity_log')).rows[0].n,before);
 await db.close();console.log('PASS usuarios SQL: permisos, filtros, cuentas existentes, cambios y revocación, último dueño, concurrencia por versión, auditoría de acciones y roles históricos, privacidad, solicitudes durables, alta idempotente y migración repetible.');
})().catch(e=>{console.error(e);process.exit(1)});
