$("#cartBtn").onclick=openCart;
$("#ordersBtn").onclick=openOrders;
if($("#heroOrdersBtn"))$("#heroOrdersBtn").onclick=openOrders;
$("#checkoutBtn").onclick=checkout;
$("#clearCartBtn").onclick=clearCart;
$("#drawerBackdrop").onclick=closeCart;
document.querySelector("[data-close-cart]").onclick=closeCart;
document.addEventListener("click",e=>{const b=e.target.closest("[data-close]");if(b)document.getElementById(b.dataset.close).classList.add("hidden")});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeAll()});
$("#search").oninput=()=>{updateSearchClearVisibility();renderProducts()};
if($("#searchClear"))$("#searchClear").onclick=()=>{$("#search").value="";updateSearchClearVisibility();renderProducts();$("#search").focus()};
$("#category").onchange=renderProducts;
if($("#sortBy"))$("#sortBy").onchange=renderProducts;
if($("#favBtn"))$("#favBtn").onclick=()=>{setOnlyFavorites(!onlyFavorites);renderProducts();document.getElementById("catalogo").scrollIntoView({behavior:"smooth"})};
if($("#onlyFavBtn"))$("#onlyFavBtn").onclick=()=>{setOnlyFavorites(!onlyFavorites);renderProducts()};
async function initStore(){
  initDB("tienda");
  try{await refreshDB();storeCatalogState="ready"}catch(err){storeCatalogState="error";console.error(err)}
  loadCategories();updateFavCount();updateSearchClearVisibility();
  await renderProducts();await renderCart();await renderRecent();updateCount();
}
async function pollStore(){
  try{
    const previousState=storeCatalogState;
    const changed=await refreshDB();
    storeCatalogState="ready";
    if(changed||previousState!=="ready"){loadCategories();renderProducts();renderRecent()}
    syncCartWithCatalog();renderCart();updateCount();
  }catch(err){storeCatalogState="error";renderStoreCatalogStatus();console.warn("No se pudo actualizar el catálogo:",err)}
}
initStorePresentation();
initStore();
setInterval(()=>{syncCartWithCatalog();renderCart();updateCount()},1000);
setInterval(pollStore,10000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)pollStore()});
