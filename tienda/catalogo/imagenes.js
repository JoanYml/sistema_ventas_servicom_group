function imageRef(p,mode="detail"){
  if(mode==="icon")return p.iconImageRef||p.iconImage||p.imageRef||p.image||null;
  return p.imageRef||p.image||p.iconImageRef||p.iconImage||null;
}
async function resolveImageRef(ref){
  if(!ref)return null;
  if(typeof ref!=="string"||!ref.startsWith("imgdb:"))return ref;
  const blob=await getImageBlob(ref.slice(6));
  return blob?URL.createObjectURL(blob):null;
}
function productImage(p,cls="",mode="detail"){
  const ref=imageRef(p,mode);
  return ref?`<img class="${cls}" data-image-ref="${ref}" alt="${p.name}">`:(p.icon||"📦");
}
async function hydrateImages(root=document){
  const imgs=[...root.querySelectorAll("img[data-image-ref]")];
  await Promise.all(imgs.map(async img=>{
    try{const src=await resolveImageRef(img.dataset.imageRef);if(src)img.src=src;else img.replaceWith(document.createTextNode("📦"));}
    catch(err){console.warn("No se pudo cargar una imagen:",err);img.replaceWith(document.createTextNode("📦"));}
  }));
}
