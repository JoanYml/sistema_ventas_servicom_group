const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../api/staff-users.js');
const OWNER='11111111-1111-4111-8111-111111111111',USER='22222222-2222-4222-8222-222222222222',REQUEST='33333333-3333-4333-8333-333333333333';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-secret-test'};
const valid={action:'create',request_id:REQUEST,email:'nuevo@example.com',full_name:'Ana Contable',role:'accountant',password:'Temporal_segura_12345'};
function setup(overrides={},serverEnv=env){
 const calls=[];
 const fetcher=async(url,options)=>{
  const path=new URL(url).pathname;const call={path,...options,data:options.body?JSON.parse(options.body):null};calls.push(call);
  if(overrides[path])return overrides[path](call);
  const data=path==='/auth/v1/user'?{id:OWNER}:path.endsWith('/get_my_staff_role')?'admin':path.endsWith('/staff_begin_auth_operation')?{fresh:true,status:'pending'}:path==='/auth/v1/admin/users'?{id:USER}:null;
  return Response.json(data);
 };
 const handler=createHandler({env:serverEnv,fetcher});
 async function run(body=valid,method='POST',headers={authorization:'Bearer owner-session','content-type':'application/json'}){
  let status,result;const extra={};const req={method,headers,body};const res={setHeader(k,v){extra[k]=v},writeHead(s,h){status=s;Object.assign(extra,h)},end(text){result=JSON.parse(text)}};
  await handler(req,res);return {status,body:result,headers:extra};
 }
 return {run,calls,handler};
}
test('la API exige sesión validada y rol de dueño antes de crear cuentas',async()=>{
 let x=setup();assert.equal((await x.run(valid,'POST',{})).status,401);assert.equal(x.calls.length,0);
 x=setup({'/auth/v1/user':()=>Response.json({message:'Expired'},{status:401})});assert.equal((await x.run()).status,401);assert.equal(x.calls.length,1);
 x=setup({'/rest/v1/rpc/get_my_staff_role':()=>Response.json('employee')});assert.equal((await x.run()).status,403);assert(!x.calls.some(c=>c.path.includes('/admin/users')));
});
test('el dueño crea cuentas con identidad verificada y clave privada sólo en el servidor',async()=>{
 const x=setup(),result=await x.run({...valid,p_actor:USER});assert.equal(result.status,200);assert.equal(result.body.user_id,USER);assert.equal(result.headers['Cache-Control'],'no-store');
 const identity=x.calls.find(c=>c.path==='/auth/v1/user');assert.equal(identity.headers.Authorization,'Bearer owner-session');
 const begin=x.calls.find(c=>c.path.endsWith('/staff_begin_auth_operation'));assert.equal(begin.data.p_actor,OWNER);assert(!JSON.stringify(begin.data).includes(valid.password));
 const create=x.calls.find(c=>c.path==='/auth/v1/admin/users');assert.equal(create.headers.Authorization,'Bearer server-secret-test');assert.equal(create.data.password,valid.password);assert(create.data.email_confirm);
 const finish=x.calls.find(c=>c.path.endsWith('/staff_finish_auth_operation'));assert.equal(finish.data.p_success,true);assert.equal(finish.data.p_user,USER);
 assert(!JSON.stringify(result).includes('server-secret-test'));assert(!JSON.stringify(result).includes(valid.password));
});
test('validaciones y métodos inválidos no llegan a crear usuarios',async()=>{
 for(const data of [{...valid,role:'root'},{...valid,email:'no-es-correo'},{...valid,password:'corta'},{...valid,request_id:'no-uuid'}]){const x=setup();assert.equal((await x.run(data)).status,400);assert(!x.calls.some(c=>c.path.endsWith('staff_begin_auth_operation')))}
 let x=setup();assert.equal((await x.run(valid,'DELETE')).status,405);assert.equal(x.calls.length,0);
 x=setup();assert.equal((await x.run({...valid,password:'x'.repeat(9000)})).status,413);
});
test('los reintentos completados no crean otra cuenta ni cambian su contraseña',async()=>{
 const x=setup({'/rest/v1/rpc/staff_begin_auth_operation':()=>Response.json({fresh:false,status:'done',user_id:USER})});const result=await x.run();assert.equal(result.status,200);assert(result.body.reused);assert(!x.calls.some(c=>c.path.includes('/admin/users')));
 const pending=setup({'/rest/v1/rpc/staff_begin_auth_operation':()=>Response.json({fresh:false,status:'pending'})});assert.equal((await pending.run()).body.error.code,'OPERATION_PENDING');assert(!pending.calls.some(c=>c.path.includes('/admin/users')));
});
test('un fallo al asignar permisos compensa sólo la nueva cuenta y registra el fallo',async()=>{
 const x=setup({'/rest/v1/rpc/staff_finish_auth_operation':c=>c.data.p_success?Response.json({code:'P0001'},{status:400}):Response.json(null)});
 const result=await x.run();assert.equal(result.body.error.code,'FINALIZATION_FAILED');assert(x.calls.some(c=>c.path==='/auth/v1/admin/users/'+USER&&c.method==='DELETE'));assert(x.calls.some(c=>c.path.endsWith('/staff_finish_auth_operation')&&c.data.p_success===false));
});
test('Auth rechazado queda como fallo; un corte de red conserva una solicitud por confirmar',async()=>{
 let x=setup({'/auth/v1/admin/users':()=>Response.json({code:'email_exists'},{status:422})});assert.equal((await x.run()).body.error.code,'ACCOUNT_EXISTS');assert(x.calls.some(c=>c.path.endsWith('/staff_finish_auth_operation')&&c.data.p_success===false));
 x=setup({'/auth/v1/admin/users':()=>{throw Error('connection lost')}});assert.equal((await x.run()).body.error.code,'UPSTREAM_UNAVAILABLE');assert(!x.calls.some(c=>c.path.endsWith('/staff_finish_auth_operation')));
});
test('el restablecimiento usa el usuario indicado sin guardar su contraseña en la auditoría',async()=>{
 const x=setup({['/auth/v1/admin/users/'+USER]:()=>Response.json({id:USER})});const result=await x.run({action:'reset_password',user_id:USER,request_id:REQUEST,password:valid.password});assert.equal(result.status,200);assert(x.calls.some(c=>c.path.endsWith('/admin/users/'+USER)&&c.method==='PUT'));
 for(const call of x.calls.filter(c=>c.path.includes('/rpc/')))assert(!JSON.stringify(call.data).includes(valid.password));
});
test('la disponibilidad se comprueba sin entregar la clave y la configuración ausente es explícita',async()=>{
 const x=setup();assert.deepEqual((await x.run(undefined,'GET')).body,{ready:true});assert.equal(x.calls.length,2);
 for(const serverEnv of [{},{SUPABASE_URL:env.SUPABASE_URL},{SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_SERVICE_ROLE_KEY}]){
  const missing=setup({},serverEnv),result=await missing.run(undefined,'GET');assert.equal(result.status,503);assert.equal(result.body.error.code,'SETUP_REQUIRED');assert.equal(missing.calls.length,0);
  for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'])assert.equal(result.body.error.message.includes(key),!serverEnv[key]);
  assert(!JSON.stringify(result).includes(env.SUPABASE_SERVICE_ROLE_KEY));
 }
});
test('la configuración admite espacios al copiar y rechaza URLs con rutas antes de contactar con Supabase',async()=>{
 const x=setup({},{SUPABASE_URL:'  https://example.supabase.co/\n',SUPABASE_SERVICE_ROLE_KEY:' server-secret-test\n'});assert.equal((await x.run(undefined,'GET')).status,200);assert(x.calls.every(c=>c.headers.apikey==='server-secret-test'));
 for(const url of ['https://example.supabase.co/rest/v1','http://example.supabase.co','https://name:pass@example.supabase.co/','https://example.supabase.co/?key=private','no-es-url']){
  const invalid=setup({},{...env,SUPABASE_URL:url}),result=await invalid.run(undefined,'GET');assert.equal(result.status,503);assert.match(result.body.error.message,/SUPABASE_URL/);assert.equal(invalid.calls.length,0);assert(!JSON.stringify(result).includes(url));
 }
});
test('el diagnóstico distingue clave inválida, sesión rechazada, rol denegado y servicio no disponible',async()=>{
 for(const [endpoint,response,status,code,pattern] of [
  ['/auth/v1/user',()=>Response.json({message:'Invalid API key'},{status:401}),503,'SETUP_REQUIRED',/SUPABASE_SERVICE_ROLE_KEY/],
  ['/auth/v1/user',()=>Response.json({message:'Expired'},{status:401}),401,'UNAUTHORIZED',/Cierra sesión/],
  ['/auth/v1/user',()=>Response.json({},{status:503}),502,'UPSTREAM_UNAVAILABLE',/disponibilidad/],
  ['/auth/v1/user',()=>new Response('<html>Otro servicio</html>'),502,'UPSTREAM_UNAVAILABLE',/SUPABASE_URL/],
  ['/rest/v1/rpc/get_my_staff_role',()=>Response.json({code:'PGRST202'},{status:404}),503,'SETUP_REQUIRED',/roles.sql/],
  ['/rest/v1/rpc/get_my_staff_role',()=>Response.json('employee'),403,'FORBIDDEN',/administrador/]
 ]){
  const x=setup({[endpoint]:response}),result=await x.run(undefined,'GET');assert.equal(result.status,status);assert.equal(result.body.error.code,code);assert.match(result.body.error.message,pattern);assert(!x.calls.some(c=>c.path.includes('/admin/users')));assert(!JSON.stringify(result).includes(env.SUPABASE_SERVICE_ROLE_KEY));
 }
});
