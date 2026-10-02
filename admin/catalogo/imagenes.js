const ICON_WIDTH=600, ICON_HEIGHT=400;
const DETAIL_WIDTH=800, DETAIL_HEIGHT=1200;
let detailImageFiles=[];
async function saveProductImage(file,id,suffix=""){
  if(!file)return null;
  const key=`${id}_${suffix||"image"}`;
  await saveImageBlob(key,file);
  return `imgdb:${key}`;
}
function validateImageDimensions(file,width,height){return new Promise((resolve,reject)=>{if(!file)return resolve(true);const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{const ok=img.naturalWidth===width&&img.naturalHeight===height;URL.revokeObjectURL(url);if(ok)resolve(true);else reject(new Error(`La imagen debe medir exactamente ${width} × ${height} px.`))};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("El archivo seleccionado no es una imagen válida."))};img.src=url})}
function resetImageForm(){detailImageFiles=[];$("#productForm").reset();$("#iconFileName").textContent="Ningún archivo seleccionado";$("#detailFileName").textContent="Ninguna imagen seleccionada";$("#iconImagePreview").innerHTML="";$("#detailImagesPreview").innerHTML="";$("#productIconImage").value="";$("#productImages").value=""}
function previewCard(src,name,onRemove,kind){const card=document.createElement("div");card.className=`image-preview-card ${kind}`;card.innerHTML=`<div class="image-preview-frame"><img src="${src}" alt="Vista previa"><button type="button" class="image-remove-btn" aria-label="Quitar imagen" title="Quitar imagen">×</button></div><small title="${name}">${name}</small>`;card.querySelector(".image-remove-btn").onclick=onRemove;return card}
async function handleIconSelection(){const input=$("#productIconImage"),file=input.files[0];if(!file)return;try{await validateImageDimensions(file,ICON_WIDTH,ICON_HEIGHT);$("#iconFileName").textContent=file.name;const src=URL.createObjectURL(file);$("#iconImagePreview").innerHTML="";$("#iconImagePreview").appendChild(previewCard(src,file.name,()=>{input.value="";$("#iconFileName").textContent="Ningún archivo seleccionado";$("#iconImagePreview").innerHTML=""},"icon"))}catch(err){input.value="";$("#iconFileName").textContent="Ningún archivo seleccionado";$("#iconImagePreview").innerHTML="";toast(`Icono rechazado: ${err.message}`)}}
async function handleDetailSelection(){const input=$("#productImages");const files=[...input.files];if(!files.length)return;const valid=[];for(const file of files){try{await validateImageDimensions(file,DETAIL_WIDTH,DETAIL_HEIGHT);valid.push(file)}catch(err){toast(`Imagen "${file.name}" rechazada: ${err.message}`)}}detailImageFiles=[...detailImageFiles,...valid.filter(file=>!detailImageFiles.some(old=>old.name===file.name&&old.size===file.size))];input.value="";$("#detailFileName").textContent=detailImageFiles.length?`${detailImageFiles.length} imagen${detailImageFiles.length===1?"":"es"} seleccionada${detailImageFiles.length===1?"":"s"}`:"Ninguna imagen seleccionada";renderDetailPreviews()}
function renderDetailPreviews(){const box=$("#detailImagesPreview");box.innerHTML="";detailImageFiles.forEach((file,index)=>{const src=URL.createObjectURL(file);box.appendChild(previewCard(src,file.name,()=>{detailImageFiles.splice(index,1);$("#detailFileName").textContent=detailImageFiles.length?`${detailImageFiles.length} imágenes seleccionadas`:"Ninguna imagen seleccionada";renderDetailPreviews()},"detail"))})}
$("#productIconImage").onchange=handleIconSelection;
$("#productImages").onchange=handleDetailSelection;
document.querySelectorAll(".file-button").forEach(button=>button.addEventListener("click",()=>button.parentElement.querySelector('input[type="file"]').click()));
