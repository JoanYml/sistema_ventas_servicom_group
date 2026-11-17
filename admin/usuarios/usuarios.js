const USERS_PAGE_SIZE=25,USERS_LOG_PAGE_SIZE=30;
const USER_ROLE_ACCESS={admin:'Todos los apartados, incluida la gestión de usuarios.',employee:'Únicamente Pedidos y Atención.',accountant:'Únicamente Dashboard y Contabilidad.'};
let usersRows=[],usersSelected=null,usersPage=1,usersLogPage=1,usersReady=false,usersLoading=false,usersLoadVersion=0,usersLogVersion=0,usersServerReady=false,usersSearchTimer;
function usersError(error){if(['PGRST202','PGRST205','42883','42P01'].includes(error?.code))return 'Falta activar el módulo de usuarios. Consulta las instrucciones de activación.';return managementError(error)}
function usersRoleOptions(value='employee'){return Object.entries(STAFF_ROLES).map(([key,label])=>`<option value="${key}" ${key===value?'selected':''}>${label}</option>`).join('')}
async function usersServerRequest(body=null){
 const {data:{session}}=await requireClient().auth.getSession();if(!session?.access_token)throw {code:'P0001',message:'La sesión venció. Inicia sesión de nuevo.'};
 let response;
 try{response=await fetch('/api/staff-users',{method:body?'POST':'GET',headers:{Authorization:'Bearer '+session.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)})}
 catch{throw {code:'P0001',apiCode:'NETWORK_ERROR',message:'No se pudo confirmar la operación. Actualiza el listado antes de reintentar.'}}
 let result;try{result=await response.json()}catch{result={}}
 if(!response.ok)throw {code:'P0001',apiCode:result.error?.code||'SERVER_ERROR',message:result.error?.message||'No se pudo gestionar la cuenta. Comprueba la activación del servidor.'};
 if(body?result.ok!==true||typeof result.user_id!=='string':result.ready!==true)throw {code:'P0001',apiCode:body?'UPSTREAM_UNAVAILABLE':'SETUP_REQUIRED',message:'El servidor no confirmó la operación. Actualiza el listado y revisa la activación del servicio.'};
 return result;
}
async function recordStaffSession(action){try{await Promise.race([requireClient().rpc('staff_record_session',{p_action:action}),new Promise(resolve=>setTimeout(resolve,1500))])}catch{/* Una incidencia de telemetría no bloquea entrar o salir. */}}
async function loadUsers(force=false){
 if(!staffCan('usuarios')||(usersLoading&&!force))return false;
 const version=++usersLoadVersion;usersLoading=true;$('#usersFeedback').textContent='Cargando cuentas…';
 try{
  const result=await managementRPC('staff_list_users',{p_search:$('#usersSearch').value.trim(),p_role:$('#usersRole').value,p_status:$('#usersStatus').value,p_limit:USERS_PAGE_SIZE,p_offset:(usersPage-1)*USERS_PAGE_SIZE});
  if(version!==usersLoadVersion||!staffCan('usuarios'))return false;
  const pages=Math.max(1,Math.ceil(result.total/USERS_PAGE_SIZE));if(usersPage>pages){usersPage=pages;usersLoading=false;return loadUsers(true)}
  usersRows=result.items;usersReady=true;
  if(usersSelected){
   const selectedID=usersSelected.id;
   let selected=usersRows.find(u=>u.id===selectedID);
   if(!selected){const lookup=await managementRPC('staff_list_users',{p_search:selectedID,p_role:'',p_status:'',p_limit:1,p_offset:0});selected=lookup.items.find(u=>u.id===selectedID)}
   if(version!==usersLoadVersion||!staffCan('usuarios'))return false;
   if(usersSelected?.id===selectedID)usersSelected=selected||null;
  }
  renderUsers(result);$('#usersFeedback').textContent='Cuentas de Supabase y permisos actuales. El historial conserva el rol que tenía cada persona al realizar la acción.';
  try{await usersServerRequest();if(version===usersLoadVersion)usersServerReady=true}catch{if(version===usersLoadVersion)usersServerReady=false}
  if(version!==usersLoadVersion)return false;
  $('#usersNew').disabled=!usersServerReady;$('#usersServerNotice').hidden=usersServerReady;
  await loadUserActivity();return true;
 }catch(error){if(version===usersLoadVersion){$('#usersFeedback').textContent=usersError(error);if(!usersReady)$('#usersTable').innerHTML='<tr><td colspan="5">Activa el módulo para consultar usuarios y registros.</td></tr>';$('#usersNew').disabled=true}return false}
 finally{if(version===usersLoadVersion)usersLoading=false}
}
function renderUsers(result){
 const s=result.summary;
 $('#usersSummary').innerHTML=[['Cuentas',s.total,'Con correo en Supabase'],['Accesos activos',s.active,'Cuentas con un rol habilitado'],['Empleados',s.employee,'Pedidos y Atención'],['Contables',s.accountant,'Dashboard y Contabilidad']].map(([label,value,note])=>`<div class="business-stat"><small>${label}</small><strong>${value}</strong><span>${note}</span></div>`).join('');
 const pages=Math.max(1,Math.ceil(result.total/USERS_PAGE_SIZE));$('#usersCount').textContent=`${result.total} usuarios encontrados`;$('#usersPage').textContent=`Página ${usersPage} de ${pages}`;$('#usersPrev').disabled=usersPage<=1;$('#usersNext').disabled=usersPage>=pages;
 $('#usersTable').innerHTML=result.items.length?result.items.map(u=>`<tr><td><b>${escapeHTML(u.full_name||'Sin nombre registrado')}</b><span class="business-subtext">${escapeHTML(u.email)}</span></td><td>${STAFF_ROLES[u.role]||'Sin rol'}</td><td><span class="business-pill ${u.role&&u.active?'positive':'muted'}">${!u.role?'Sin acceso':u.active?'Activo':'Desactivado'}</span></td><td>${u.last_sign_in_at?ordersDate(u.last_sign_in_at):'Sin inicio registrado'}</td><td><div class="users-row-actions"><button class="mini-btn" type="button" data-user-activity="${u.id}">Ver actividad</button><button class="mini-btn" type="button" data-user-edit="${u.id}">Editar acceso</button></div></td></tr>`).join(''):'<tr><td colspan="5" class="empty-note">No hay usuarios que coincidan con los filtros.</td></tr>';
 document.querySelectorAll('[data-user-activity]').forEach(b=>b.onclick=()=>{usersSelected=usersRows.find(u=>u.id===b.dataset.userActivity);usersLogPage=1;$('#usersLogMode').value='actor';$('#usersAuditRole').value='';loadUserActivity();$('#usersActivityCard').scrollIntoView({behavior:'smooth',block:'start'})});
 document.querySelectorAll('[data-user-edit]').forEach(b=>b.onclick=()=>usersOpenEdit(usersRows.find(u=>u.id===b.dataset.userEdit)));
 renderUserSelection();
}
function renderUserSelection(){
 const u=usersSelected;
 $('#usersActivityTitle').textContent=u?'Historial de '+(u.full_name||u.email):'Actividad del equipo';
 $('#usersSelection').textContent=u?`${u.email} · ${STAFF_ROLES[u.role]||'Sin rol'} · ${u.active&&u.role?'Acceso activo':'Sin acceso activo'}`:'Consulta las acciones registradas desde la activación de este módulo.';
 $('#usersClearSelection').hidden=!u;$('#usersLogModeLabel').hidden=!u;
 $('#usersResetPassword').hidden=!u;$('#usersResetPassword').disabled=!usersServerReady;
}
const USER_ACTION_LABELS={
 'usuarios.created':'Creó una cuenta','usuarios.role_changed':'Cambió el rol o acceso','usuarios.profile_updated':'Actualizó el nombre de una cuenta',
 'usuarios.create_requested':'Solicitó crear una cuenta','usuarios.create_failed':'No se completó la creación de cuenta',
 'usuarios.password_reset':'Restableció una contraseña','usuarios.reset_password_requested':'Solicitó restablecer una contraseña','usuarios.reset_password_failed':'No se confirmó el restablecimiento',
 'sesion.opened':'Accedió al panel','sesion.closed':'Cerró sesión en el panel',
 'productos.created':'Creó un producto','productos.updated':'Actualizó un producto','productos.deleted':'Eliminó un producto',
 'pedidos.status_changed':'Cambió el estado de un pedido','atencion.replied':'Respondió una consulta','atencion.status_changed':'Cambió el estado de una conversación',
 'empleados.created':'Registró una ficha de empleado','empleados.updated':'Actualizó una ficha de empleado','empleados.transfer':'Trasladó un empleado','empleados.status':'Cambió la situación de un empleado',
 'contabilidad.posted':'Registró un asiento contable','contabilidad.reversed':'Registró una reversión','contabilidad.period_closed':'Cerró un período','contabilidad.period_reopened':'Reabrió un período','contabilidad.account_created':'Creó una cuenta contable','contabilidad.sales_configured':'Cambió la cuenta de ingresos automáticos'
};
const USER_DETAIL_LABELS={name:'Producto',fields:'Campos modificados',previous_stock:'Stock anterior',stock:'Stock nuevo',previous_price:'Precio anterior',price:'Precio nuevo',previous_status:'Estado anterior',status:'Estado nuevo',previous_role:'Rol anterior',role:'Rol nuevo',previous_active:'Acceso anterior',active:'Acceso nuevo',full_name:'Nombre',email:'Correo',message_id:'Mensaje',characters:'Caracteres de la respuesta',employee_code:'Código de empleado',job_title:'Cargo',previous_branch:'Sucursal anterior',branch:'Sucursal nueva',total:'Importe del asiento',branch_id:'Ámbito',month:'Período',reason:'Motivo',code:'Cuenta',reversal:'Asiento de reversión',scope:'Ámbito',cash:'Cuenta de caja/banco',request_id:'Solicitud'};
function userLogValue(value){if(value===null||value===undefined)return 'Sin dato';if(typeof value==='boolean')return value?'Activo':'Desactivado';if(Array.isArray(value))return value.join(', ');return String(value)}
async function loadUserActivity(){
 if(!staffCan('usuarios')||!usersReady)return;
 const version=++usersLogVersion,u=usersSelected,mode=$('#usersLogMode').value;renderUserSelection();$('#usersLogFeedback').textContent='Cargando registros…';
 const from=$('#usersLogFrom').value,to=$('#usersLogTo').value;if(from&&to&&from>to){$('#usersLogFeedback').textContent='La fecha inicial no puede ser posterior a la final.';return}
 try{
  const result=await managementRPC('staff_list_activity',{p_actor:u&&mode==='actor'?u.id:null,p_subject:u&&mode==='subject'?u.id:null,p_role:$('#usersAuditRole').value,p_module:$('#usersLogModule').value,p_from:from||null,p_to:to||null,p_limit:USERS_LOG_PAGE_SIZE,p_offset:(usersLogPage-1)*USERS_LOG_PAGE_SIZE});
  if(version!==usersLogVersion||!staffCan('usuarios'))return;
  const pages=Math.max(1,Math.ceil(result.total/USERS_LOG_PAGE_SIZE));if(usersLogPage>pages){usersLogPage=pages;return loadUserActivity()}
  $('#usersLogCount').textContent=`${result.total} registros`;$('#usersLogPage').textContent=`Página ${usersLogPage} de ${pages}`;$('#usersLogPrev').disabled=usersLogPage<=1;$('#usersLogNext').disabled=usersLogPage>=pages;
  $('#usersLogTable').innerHTML=result.items.length?result.items.map(a=>`<tr><td>${ordersDate(a.created_at)}</td><td><b>${escapeHTML(a.actor_name||a.actor_email||(a.actor_id?'Cuenta no disponible':'Proceso automático'))}</b>${a.actor_email?`<span class="business-subtext">${escapeHTML(a.actor_email)}</span>`:''}<span class="business-subtext">${a.actor_id?(STAFF_ROLES[a.actor_role]||'Sin rol'):'Sistema'}</span></td><td><b>${escapeHTML(USER_ACTION_LABELS[a.module+'.'+a.action]||a.action)}</b><span class="business-subtext">${escapeHTML(a.module)}</span></td><td><span class="users-target">${escapeHTML(a.target_id||'Operación general')}</span>${Object.keys(a.details).length?`<details class="users-log-details"><summary>Ver cambios</summary><dl>${Object.entries(a.details).map(([k,v])=>`<dt>${escapeHTML(USER_DETAIL_LABELS[k]||k)}</dt><dd>${escapeHTML(userLogValue(v))}</dd>`).join('')}</dl></details>`:''}</td></tr>`).join(''):'<tr><td colspan="4" class="empty-note">No hay acciones registradas para estos filtros.</td></tr>';
  $('#usersLogFeedback').textContent=u&&mode==='subject'?'Cambios hechos por los administradores sobre esta cuenta.':'Acciones realizadas por las cuentas del equipo; las automáticas se identifican como Sistema.';
 }catch(error){if(version===usersLogVersion)$('#usersLogFeedback').textContent=usersError(error)}
}
function usersBindRoleHelp(){const role=$('#managementForm [name=role]'),note=$('#userRoleHelp');const update=()=>note.textContent=USER_ROLE_ACCESS[role.value]||'';role.onchange=update;update()}
function usersOpenCreate(){
 let nonce=crypto.randomUUID(),signature='';
 managementOpenModal('Crear usuario',`<p class="business-caption">La cuenta podrá iniciar sesión con el correo y la contraseña inicial. No se crea una ficha laboral automáticamente.</p><div class="form-grid">${managementField('Nombre completo','full_name','text','','required minlength="2" maxlength="120" autocomplete="name"')}${managementField('Correo de acceso','email','email','','required maxlength="254" autocomplete="off"')}<label>Rol<select name="role" required>${usersRoleOptions()}</select></label><p id="userRoleHelp" class="business-caption"></p>${managementField('Contraseña inicial','password','password','','required minlength="12" maxlength="128" autocomplete="new-password"')}${managementField('Confirmar contraseña','confirm_password','password','','required minlength="12" maxlength="128" autocomplete="new-password"')}</div><p class="business-caption">Comparte las credenciales directamente con la persona. Las contraseñas no se guardan en el historial.</p>`,async form=>{
  if(form.get('password')!==form.get('confirm_password'))throw {code:'P0001',message:'Las contraseñas no coinciden.'};
  const next=JSON.stringify([form.get('full_name'),form.get('email'),form.get('role')]);if(signature&&signature!==next)nonce=crypto.randomUUID();signature=next;
  try{await usersServerRequest({action:'create',request_id:nonce,full_name:form.get('full_name'),email:form.get('email'),role:form.get('role'),password:form.get('password')})}
  catch(error){if(!['NETWORK_ERROR','OPERATION_PENDING','UPSTREAM_UNAVAILABLE'].includes(error.apiCode))nonce=crypto.randomUUID();throw error}
  finally{$('#managementForm').querySelectorAll('input[type=password]').forEach(input=>input.value='')}
 },'Crear cuenta');usersBindRoleHelp();
}
function usersOpenEdit(u){
 if(!u)return;
 managementOpenModal('Acceso de '+(u.full_name||u.email),`<p class="business-caption">${escapeHTML(u.email)}. Desactivar conserva la cuenta y su historial.</p><div class="form-grid">${managementField('Nombre completo','full_name','text',u.full_name,'required minlength="2" maxlength="120"')}<label>Rol<select name="role" required>${usersRoleOptions(u.role||'employee')}</select></label><label>Acceso<select name="active"><option value="true" ${u.active?'selected':''}>Activo</option><option value="false" ${!u.active?'selected':''}>Desactivado</option></select></label><p id="userRoleHelp" class="business-caption"></p></div>`,async form=>managementRPC('staff_update_user',{p_user:u.id,p_name:form.get('full_name'),p_role:form.get('role'),p_active:form.get('active')==='true',p_version:u.version}));usersBindRoleHelp();
}
function usersOpenPassword(){
 const u=usersSelected;if(!u)return;let nonce=crypto.randomUUID();
 managementOpenModal('Restablecer contraseña',`<p class="business-caption">Cuenta: ${escapeHTML(u.email)}. La contraseña anterior dejará de funcionar.</p><div class="form-grid">${managementField('Nueva contraseña','password','password','','required minlength="12" maxlength="128" autocomplete="new-password"')}${managementField('Confirmar contraseña','confirm_password','password','','required minlength="12" maxlength="128" autocomplete="new-password"')}</div>`,async form=>{
  if(form.get('password')!==form.get('confirm_password'))throw {code:'P0001',message:'Las contraseñas no coinciden.'};
  try{await usersServerRequest({action:'reset_password',request_id:nonce,user_id:u.id,password:form.get('password')})}catch(error){if(!['NETWORK_ERROR','OPERATION_PENDING','UPSTREAM_UNAVAILABLE'].includes(error.apiCode))nonce=crypto.randomUUID();throw error}finally{$('#managementForm').querySelectorAll('input[type=password]').forEach(input=>input.value='')}
 },'Cambiar contraseña');
}
$('#usersNew').onclick=usersOpenCreate;$('#usersRefresh').onclick=()=>loadUsers(true);
$('#usersSearch').oninput=()=>{
 clearTimeout(usersSearchTimer);usersLoadVersion++;usersLoading=true;$('#usersFeedback').textContent='Buscando usuarios…';
 document.querySelectorAll('[data-user-activity],[data-user-edit]').forEach(button=>button.disabled=true);
 usersSearchTimer=setTimeout(()=>{usersPage=1;loadUsers(true)},250);
};
for(const id of ['usersRole','usersStatus'])document.getElementById(id).onchange=()=>{usersPage=1;loadUsers(true)};
$('#usersPrev').onclick=()=>{usersPage--;loadUsers(true)};$('#usersNext').onclick=()=>{usersPage++;loadUsers(true)};
$('#usersLogPrev').onclick=()=>{usersLogPage--;loadUserActivity()};$('#usersLogNext').onclick=()=>{usersLogPage++;loadUserActivity()};
$('#usersLogApply').onclick=()=>{usersLogPage=1;loadUserActivity()};
for(const id of ['usersLogMode','usersAuditRole','usersLogModule'])document.getElementById(id).onchange=()=>{usersLogPage=1;loadUserActivity()};
$('#usersClearSelection').onclick=()=>{usersSelected=null;usersLogPage=1;loadUserActivity()};$('#usersResetPassword').onclick=usersOpenPassword;
