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
function storeDeviceArt(product){
  const type=storeCategoryType(`${product.category||""} ${product.name||""}`);
  const screen='<rect class="device-screen" x="55" y="42" width="210" height="125" rx="6"/><path class="device-wave" d="M55 135c35-58 51 36 104-18s65 4 106-50v100H55Z"/><rect class="device-window" x="78" y="63" width="91" height="60" rx="7"/><path class="device-line" d="M91 79h38M91 91h61M91 103h49"/><circle class="device-accent" cx="227" cy="75" r="18"/>';
  const shapes={
    mouse:'<path class="device-frame" d="M94 112c0-44 27-74 66-74s66 30 66 74v52c0 40-26 64-66 64s-66-24-66-64Z"/><path class="device-screen" d="M105 111c0-39 22-62 55-62s55 23 55 62v20H105Z"/><path class="device-line" d="M160 50v81M105 132h110"/><rect class="device-accent" x="153" y="67" width="14" height="31" rx="7"/>',
    camera:'<path class="device-base" d="M140 150h40v41l35 19H105l35-19Z"/><rect class="device-frame" x="43" y="57" width="234" height="101" rx="37"/><rect class="device-screen" x="56" y="70" width="208" height="75" rx="28"/><circle class="device-frame" cx="160" cy="107" r="38"/><circle class="device-accent" cx="160" cy="107" r="24"/><circle class="device-screen" cx="160" cy="107" r="11"/><path class="device-line" d="M78 96v23M242 96v23"/>',
    printer:'<rect class="device-base" x="85" y="31" width="150" height="106" rx="6"/><path class="device-window" d="M98 43h124v83H98Z"/><rect class="device-frame" x="43" y="103" width="234" height="103" rx="14"/><path class="device-screen" d="M43 130h234v49H43Z"/><rect class="device-window" x="93" y="159" width="134" height="76" rx="3"/><path class="device-line" d="M110 178h99M110 192h99M110 206h61"/><circle class="device-accent" cx="250" cy="119" r="4"/>',
    laptop:`<rect class="device-frame" x="44" y="30" width="232" height="151" rx="12"/>${screen}<path class="device-base" d="M44 181h232l29 27c3 4 0 9-7 9H22c-7 0-10-5-7-9l29-27Z"/><path class="device-edge" d="M16 211h288"/><path class="device-trackpad" d="M125 188h70l8 16h-86Z"/>`,
    monitor:`<rect class="device-frame" x="34" y="20" width="252" height="166" rx="13"/><g transform="translate(-4 -12) scale(1.025)">${screen}</g><path class="device-base" d="M145 186h30v25l34 9H111l34-9Z"/><circle class="device-accent" cx="160" cy="178" r="2"/>`,
    audio:'<path class="device-headband" d="M83 131V98a77 77 0 0 1 154 0v33"/><path class="device-headband-inner" d="M96 127V99a64 64 0 0 1 128 0v28"/><rect class="device-frame" x="62" y="109" width="55" height="91" rx="23"/><rect class="device-frame" x="203" y="109" width="55" height="91" rx="23"/><rect class="device-screen" x="73" y="118" width="33" height="73" rx="16"/><rect class="device-screen" x="214" y="118" width="33" height="73" rx="16"/><path class="device-line" d="M87 141v23M230 141v23"/>',
    keyboard:'<path class="device-frame" d="M45 67h230l27 122H18Z"/><path class="device-base" d="M18 189h284v16H18Z"/><g class="device-keys">'+Array.from({length:30},(_,i)=>`<rect x="${48+(i%10)*23}" y="${83+Math.floor(i/10)*27}" width="17" height="17" rx="3"/>`).join('')+'<rect x="91" y="167" width="130" height="14" rx="4"/></g>',
    network:'<path class="device-antenna" d="m83 138-9-94m163 94 9-115"/><rect class="device-frame" x="47" y="135" width="226" height="64" rx="14"/><path class="device-screen" d="M47 151h226v32H47Z"/><g class="device-accent"><circle cx="76" cy="166" r="4"/><circle cx="96" cy="166" r="4"/><circle cx="116" cy="166" r="4"/></g><path class="device-signal" d="M124 72a51 51 0 0 1 72 0m-59 13a32 32 0 0 1 46 0m-32 14a13 13 0 0 1 18 0"/>',
    storage:'<rect class="device-frame" x="81" y="19" width="158" height="198" rx="21"/><rect class="device-screen" x="93" y="33" width="134" height="164" rx="13"/><circle class="device-window" cx="160" cy="98" r="43"/><circle class="device-accent" cx="160" cy="98" r="13"/><path class="device-line" d="M119 163h82M119 177h54"/><circle class="device-accent" cx="160" cy="207" r="3"/>',
    box:'<path class="device-frame" d="m160 28 104 56v105l-104 47-104-47V84Z"/><path class="device-screen" d="m57 84 103 50v101L57 189Z"/><path class="device-base" d="m160 134 104-50v105l-104 47Z"/><path class="device-line" d="m109 57 102 52v42M160 134v101"/>'
  };
  return `<svg class="store-device-art device-${type}" viewBox="0 0 320 250" aria-hidden="true" focusable="false"><ellipse class="device-shadow" cx="160" cy="228" rx="124" ry="10"/>${shapes[type]}</svg>`;
}
function storeProductVisual(product,className="product-img"){
  return imageRef(product,"icon")?productImage(product,className,"icon"):`<span class="store-art-wrap">${storeDeviceArt(product)}<small>Ilustración referencial</small></span>`;
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
    storeCategorySignature=signature;
  }
  container.closest("section").hidden=!groups.length;
  container.querySelectorAll("button").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.storeCategory===$("#category").value)));
}
async function renderStoreShowcase(force=false){
  const active=getDB().products.filter(p=>p.active),available=active.filter(p=>p.stock>0),items=(available.length?available:active).slice(0,6),signature=JSON.stringify([storeCatalogState,items]);
  if(!force&&signature===storeShowcaseSignature)return;
  storeShowcaseSignature=signature;storeShowcaseIndex=((storeShowcaseIndex%Math.max(1,items.length))+items.length)%Math.max(1,items.length);
  const product=items[storeShowcaseIndex],container=$("#showcaseProduct");
  $("#storeShowcase").setAttribute("aria-busy",String(storeCatalogState==="loading"));
  $("#showcasePrev").disabled=items.length<2;$("#showcaseNext").disabled=items.length<2;
  $("#showcasePosition").textContent=items.length?`${String(storeShowcaseIndex+1).padStart(2,"0")} / ${String(items.length).padStart(2,"0")}`:"";
  container.innerHTML=product?`<div class="showcase-art">${storeProductVisual(product,"showcase-img")}</div><div class="showcase-product-info"><div><span>${escapeHTML(product.category)}</span><h2>${escapeHTML(product.name)}</h2><strong>${money(product.price)}</strong></div><button id="showcaseOpen" type="button" aria-label="Ver ${escapeHTML(product.name)}"><span aria-hidden="true">${storeArrowIcon()}</span></button></div>`:`<div class="showcase-art">${storeDeviceArt({category:"Laptops"})}</div><div class="showcase-product-info"><div><span>INSPIRA TU PRÓXIMO PROYECTO</span><h2>Tu espacio, con más posibilidades.</h2><p>Explora nuestros productos en el catálogo.</p></div><a href="#catalogo" aria-label="Explorar catálogo">${storeArrowIcon()}</a></div>`;
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
  $("#storeResultCount").textContent=storeCatalogState==="loading"?"Preparando catálogo…":`${list.length} ${list.length===1?"producto":"productos"}${list.length!==total?` de ${total}`:""} para explorar`;
  $("#productsGrid").setAttribute("aria-busy",String(storeCatalogState==="loading"));
  $("#onlyFavBtn").setAttribute("aria-pressed",String(onlyFavorites));
  renderStoreCategories();renderStoreShowcase();renderStoreFilterChips();renderStoreCatalogStatus();setStoreCatalogView(storeCatalogView);
}
function initStorePresentation(){
  $("#showcasePrev").onclick=()=>{storeShowcaseIndex--;renderStoreShowcase(true)};$("#showcaseNext").onclick=()=>{storeShowcaseIndex++;renderStoreShowcase(true)};
  $("#inStockOnly").onchange=renderProducts;$("#clearCatalogFilters").onclick=resetFilters;
  $("#catalogGridView").onclick=()=>setStoreCatalogView("grid");$("#catalogListView").onclick=()=>setStoreCatalogView("list");
  $("#storeHowCart").onclick=openCart;$("#storeHowOrders").onclick=openOrders;
  document.querySelectorAll("[data-open-support]").forEach(button=>button.onclick=()=>{const panel=$("#supportPanel");if(panel.hidden)$("#supportToggle").click();else $("#supportInput").focus()});
  document.querySelectorAll("[data-shipping-threshold]").forEach(element=>element.textContent=money(FREE_SHIPPING_THRESHOLD));
  setStoreCatalogView(storeCatalogView);
}
