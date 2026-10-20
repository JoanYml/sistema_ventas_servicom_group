const STAFF_ROLES={admin:'Administrador',employee:'Empleado',accountant:'Contable'};
const STAFF_SECTIONS={admin:['dashboard','productos','pedidos','atencion','empleados','contabilidad'],employee:['pedidos','atencion'],accountant:['dashboard','contabilidad']};
let staffRole=null,staffEmail='',staffLegacyAccess=false;
function staffCan(section,role=staffRole){return Object.hasOwn(STAFF_SECTIONS,role)&&STAFF_SECTIONS[role].includes(section)}
function staffDefaultView(role=staffRole){return STAFF_SECTIONS[role]?.[0]||null}
function staffApplyRole(role,email='',legacy=false){
 staffRole=Object.hasOwn(STAFF_ROLES,role)?role:null;staffEmail=email;staffLegacyAccess=legacy;
 configureAdminData(staffRole);
 document.querySelectorAll('[data-view]').forEach(button=>{const allowed=staffCan(button.dataset.view);button.classList.toggle('hidden',!allowed);button.disabled=!allowed});
 document.querySelectorAll('[data-owner-only]').forEach(element=>element.classList.toggle('hidden',staffRole!=='admin'));
 $('#staffRole').textContent=STAFF_ROLES[staffRole]||'';$('#staffEmail').textContent=email;$('#staffSession').classList.toggle('hidden',!staffRole);
 $('#staffSetupNotice').classList.toggle('hidden',!legacy);
 if(typeof showView==='function')showView(location.hash.slice(1));
}
async function resolveStaffAccess(){
 const {data:{session},error:sessionError}=await requireClient().auth.getSession();if(sessionError)throw sessionError;
 if(!session)return {role:null};
 const result=await requireClient().rpc('get_my_staff_role');
 if(result.error){
  if(['PGRST202','42883'].includes(result.error.code)){
   const owner=await requireClient().rpc('is_admin');if(owner.error)throw owner.error;
   return {role:owner.data===true?'admin':null,email:session.user.email||'',legacy:true};
  }
  throw result.error;
 }
 return {role:Object.hasOwn(STAFF_ROLES,result.data)?result.data:null,email:session.user.email||'',legacy:false};
}
