let storeCatalogState="loading";
let storeCatalogView="grid";
let storeShowcaseIndex=0,storeShowcaseSignature="",storeCategorySignature="";
try{if(localStorage.getItem("servicom_catalog_view")==="list")storeCatalogView="list"}catch{}

function storeSearchText(value){return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
function scrollStoreCatalog(){document.getElementById("catalogo").scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"})}
function storeCategoryType(value){
  const name=storeSearchText(value);
  if(/mouse|raton/.test(name))return "mouse";
  if(/webcam|camara/.test(name))return "camera";
  if(/impresora/.test(name))return "printer";
  if(/laptop|portatil|computador/.test(name))return "laptop";
  if(/monitor|pantalla/.test(name))return "monitor";
  if(/audio|audifono|auricular|sonido/.test(name))return "audio";
  if(/redes|router|wifi/.test(name))return "network";
  if(/almacen|disco|ssd|memoria/.test(name))return "storage";
  if(/perifer|teclado|mouse|accesorio/.test(name))return "keyboard";
  return "box";
}
function storeCategoryIcon(value){
  const paths={laptop:'<rect x="4" y="3" width="16" height="13" rx="2"/><path d="M2 20h20l-2-4H4l-2 4Z"/>',monitor:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M12 17v4M7 21h10"/>',audio:'<path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="2" y="12" width="5" height="9" rx="2"/><rect x="17" y="12" width="5" height="9" rx="2"/>',network:'<rect x="3" y="12" width="18" height="9" rx="2"/><path d="M6 12V5m12 7V3M7 17h.01M11 17h.01M15 17h.01"/>',storage:'<rect x="4" y="2" width="16" height="20" rx="3"/><circle cx="12" cy="10" r="4"/><path d="M8 18h8"/>',keyboard:'<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M10 14h8"/>',box:'<path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7.5 5 9 4 9 4"/>'};
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[storeCategoryType(value)]||paths.box}</svg>`;
}
function storeArrowIcon(){return '<svg class="store-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg>'}
function storeProductVisual(product,className="product-img"){
  return imageRef(product,"icon")?productImage(product,className,"icon"):`<span class="store-art-wrap">${storeCategoryIcon(product.category||"Productos")}<small>Imagen no disponible</small></span>`;
}
function storeCategoryGroups(products){
  const groups=new Map();
  for(const product of products.filter(p=>p.active)){const name=product.category||"Otros";groups.set(name,(groups.get(name)||0)+1)}
  return [...groups].map(([name,count])=>({name,count})).sort((a,b)=>a.name.localeCompare(b.name,"es"));
}
function filterStoreProducts(products,filters){
  const query=storeSearchText(filters.search);
  let list=products.filter(p=>p.active&&(!query||storeSearchText(`${p.name} ${p.category} ${p.description||""}`).includes(query))&&(!filters.category||(p.category||"Otros")===filters.category)&&(!filters.inStock||p.stock>0)&&(!filters.onlyFavorites||(filters.favorites||[]).includes(p.id)));
  return sortProducts(list,filters.sort||"");
}
function storeFilterState(){return {search:$("#search").value,category:$("#category").value,sort:$("#sortBy").value,inStock:$("#inStockOnly").checked,onlyFavorites,favorites}}
function renderStoreCategories(){
  const groups=storeCategoryGroups(getDB().products),signature=JSON.stringify(groups),container=$("#storeCategories");
  if(signature!==storeCategorySignature){
    container.innerHTML=groups.slice(0,6).map(group=>`<button class="store-category-card" type="button" data-store-category="${escapeHTML(group.name)}" aria-pressed="false"><span class="store-category-icon">${storeCategoryIcon(group.name)}</span><span><b>${escapeHTML(group.name)}</b><small>${group.count} ${group.count===1?"producto":"productos"}</small></span><span class="store-category-arrow" aria-hidden="true">${storeArrowIcon()}</span></button>`).join("");
    container.querySelectorAll("button").forEach(button=>button.onclick=()=>{$("#category").value=$("#category").value===button.dataset.storeCategory?"":button.dataset.storeCategory;renderProducts();scrollStoreCatalog()});
    const departments=$("#storeDepartmentLinks");
    departments.innerHTML=groups.slice(0,6).map(group=>`<button type="button" data-department="${escapeHTML(group.name)}" aria-pressed="false">${escapeHTML(group.name)}</button>`).join("");
    departments.querySelectorAll("button").forEach(button=>button.onclick=()=>{$("#category").value=button.dataset.department;renderProducts();scrollStoreCatalog()});
    storeCategorySignature=signature;
  }
  container.closest("section").hidden=!groups.length;
  container.querySelectorAll("button").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.storeCategory===$("#category").value)));
  $("#storeDepartmentLinks").querySelectorAll("button").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.department===$("#category").value)));
}
async function renderStoreShowcase(force=false){
  const active=getDB().products.filter(p=>p.active),available=active.filter(p=>p.stock>0),items=[...(available.length?available:active)].sort((a,b)=>Number(!!imageRef(b,"icon"))-Number(!!imageRef(a,"icon"))).slice(0,6),signature=JSON.stringify([storeCatalogState,items]);
  if(!force&&signature===storeShowcaseSignature)return;
  storeShowcaseSignature=signature;storeShowcaseIndex=((storeShowcaseIndex%Math.max(1,items.length))+items.length)%Math.max(1,items.length);
  const product=items[storeShowcaseIndex],container=$("#showcaseProduct");
  $("#storeShowcase").setAttribute("aria-busy",String(storeCatalogState==="loading"));
  $("#showcasePrev").disabled=items.length<2;$("#showcaseNext").disabled=items.length<2;
  $("#showcasePosition").textContent=items.length?`${String(storeShowcaseIndex+1).padStart(2,"0")} / ${String(items.length).padStart(2,"0")}`:"";
  container.innerHTML=product?`<div class="showcase-art">${storeProductVisual(product,"showcase-img")}</div><div class="showcase-product-info"><div><span>${escapeHTML(product.category)}</span><h2>${escapeHTML(product.name)}</h2><strong>${money(product.price)}</strong></div><button id="showcaseOpen" type="button" aria-label="Ver ${escapeHTML(product.name)}"><span aria-hidden="true">${storeArrowIcon()}</span></button></div>`:`<div class="showcase-art"><span class="store-art-wrap">${storeCategoryIcon("Productos")}<small>Catálogo de productos</small></span></div><div class="showcase-product-info"><div><span>Servicom Group</span><h2>Encuentra tu próximo equipo.</h2><p>Consulta productos, precios y disponibilidad.</p></div><a href="#catalogo" aria-label="Explorar catálogo">${storeArrowIcon()}</a></div>`;
  if(product)$("#showcaseOpen").onclick=()=>openProduct(product.id);
  await hydrateImages(container);
}
function renderStoreCatalogStatus(){
  const status=$("#storeCatalogStatus");status.replaceChildren();
  if(storeCatalogState!=="error")return;
  const text=document.createElement("span");text.textContent="No pudimos actualizar el catálogo. "+(getDB().products.length?"Mostramos la última información disponible.":"Vuelve a intentarlo en un momento.");
  const retry=document.createElement("button");retry.type="button";retry.textContent="Volver a intentar";
  retry.onclick=async()=>{retry.disabled=true;retry.textContent="Actualizando…";await pollStore()};status.append(text,retry);
}
function renderStoreFilterChips(){
  const filters=storeFilterState(),chips=[];
  if(filters.search)chips.push({label:`Búsqueda: ${filters.search}`,clear:()=>{$("#search").value="";updateSearchClearVisibility()}});
  if(filters.category)chips.push({label:filters.category,clear:()=>{$("#category").value=""}});
  if(filters.inStock)chips.push({label:"Con stock",clear:()=>{$("#inStockOnly").checked=false}});
  if(filters.onlyFavorites)chips.push({label:"Favoritos",clear:()=>setOnlyFavorites(false)});
  const container=$("#storeActiveFilters");container.replaceChildren();
  for(const chip of chips){const button=document.createElement("button");button.type="button";button.textContent=chip.label+" ×";button.setAttribute("aria-label","Quitar filtro: "+chip.label);button.onclick=()=>{chip.clear();renderProducts()};container.append(button)}
  $("#clearCatalogFilters").hidden=!chips.length&&!filters.sort;
}
function setStoreCatalogView(view){
  storeCatalogView=view==="list"?"list":"grid";
  $("#productsGrid").classList.toggle("store-list-view",storeCatalogView==="list");
  $("#catalogGridView").setAttribute("aria-pressed",String(storeCatalogView==="grid"));$("#catalogListView").setAttribute("aria-pressed",String(storeCatalogView==="list"));
  try{localStorage.setItem("servicom_catalog_view",storeCatalogView)}catch{}
}
function renderStorePresentation(list){
  const total=getDB().products.filter(p=>p.active).length;
  $("#storeResultCount").textContent=storeCatalogState==="loading"?"Cargando catálogo…":`${list.length} ${list.length===1?"producto":"productos"}${list.length!==total?` de ${total}`:""}`;
  if(document.activeElement!==$("#headerSearch"))$("#headerSearch").value=$("#search").value;
  $("#productsGrid").setAttribute("aria-busy",String(storeCatalogState==="loading"));
  $("#onlyFavBtn").setAttribute("aria-pressed",String(onlyFavorites));
  renderStoreCategories();renderStoreShowcase();renderStoreFilterChips();renderStoreCatalogStatus();setStoreCatalogView(storeCatalogView);
}
function initStorePresentation(){
  $("#storeHeaderSearch").onsubmit=event=>{
    event.preventDefault();
    $("#search").value=$("#headerSearch").value.trim();$("#category").value="";$("#sortBy").value="";$("#inStockOnly").checked=false;setOnlyFavorites(false);
    updateSearchClearVisibility();renderProducts();scrollStoreCatalog();$("#search").focus({preventScroll:true});
  };
  document.querySelectorAll("[data-open-orders]").forEach(button=>button.onclick=openOrders);
  $(".store-all-products").onclick=resetFilters;
  $("#showcasePrev").onclick=()=>{storeShowcaseIndex--;renderStoreShowcase(true)};$("#showcaseNext").onclick=()=>{storeShowcaseIndex++;renderStoreShowcase(true)};
  $("#inStockOnly").onchange=renderProducts;$("#clearCatalogFilters").onclick=resetFilters;
  $("#catalogGridView").onclick=()=>setStoreCatalogView("grid");$("#catalogListView").onclick=()=>setStoreCatalogView("list");
  $("#storeHowCart").onclick=openCart;$("#storeHowOrders").onclick=openOrders;
  document.querySelectorAll("[data-open-support]").forEach(button=>button.onclick=()=>{const panel=$("#supportPanel");if(panel.hidden)$("#supportToggle").click();else $("#supportInput").focus()});
  document.querySelectorAll("[data-shipping-threshold]").forEach(element=>element.textContent=money(FREE_SHIPPING_THRESHOLD));
  setStoreCatalogView(storeCatalogView);
}
