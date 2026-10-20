function loadCategories(){
  const select=$("#category"),current=select.value,groups=storeCategoryGroups(getDB().products);
  select.innerHTML='<option value="">Todas las categorías</option>'+groups.map(group=>`<option value="${escapeHTML(group.name)}">${escapeHTML(group.name)} (${group.count})</option>`).join("");
  select.value=groups.some(group=>group.name===current)?current:"";
}
function sortProducts(list,sortBy){
  const arr=[...list];
  if(sortBy==="price-asc")arr.sort((a,b)=>a.price-b.price);
  else if(sortBy==="price-desc")arr.sort((a,b)=>b.price-a.price);
  else if(sortBy==="name-asc")arr.sort((a,b)=>a.name.localeCompare(b.name,"es"));
  else if(sortBy==="stock-desc")arr.sort((a,b)=>b.stock-a.stock);
  return arr;
}
function productCardHTML(p){
  const low=p.stock>0&&p.stock<10,out=p.stock<1,fav=isFavorite(p.id);
  return `<article class="product-card" data-product-id="${p.id}">
    <div class="product-image"><button type="button" class="store-product-preview" onclick="openProduct(${p.id})" aria-label="Ver ${escapeHTML(p.name)}">${storeProductVisual(p)}</button><button type="button" class="fav-btn ${fav?"active":""}" data-id="${p.id}" onclick="toggleFavorite(${p.id})" aria-pressed="${fav}" aria-label="${fav?"Quitar de favoritos":"Guardar en favoritos"}: ${escapeHTML(p.name)}" title="${fav?"Quitar de favoritos":"Guardar en favoritos"}">${fav?"♥":"♡"}</button>${out?'<span class="stock-flag out">Agotado</span>':low?'<span class="stock-flag">Pocas unidades</span>':""}</div>
    <div class="product-body"><span class="tag">${escapeHTML(p.category)}</span><h3><button type="button" onclick="openProduct(${p.id})">${escapeHTML(p.name)}</button></h3><p>${escapeHTML(p.description)}</p><div class="store-product-meta"><div><span class="store-price-label">Precio</span><div class="price">${money(p.price)}</div></div><span class="stock ${out?"out":low?"low":""}">${out?"Sin stock":`${p.stock} disponibles`}</span></div><div class="card-actions"><button class="store-product-details" type="button" onclick="openProduct(${p.id})">Ver detalles <span aria-hidden="true">${storeArrowIcon()}</span></button><button class="quick-add-btn" type="button" onclick="quickAdd(${p.id})" ${out?"disabled":""} title="Agregar 1 unidad al carrito" aria-label="Agregar 1 unidad de ${escapeHTML(p.name)} al carrito"><span aria-hidden="true">＋</span><span>Agregar</span></button></div></div>
  </article>`;
}
function emptyStateHTML(){
  const active=getDB().products.some(p=>p.active),error=storeCatalogState==="error"&&!active;
  return `<div class="empty store-empty"><span class="store-empty-icon" aria-hidden="true">${storeCategoryIcon("Productos")}</span><h3>${error?"El catálogo no está disponible por el momento":active?"No encontramos lo que buscas":"Todavía no hay productos publicados"}</h3><p>${error?"Puedes volver a intentar desde el aviso superior.":active?"Prueba otra búsqueda o quita algún filtro para seguir explorando.":"Puedes resolver tus dudas en nuestro centro de ayuda."}</p>${active?'<button class="secondary-btn" onclick="resetFilters()" type="button">Quitar filtros</button>':""}</div>`;
}
function resetFilters(){
  $("#search").value="";
  $("#category").value="";
  if($("#sortBy"))$("#sortBy").value="";
  $("#inStockOnly").checked=false;
  setOnlyFavorites(false);
  updateSearchClearVisibility();
  renderProducts();
}
function updateSearchClearVisibility(){
  const wrap=$("#searchWrap");
  if(wrap)wrap.classList.toggle("has-value",!!$("#search").value);
}
async function renderProducts(){
  const list=filterStoreProducts(getDB().products,storeFilterState());
  $("#productsGrid").innerHTML=list.length?list.map(productCardHTML).join(""):emptyStateHTML();
  renderStorePresentation(list);
  await hydrateImages($("#productsGrid"));
}
