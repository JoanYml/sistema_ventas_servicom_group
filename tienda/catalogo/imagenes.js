function imageRef(p,mode="detail"){
  if(mode==="icon")return p.iconImageRef||p.iconImage||p.imageRef||p.image||null;
  return p.imageRef||p.image||p.iconImageRef||p.iconImage||null;
}
async function resolveImageRef(ref){
  if(typeof ref!=="string"||!ref||ref.startsWith("imgdb:"))return null;
  return ref;
}
function productImage(p,cls="",mode="detail"){
  const ref=imageRef(p,mode);
  return ref?`<img class="${cls}" data-image-ref="${escapeHTML(ref)}" alt="${escapeHTML(p.name)}" loading="lazy" decoding="async">`:escapeHTML(p.icon||"📦");
}
async function hydrateImages(root=document){
  const imgs=[...root.querySelectorAll("img[data-image-ref]")];
  await Promise.all(imgs.map(async img=>{
    const fallback=()=>{const placeholder=document.createElement("span");placeholder.className="store-art-wrap";placeholder.innerHTML=storeCategoryIcon(img.alt||"Productos")+'<small>Imagen no disponible</small>';img.replaceWith(placeholder)};
    img.onerror=fallback;
    try{const src=await resolveImageRef(img.dataset.imageRef);if(src)img.src=src;else fallback();}
    catch(err){console.warn("No se pudo cargar una imagen:",err);fallback();}
  }));
}
