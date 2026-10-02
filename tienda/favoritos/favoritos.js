const FAV_KEY="servicom_favorites";
let favorites=JSON.parse(localStorage.getItem(FAV_KEY)||"[]");
let onlyFavorites=false;
function saveFavorites(){localStorage.setItem(FAV_KEY,JSON.stringify(favorites));updateFavCount()}
function isFavorite(id){return favorites.includes(id)}
function updateFavCount(){const el=$("#favCount");if(el)el.textContent=favorites.length}
function toggleFavorite(id){
  const p=getDB().products.find(x=>x.id===id);
  const idx=favorites.indexOf(id);
  if(idx>=0){favorites.splice(idx,1);toast(`${p?p.name:"Producto"} se quitó de favoritos`)}
  else{favorites.push(id);toast(`${p?p.name:"Producto"} se guardó en favoritos`,"Ver favoritos",()=>{setOnlyFavorites(true);renderProducts();document.getElementById("catalogo").scrollIntoView({behavior:"smooth"})})}
  saveFavorites();
  renderProducts();
  renderRecent();
  const detailFav=$("#detailFavBtn");
  if(detailFav && Number(detailFav.dataset.id)===id){
    const active=isFavorite(id);
    detailFav.classList.toggle("active",active);
    detailFav.textContent=active?"♥ Guardado en favoritos":"♡ Guardar en favoritos";
  }
}
function setOnlyFavorites(v){
  onlyFavorites=v;
  const nav=$("#favBtn"),filt=$("#onlyFavBtn");
  if(nav)nav.classList.toggle("active",v);
  if(filt)filt.classList.toggle("active",v);
}
