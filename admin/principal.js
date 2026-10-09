document.addEventListener("click",e=>{const b=e.target.closest("[data-close]");if(b)document.getElementById(b.dataset.close).classList.add("hidden")});

let adminPollTimer=null;

async function hasAdminAccess(){
  const {data:{session}}=await requireClient().auth.getSession();
  if(!session)return false;
  const {data,error}=await sb.rpc("is_admin");
  if(error||data!==true){await sb.auth.signOut();return false}
  return true;
}

async function loadAdminData(){
  try{await refreshDB()}catch(err){console.error(err);toast(err.message||"No se pudo cargar los datos")}
  render();
}

function adminBusy(){
  const a=document.activeElement;
  return !$("#adminModal").classList.contains("hidden")||(a&&/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)&&a.closest("main"));
}

async function pollAdmin(){
  if(adminBusy())return;
  try{if(await refreshDB())render()}catch(err){console.warn("No se pudo actualizar:",err)}
}

async function showAdmin(){
  $("#loginModal").classList.add("hidden");
  $("#logoutBtn").classList.remove("hidden");
  await loadAdminData();
  clearInterval(adminPollTimer);
  adminPollTimer=setInterval(pollAdmin,15000);
}

function showLogin(message){
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
    if(!(await hasAdminAccess()))throw new Error("Este usuario no tiene permisos de administrador.");
    e.target.reset();
    await showAdmin();
  }catch(err){
    showLogin(err.message==="Invalid login credentials"?"Correo o contraseña incorrectos.":(err.message||"No se pudo iniciar sesión."));
  }finally{btn.disabled=false;btn.textContent="Entrar"}
};

$("#logoutBtn").onclick=async()=>{
  clearInterval(adminPollTimer);
  await requireClient().auth.signOut();
  location.reload();
};

(async function bootAdmin(){
  initDB("admin");
  render();
  try{
    if(await hasAdminAccess())await showAdmin();
    else showLogin();
  }catch(err){
    console.error(err);
    showLogin(err.message);
  }
})();
