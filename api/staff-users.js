// Función de servidor de Vercel. La clave administrativa nunca sale de este archivo.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class APIError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code}}
function respond(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body))}
async function readBody(req){
 if(req.body!==undefined){const value=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(value)>8192)throw new APIError(413,'BODY_TOO_LARGE','El formulario es demasiado largo.');try{return JSON.parse(value)}catch{throw new APIError(400,'INVALID_BODY','Formulario inválido.')}}
 let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>8192)throw new APIError(413,'BODY_TOO_LARGE','El formulario es demasiado largo.')}
 try{return JSON.parse(text)}catch{throw new APIError(400,'INVALID_BODY','Formulario inválido.')}
}
function validate(body){
 if(!body||typeof body!=='object'||!['create','reset_password'].includes(body.action)||!UUID.test(body.request_id||''))throw new APIError(400,'INVALID_BODY','Operación inválida.');
 if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)throw new APIError(400,'INVALID_PASSWORD','La contraseña debe tener entre 12 y 128 caracteres.');
 if(body.action==='create'){
  if(typeof body.email!=='string'||body.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())||typeof body.full_name!=='string'||body.full_name.trim().length<2||body.full_name.trim().length>120||!['admin','employee','accountant'].includes(body.role))throw new APIError(400,'INVALID_BODY','Revisa el nombre, correo y rol.');
 }else if(!UUID.test(body.user_id||''))throw new APIError(400,'INVALID_BODY','Usuario inválido.');
}
function createHandler({fetcher=globalThis.fetch,env=process.env}={}){
 return async function handler(req,res){
  let actor,body,createdID;
  try{
   if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');throw new APIError(405,'METHOD_NOT_ALLOWED','Método no permitido.')}
   const authorization=req.headers.authorization||'';
   if(!/^Bearer [^\s]+$/i.test(authorization))throw new APIError(401,'UNAUTHORIZED','Inicia sesión para gestionar cuentas.');
   const url=(env.SUPABASE_URL||'').trim(),secret=(env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
   const missing=[!url&&'SUPABASE_URL',!secret&&'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean);
   if(missing.length)throw new APIError(503,'SETUP_REQUIRED','Falta configurar '+missing.join(' y ')+' en el servidor. Guárdala en el entorno Production de Vercel y vuelve a desplegar.');
   const urlError='Revisa SUPABASE_URL en Vercel: debe ser la URL base HTTPS del mismo proyecto de Supabase que usa la tienda, sin /rest/v1 ni otras rutas. Después vuelve a desplegar.';
   let parsed;try{parsed=new URL(url)}catch{throw new APIError(503,'SETUP_REQUIRED',urlError)}
   if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/')throw new APIError(503,'SETUP_REQUIRED',urlError);
   const base=parsed.origin;
   const request=async(path,{method='GET',data,user=false}={})=>{
    let result;try{result=await fetcher(base+path,{method,headers:{apikey:secret,Authorization:user?authorization:'Bearer '+secret,'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(15000)})}catch{throw new APIError(502,'UPSTREAM_UNAVAILABLE','No se pudo confirmar la operación. Actualiza el listado antes de reintentar.')}
    let json;try{json=await result.json()}catch{json={}}return {ok:result.ok,status:result.status,data:json};
   };
   const rpc=async(name,args)=>request('/rest/v1/rpc/'+name,{method:'POST',data:args});
   const identity=await request('/auth/v1/user',{user:true});
   if(identity.data?.message==='Invalid API key')throw new APIError(503,'SETUP_REQUIRED','Supabase rechazó la clave del servidor. Revisa SUPABASE_SERVICE_ROLE_KEY y que pertenezca al mismo proyecto que SUPABASE_URL; después vuelve a desplegar.');
   if(!identity.ok){
    if(identity.status===401||identity.status===403)throw new APIError(401,'UNAUTHORIZED','Supabase rechazó la sesión. Cierra sesión y vuelve a entrar. Si continúa, comprueba que SUPABASE_URL en Vercel corresponda al mismo proyecto que usa la tienda.');
    throw new APIError(502,'UPSTREAM_UNAVAILABLE','No se pudo validar la sesión en Supabase. Revisa SUPABASE_URL en Vercel y la disponibilidad del proyecto.');
   }
   if(!UUID.test(identity.data?.id||''))throw new APIError(502,'UPSTREAM_UNAVAILABLE','SUPABASE_URL no devolvió una respuesta válida de Supabase Auth. Revisa la URL del proyecto en Vercel.');
   actor=identity.data.id;
   const role=await request('/rest/v1/rpc/get_my_staff_role',{method:'POST',data:{},user:true});
   if(!role.ok)throw new APIError(503,'SETUP_REQUIRED','No se pudo comprobar el rol en Supabase. Revisa la instalación de roles.sql y usuarios_auditoria.sql en ese mismo proyecto.');
   if(role.data!=='admin')throw new APIError(403,'FORBIDDEN','Sólo el administrador puede gestionar cuentas.');
   if(req.method==='GET')return respond(res,200,{ready:true});
   if(!(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))throw new APIError(415,'INVALID_BODY','Usa un formulario JSON.');
   body=await readBody(req);validate(body);
   const start=await rpc('staff_begin_auth_operation',{p_actor:actor,p_action:body.action,p_user:body.action==='create'?null:body.user_id,p_email:body.action==='create'?body.email.trim().toLowerCase():'',p_name:body.action==='create'?body.full_name.trim():'',p_role:body.action==='create'?body.role:null,p_request:body.request_id});
   if(!start.ok){
    if(['PGRST202','42883'].includes(start.data.code))throw new APIError(503,'SETUP_REQUIRED','Falta activar el módulo de usuarios en Supabase.');
    throw new APIError(409,'OPERATION_REJECTED',start.data.code==='P0001'?start.data.message:'No se pudo iniciar la operación.');
   }
   if(!start.data.fresh){
    if(start.data.status==='done')return respond(res,200,{ok:true,user_id:start.data.user_id,reused:true});
    throw new APIError(409,'OPERATION_PENDING','La solicitud ya se recibió. Actualiza el listado para comprobar el resultado antes de volver a crear la cuenta.');
   }
   const finish=async(success,id=null)=>rpc('staff_finish_auth_operation',{p_actor:actor,p_request:body.request_id,p_success:success,p_user:id});
   let result;
   if(body.action==='create')result=await request('/auth/v1/admin/users',{method:'POST',data:{email:body.email.trim().toLowerCase(),password:body.password,email_confirm:true,user_metadata:{full_name:body.full_name.trim()}}});
   else result=await request('/auth/v1/admin/users/'+body.user_id,{method:'PUT',data:{password:body.password}});
   // No registrar nunca el cuerpo recibido, la contraseña o respuestas completas de Auth.
   if(!result.ok){
    await finish(false);
    if(['email_exists','user_already_exists','email_already_exists'].includes(result.data.code))throw new APIError(409,'ACCOUNT_EXISTS','El correo ya existe. Busca la cuenta en el listado para asignarle acceso.');
    if(result.data.code==='weak_password')throw new APIError(400,'AUTH_REJECTED','La contraseña no cumple la política de Supabase. Revisa su longitud y combina letras, números y símbolos.');
    throw new APIError(400,'AUTH_REJECTED','Supabase no pudo guardar la cuenta. Revisa el correo y las condiciones de la contraseña.');
   }
   const id=result.data.id||result.data.user?.id;
   if(!UUID.test(id||''))throw new APIError(502,'OPERATION_PENDING','No se pudo confirmar la cuenta. Actualiza el listado antes de reintentar.');
   if(body.action==='create')createdID=id;
   const saved=await finish(true,id);
   if(!saved.ok){
    // Una cuenta nueva sin rol no tiene acceso; intentar deshacer sólo la que acabamos de crear.
    if(createdID){const rollback=await request('/auth/v1/admin/users/'+createdID,{method:'DELETE'});if(rollback.ok)createdID=null}
    await finish(false);
    throw new APIError(409,'FINALIZATION_FAILED',body.action==='create'?'No se pudo completar el alta. Actualiza el listado y revisa las cuentas sin rol.':'La contraseña cambió, pero no se pudo confirmar el cierre de la operación. Revisa el historial.');
   }
   return respond(res,200,{ok:true,user_id:id});
  }catch(error){
   // Un corte de red puede dejar una solicitud pendiente. No marcar como fallo una acción cuyo resultado se desconoce.
   const known=error instanceof APIError;
   respond(res,known?error.status:500,{error:{code:known?error.code:'INTERNAL_ERROR',message:known?error.message:'No se pudo completar la operación. Actualiza el listado antes de reintentar.'}});
  }
 };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
