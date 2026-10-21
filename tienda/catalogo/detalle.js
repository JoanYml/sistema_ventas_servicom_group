async function detailCarousel(p){
  const refs=Array.isArray(p.detailImageRefs)&&p.detailImageRefs.length?p.detailImageRefs.filter(Boolean):(Array.isArray(p.detailImages)&&p.detailImages.length?p.detailImages.filter(Boolean):(imageRef(p,"detail")?[imageRef(p,"detail")]:[]));
  const images=[];
  for(const ref of refs){const src=await resolveImageRef(ref);if(src)images.push(src)}
  const placeholder=`<span class="store-art-wrap">${storeCategoryIcon(p.category||"Productos")}<small>Imagen no disponible</small></span>`;
  if(!images.length)return {images,html:`<div class="detail-image-placeholder">${placeholder}</div>`};
  return {images,html:`<div class="detail-carousel"><div class="detail-carousel-main"><img id="detailCarouselImage" class="detail-img" src="${escapeHTML(images[0])}" alt="${escapeHTML(p.name)}"><div id="detailGalleryError" class="detail-gallery-error" hidden>${placeholder}</div>${images.length>1?'<button type="button" id="detailPrev" class="carousel-arrow prev" aria-label="Imagen anterior">‹</button><button type="button" id="detailNext" class="carousel-arrow next" aria-label="Siguiente imagen">›</button>':""}</div><div class="detail-gallery-caption"><span>Imágenes del producto</span><span id="detailImageCount" aria-live="polite">1 / ${images.length}</span></div>${images.length>1?`<div class="detail-thumbnails" aria-label="Elegir imagen del producto">${images.map((src,i)=>`<button type="button" class="detail-thumbnail" data-index="${i}" aria-pressed="${i===0}" aria-label="Ver imagen ${i+1}"><img src="${escapeHTML(src)}" alt="" loading="lazy"><span class="detail-thumbnail-number" hidden>${i+1}</span></button>`).join("")}</div>`:""}</div>`};
}
function productInformationHTML(p,details){
  const rows=productSpecificationRows(details.specifications),attributes=rows.filter(row=>row.label),features=rows.filter(row=>!row.label);
  return `<div class="detail-information"><section class="detail-description"><h3>Descripción del producto</h3><p>${escapeHTML(details.description||"Consulta con nuestro equipo para obtener más información sobre este producto.")}</p></section><section class="detail-specifications"><h3>Características del producto</h3><dl class="detail-spec-table"><div><dt>Categoría</dt><dd>${escapeHTML(p.category||"Otros")}</dd></div><div><dt>Código del catálogo</dt><dd>SG-${escapeHTML(String(p.id).padStart(5,"0"))}</dd></div>${attributes.map(row=>`<div><dt>${escapeHTML(row.label)}</dt><dd>${escapeHTML(row.value)}</dd></div>`).join("")}</dl>${features.length?`<ul class="detail-feature-list">${features.map(row=>`<li>${escapeHTML(row.value)}</li>`).join("")}</ul>`:""}${rows.length?"":'<p class="detail-spec-note">Consulta con el equipo las especificaciones técnicas de este modelo antes de comprar.</p>'}</section></div>`;
}
let productDetailVersion=0;
async function openProduct(id){
  const p=getDB().products.find(x=>x.id===id);if(!p)return;
  const version=++productDetailVersion;
  trackRecent(id);
  const fav=isFavorite(p.id),details=splitProductDescription(p.description),gallery=await detailCarousel(p),out=p.stock<1;
  if(version!==productDetailVersion)return;
  $("#productDetail").innerHTML=`<div class="detail-heading"><span>Detalle del producto</span><span>SG-${escapeHTML(String(p.id).padStart(5,"0"))}</span><button class="close-btn modal-close" type="button" data-close="productModal" aria-label="Cerrar detalle del producto">×</button></div><div class="detail-layout"><div class="detail-image">${gallery.html}</div><div class="detail-info"><span class="tag">${escapeHTML(p.category||"Otros")}</span><h2 id="detailProductTitle" tabindex="-1">${escapeHTML(p.name)}</h2><button type="button" class="detail-favorite ${fav?"active":""}" id="detailFavBtn" data-id="${p.id}" aria-pressed="${fav}" onclick="toggleFavorite(${p.id})">${fav?"♥ Guardado en favoritos":"♡ Guardar en favoritos"}</button><p class="description">${escapeHTML(details.description||"Consulta las características y disponibilidad de este producto.")}</p><div class="detail-buybox"><span class="detail-price-label">Precio por unidad</span><div class="detail-price">${money(p.price)}</div><p class="stock ${out?"out":p.stock<10?"low":""}">${out?"Producto agotado":`${p.stock} unidades disponibles`}</p><label class="detail-quantity-label" for="productQty">Cantidad</label><div class="quantity-box"><button id="minusQty" type="button" aria-label="Reducir cantidad" ${out?"disabled":""}>−</button><input id="productQty" type="number" min="1" max="${Math.max(1,p.stock)}" step="1" value="1" ${out?"disabled":""}><button id="plusQty" type="button" aria-label="Aumentar cantidad" ${out?"disabled":""}>+</button></div><div class="detail-actions"><button id="addDetail" type="button" class="primary-btn full" ${out?"disabled":""}>${out?"Agotado":"Agregar al carrito"}</button><button id="buyNowDetail" type="button" class="secondary-btn full" ${out?"disabled":""}>Comprar ahora</button></div></div><div class="detail-service-notes"><p><b>¿Tienes dudas sobre este producto?</b><button id="detailAskTeam" type="button">Consultar con el equipo →</button></p><p>Confirma la cobertura, el plazo de entrega y las condiciones de garantía con un encargado.</p></div></div></div>${productInformationHTML(p,details)}`;
  $("#productModal").classList.remove("hidden");
  $("#productModal .product-modal").scrollTop=0;
  $("#detailProductTitle").focus({preventScroll:true});
  let current=0;
  const image=$("#detailCarouselImage"),error=$("#detailGalleryError");
  if(image){
    image.onerror=()=>{image.hidden=true;error.hidden=false};
    image.onload=()=>{image.hidden=false;error.hidden=true};
    if(image.complete&&!image.naturalWidth)image.onerror();
  }
  $("#productDetail").querySelectorAll(".detail-thumbnail").forEach(thumbnail=>{
    const preview=thumbnail.querySelector("img"),number=thumbnail.querySelector(".detail-thumbnail-number");
    preview.onerror=()=>{preview.hidden=true;number.hidden=false};
    if(preview.complete&&!preview.naturalWidth)preview.onerror();
  });
  const showImage=index=>{
    if(!gallery.images.length)return;
    current=(index+gallery.images.length)%gallery.images.length;
    image.hidden=false;error.hidden=true;image.src=gallery.images[current];
    $("#detailImageCount").textContent=`${current+1} / ${gallery.images.length}`;
    $("#productDetail").querySelectorAll(".detail-thumbnail").forEach((thumbnail,i)=>thumbnail.setAttribute("aria-pressed",String(i===current)));
  };
  if(gallery.images.length>1){$("#detailPrev").onclick=()=>showImage(current-1);$("#detailNext").onclick=()=>showImage(current+1);$("#productDetail").querySelectorAll(".detail-thumbnail").forEach(thumbnail=>thumbnail.onclick=()=>showImage(Number(thumbnail.dataset.index)))}
  const input=$("#productQty");
  const selectedQuantity=()=>{const qty=Math.max(1,Math.min(p.stock,Math.floor(Number(input.value)||1)));input.value=qty;return qty};
  input.onchange=()=>{if(!out)selectedQuantity()};
  $("#minusQty").onclick=()=>{input.value=Math.max(1,selectedQuantity()-1)};
  $("#plusQty").onclick=()=>{input.value=Math.min(p.stock,selectedQuantity()+1)};
  $("#addDetail").onclick=()=>{if(out)return;addToCart(p.id,selectedQuantity());$("#productModal").classList.add("hidden");openCart()};
  $("#buyNowDetail").onclick=()=>{if(out)return;addToCart(p.id,selectedQuantity(),true);$("#productModal").classList.add("hidden");checkout()};
  $("#detailAskTeam").onclick=()=>{
    $("#productModal").classList.add("hidden");if($("#supportPanel").hidden)$("#supportToggle").click();
    $("#supportInput").value=`Tengo una consulta sobre ${p.name} (SG-${String(p.id).padStart(5,"0")}). `;$("#supportInput").focus();
  };
}
