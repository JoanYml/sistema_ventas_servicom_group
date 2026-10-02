async function detailCarousel(p){
  const refs=Array.isArray(p.detailImageRefs)&&p.detailImageRefs.length?p.detailImageRefs.filter(Boolean):(Array.isArray(p.detailImages)&&p.detailImages.length?p.detailImages.filter(Boolean):(imageRef(p,"detail")?[imageRef(p,"detail")]:[]));
  const images=[];
  for(const ref of refs){const src=await resolveImageRef(ref);if(src)images.push(src)}
  if(!images.length)return `<div class="detail-image-placeholder">${p.icon||"📦"}</div>`;
  return `<div class="detail-carousel"><div class="detail-carousel-main"><img id="detailCarouselImage" class="detail-img" src="${images[0]}" alt="${p.name}">${images.length>1?`<button id="detailPrev" class="carousel-arrow prev" aria-label="Imagen anterior">‹</button><button id="detailNext" class="carousel-arrow next" aria-label="Siguiente imagen">›</button>`:""}</div>${images.length>1?`<div class="carousel-dots">${images.map((_,i)=>`<button type="button" class="carousel-dot ${i===0?"active":""}" data-index="${i}" aria-label="Ver imagen ${i+1}"></button>`).join("")}</div>`:""}</div>`;
}
async function openProduct(id){
  const p=getDB().products.find(x=>x.id===id);if(!p)return;
  trackRecent(id);
  const fav=isFavorite(p.id);
  $("#productDetail").innerHTML=`<div class="detail-layout"><div class="detail-image">${await detailCarousel(p)}</div><div class="detail-info"><button type="button" class="fav-btn ${fav?"active":""}" id="detailFavBtn" data-id="${p.id}" onclick="toggleFavorite(${p.id})">${fav?"♥ Guardado en favoritos":"♡ Guardar en favoritos"}</button><span class="tag">${p.category}</span><h2>${p.name}</h2><p class="description">${p.description}</p><div class="detail-price">${money(p.price)}</div><p class="stock ${p.stock<10?"low":""}">${p.stock} unidades disponibles</p><div class="quantity-box"><button id="minusQty">−</button><input id="productQty" type="number" min="1" max="${p.stock}" value="1"><button id="plusQty">+</button></div><div class="detail-actions"><button id="addDetail" class="primary-btn full" ${p.stock<1?"disabled":""}>Agregar al carrito</button><button id="buyNowDetail" class="secondary-btn full" ${p.stock<1?"disabled":""}>Comprar ahora</button></div></div></div>`;
  $("#productModal").classList.remove("hidden");
  let current=0;
  const images=[];
  {
    const refs=Array.isArray(p.detailImageRefs)&&p.detailImageRefs.length?p.detailImageRefs.filter(Boolean):(Array.isArray(p.detailImages)&&p.detailImages.length?p.detailImages.filter(Boolean):(imageRef(p,"detail")?[imageRef(p,"detail")]:[]));
    for(const ref of refs){const src=await resolveImageRef(ref);if(src)images.push(src)}
  }
  const showImage=index=>{if(!images.length)return;current=(index+images.length)%images.length;const image=$("#detailCarouselImage");if(image)image.src=images[current];document.querySelectorAll(".carousel-dot").forEach((dot,i)=>dot.classList.toggle("active",i===current));};
  if(images.length>1){$("#detailPrev").onclick=()=>showImage(current-1);$("#detailNext").onclick=()=>showImage(current+1);document.querySelectorAll(".carousel-dot").forEach(dot=>dot.onclick=()=>showImage(Number(dot.dataset.index)));}
  const input=$("#productQty");
  $("#minusQty").onclick=()=>input.value=Math.max(1,Number(input.value)-1);
  $("#plusQty").onclick=()=>input.value=Math.min(p.stock,Number(input.value)+1);
  $("#addDetail").onclick=()=>{const qty=Math.max(1,Math.min(p.stock,Number(input.value)||1));addToCart(p.id,qty);$("#productModal").classList.add("hidden");openCart()};
  $("#buyNowDetail").onclick=()=>{const qty=Math.max(1,Math.min(p.stock,Number(input.value)||1));addToCart(p.id,qty,true);$("#productModal").classList.add("hidden");checkout()};
}
