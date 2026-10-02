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
  try{await migrateImagesToIndexedDB(DB_KEY)}catch(err){console.warn("Migración de imágenes:",err)}
  loadCategories();updateFavCount();updateSearchClearVisibility();
  await renderProducts();await renderCart();await renderRecent();updateCount();
}
initStore();
setInterval(()=>{syncCartWithCatalog();renderCart();updateCount()},1000);
window.addEventListener("storage",e=>{if(e.key===DB_KEY){renderProducts();loadCategories();syncCartWithCatalog(true);renderCart();updateCount();renderRecent()}});
