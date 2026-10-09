function loadCategories(){const sel=$("#category"),cur=sel.value,cats=[...new Set(getDB().products.map(p=>p.category))];sel.innerHTML='<option value="">Todas las categorías</option>'+cats.map(c=>`<option>${escapeHTML(c)}</option>`).join("");sel.value=cats.includes(cur)?cur:""}
function sortProducts(list,sortBy){
  const arr=[...list];
  if(sortBy==="price-asc")arr.sort((a,b)=>a.price-b.price);
  else if(sortBy==="price-desc")arr.sort((a,b)=>b.price-a.price);
  else if(sortBy==="name-asc")arr.sort((a,b)=>a.name.localeCompare(b.name,"es"));
  else if(sortBy==="stock-desc")arr.sort((a,b)=>b.stock-a.stock);
  return arr;
}
function productCardHTML(p){
  const low=p.stock>0&&p.stock<10;
  const out=p.stock<1;
  const fav=isFavorite(p.id);
  return `<article class="product-card">
    <div class="product-image">
      <button type="button" class="fav-btn ${fav?"active":""}" data-id="${p.id}" onclick="toggleFavorite(${p.id})" aria-label="${fav?"Quitar de favoritos":"Guardar en favoritos"}" title="${fav?"Quitar de favoritos":"Guardar en favoritos"}">${fav?"♥":"♡"}</button>
      ${out?'<span class="stock-flag out">Sin stock</span>':(low?'<span class="stock-flag">¡Últimas unidades!</span>':"")}
      ${productImage(p,"product-img","icon")}
    </div>
    <div class="product-body">
      <span class="tag">${p.category}</span>
      <h3>${p.name}</h3>
      <p>${p.description}</p>
      <div class="price">${money(p.price)}</div>
      <div class="stock ${low?"low":""}">${p.stock} disponibles</div>
      <div class="card-actions">
        <button class="primary-btn" onclick="openProduct(${p.id})" ${out?"disabled":""}>Ver producto</button>
        <button class="quick-add-btn" onclick="quickAdd(${p.id})" ${out?"disabled":""} title="Agregar 1 unidad al carrito" aria-label="Agregar 1 unidad de ${p.name} al carrito">+</button>
      </div>
    </div>
  </article>`;
}
function emptyStateHTML(){
  return `<div class="empty"><span class="empty-icon">🔍</span><div>No encontramos productos con estos filtros.</div><button class="secondary-btn" onclick="resetFilters()" type="button">Quitar filtros</button></div>`;
}
function resetFilters(){
  $("#search").value="";
  $("#category").value="";
  if($("#sortBy"))$("#sortBy").value="";
  setOnlyFavorites(false);
  updateSearchClearVisibility();
  renderProducts();
}
function updateSearchClearVisibility(){
  const wrap=$("#searchWrap");
  if(wrap)wrap.classList.toggle("has-value",!!$("#search").value);
}
async function renderProducts(){
  const db=getDB(),q=$("#search").value.toLowerCase(),cat=$("#category").value,sortBy=$("#sortBy")?$("#sortBy").value:"";
  let list=db.products.filter(p=>p.active&&(!q||p.name.toLowerCase().includes(q))&&(!cat||p.category===cat));
  if(onlyFavorites)list=list.filter(p=>favorites.includes(p.id));
  list=sortProducts(list,sortBy);
  $("#productsGrid").innerHTML=list.length?list.map(productCardHTML).join(""):emptyStateHTML();
  await hydrateImages($("#productsGrid"));
}
