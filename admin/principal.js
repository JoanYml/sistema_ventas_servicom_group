document.addEventListener("click",e=>{const b=e.target.closest("[data-close]");if(b)document.getElementById(b.dataset.close).classList.add("hidden")});

let adminPollTimer=null,staffAccessTimer=null,staffAccessChecking=false;

async function hasAdminAccess(){
  const access=await resolveStaffAccess();staffApplyRole(access.role,access.email,access.legacy);
  return !!access.role;
}

async function pollStaffAccess(){
  if(staffAccessChecking)return;staffAccessChecking=true;
  try{const access=await resolveStaffAccess();if(access.role!==staffRole){if(!access.role)await requireClient().auth.signOut();location.reload()}}
  catch(error){console.warn('No se pudieron comprobar los permisos del equipo.')}
  finally{staffAccessChecking=false}
}

async function loadAdminData(){
  try{await refreshDB();dashboardDataUpdated()}catch(err){dashboardSyncError=true;console.error(err);toast("No se pudieron cargar los datos. Inténtalo de nuevo.")}
  render();
}

function adminBusy(){
  const a=document.activeElement;
  return orderSaving||!$("#orderDetailModal").classList.contains("hidden")||!$("#adminModal").classList.contains("hidden")||(a&&a.id!=="dashboardPeriod"&&/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)&&a.closest("[data-panel='productos']"));
}

async function pollAdmin(){
  if(adminBusy())return;
  try{const changed=await refreshDB();dashboardDataUpdated();if(changed)render()}catch(err){dashboardSyncError=true;renderDashboardSync();console.warn("No se pudo actualizar:",err)}
}

async function showAdmin(){
  $("#loginModal").classList.add("hidden");
  $(".admin-layout").classList.remove("hidden");
  $("#logoutBtn").classList.remove("hidden");
  await loadAdminData();
  startAdminSupport();
  startBusinessManagement();
  clearInterval(adminPollTimer);
  adminPollTimer=setInterval(pollAdmin,15000);
  clearInterval(staffAccessTimer);staffAccessTimer=setInterval(pollStaffAccess,15000);
}

function showLogin(message){
  $(".admin-layout").classList.add("hidden");
  $("#logoutBtn").classList.add("hidden");
  $("#loginModal").classList.remove("hidden");
  const box=$("#loginError");
  box.textContent=message||"";
  box.classList.toggle("hidden",!message);
}

$("#loginForm").onsubmit=async e=>{
  e.preventDefault();
  const f=new FormData(e.target),btn=$("#loginBtn");
  btn.disabled=true;btn.textContent="Entrando...";
  try{
    const {error}=await requireClient().auth.signInWithPassword({email:String(f.get("email")).trim(),password:String(f.get("password"))});
    if(error)throw error;
    if(!(await hasAdminAccess())){await requireClient().auth.signOut();throw new Error("Tu cuenta no tiene un rol activo. Solicita al dueño que te asigne acceso.")}
    e.target.reset();
    await showAdmin();
  }catch(err){
    showLogin(err.message==="Invalid login credentials"?"Correo o contraseña incorrectos.":(err.message||"No se pudo iniciar sesión."));
  }finally{btn.disabled=false;btn.textContent="Entrar"}
};

$("#logoutBtn").onclick=async()=>{
  clearInterval(adminPollTimer);
  clearInterval(staffAccessTimer);
  stopAdminSupport();
  stopBusinessManagement();
  await requireClient().auth.signOut();
  location.reload();
};

(async function bootAdmin(){
  initDB("admin");
  render();
  try{
    if(await hasAdminAccess())await showAdmin();
    else showLogin("Inicia sesión con una cuenta del equipo que tenga un rol asignado.");
  }catch(err){
    console.error(err);
    showLogin(err.message);
  }
})();
