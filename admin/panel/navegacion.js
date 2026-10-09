const ADMIN_VIEWS=["dashboard","categorias","pedidos"];
function showView(name){if(!ADMIN_VIEWS.includes(name))name="dashboard";document.querySelectorAll("[data-panel]").forEach(s=>s.classList.toggle("hidden",s.dataset.panel!==name));document.querySelectorAll(".sidebar-link").forEach(b=>{const on=b.dataset.view===name;b.classList.toggle("active",on);if(on)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});window.scrollTo(0,0)}
document.querySelectorAll(".sidebar-link").forEach(b=>b.onclick=()=>{location.hash=b.dataset.view});
window.addEventListener("hashchange",()=>showView(location.hash.slice(1)));
showView(location.hash.slice(1));
