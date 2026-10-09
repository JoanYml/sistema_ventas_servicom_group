function normalizeText(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
function stockBadgeHTML(stock){if(stock===0)return '<span class="stock-pill out">Agotado</span>';if(stock<=LOW_STOCK_LIMIT)return '<span class="stock-pill">Bajo</span>';return ""}
function productRowHTML(p){return `<tr><td><b>${p.icon||"📦"} ${escapeHTML(p.name)}</b></td><td><span class="category-count">${escapeHTML(p.category)}</span></td><td><input type="number" step=".01" min="0" value="${p.price}" onchange="updateProduct(${p.id},'price',this.value)"></td><td><div class="stock-cell"><input type="number" min="0" value="${p.stock}" onchange="updateProduct(${p.id},'stock',this.value)">${stockBadgeHTML(p.stock)}</div></td><td><input type="checkbox" ${p.active?"checked":""} onchange="updateProduct(${p.id},'active',this.checked)"></td><td><div class="row-actions"><button class="mini-btn" onclick="editProduct(${p.id})">Editar</button><button class="mini-btn" onclick="deleteProduct(${p.id})">Eliminar</button></div></td></tr>`}
function loadFilterCategories(){const select=$("#filterCategory"),current=select.value||"all",cats=getCategories();select.innerHTML='<option value="all">Todas</option>'+cats.map(c=>`<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join("");select.value=cats.includes(current)?current:"all"}
function getFilteredProducts(){const term=normalizeText($("#filterName").value),cat=$("#filterCategory").value,stock=$("#filterStock").value;return [...getDB().products].filter(p=>(!term||normalizeText(p.name).includes(term))&&(cat==="all"||p.category===cat)&&(stock==="all"||(stock==="low"?p.stock<=LOW_STOCK_LIMIT:p.stock>LOW_STOCK_LIMIT))).sort((a,b)=>a.name.localeCompare(b.name,"es"))}
function renderProductsTable(){loadFilterCategories();const total=getDB().products.length,list=getFilteredProducts();$("#productsCount").textContent=total?`Mostrando ${list.length} de ${total} ${total===1?"producto":"productos"}`:"";$("#productsTable").innerHTML=list.length?list.map(productRowHTML).join(""):`<tr><td colspan="6" class="empty-note">${total?"Ningún producto coincide con los filtros.":"No hay productos registrados."}</td></tr>`}
function clearProductFilters(){$("#filterName").value="";$("#filterCategory").value="all";$("#filterStock").value="all";renderProductsTable()}
$("#filterName").oninput=renderProductsTable;$("#filterCategory").onchange=renderProductsTable;$("#filterStock").onchange=renderProductsTable;$("#clearFilters").onclick=clearProductFilters;
async function updateProduct(id,k,v){
  const p=getDB().products.find(x=>x.id===id);if(!p)return;
  let value=v;
  if(k!=="active"){value=Number(v);if(!Number.isFinite(value)||value<0){render();return toast("Ingresa un valor válido")}}
  try{await apiPatchProduct(id,{[k]:value});await refreshDB();render();toast("Producto actualizado")}
  catch(err){console.error(err);await refreshDB().catch(()=>{});render();toast(err.message||"No se pudo actualizar")}
}
async function deleteProduct(id){
  if(!confirm("¿Eliminar producto?"))return;
  try{await apiDeleteProduct(id);await refreshDB();render();toast("Producto eliminado")}
  catch(err){console.error(err);toast(err.message||"No se pudo eliminar")}
}
