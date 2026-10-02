const IMAGE_DB_NAME="servicom_group_images_v1";
const IMAGE_STORE="images";

function openImageDB(){
  return new Promise((resolve,reject)=>{
    if(!window.indexedDB)return reject(new Error("Este navegador no admite IndexedDB."));
    const request=indexedDB.open(IMAGE_DB_NAME,1);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains(IMAGE_STORE))request.result.createObjectStore(IMAGE_STORE);
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error("No se pudo abrir la base de imágenes."));
  });
}

async function saveImageBlob(key,blob){
  const db=await openImageDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(IMAGE_STORE,"readwrite");
    tx.objectStore(IMAGE_STORE).put(blob,key);
    tx.oncomplete=()=>{db.close();resolve(key)};
    tx.onerror=()=>{db.close();reject(tx.error||new Error("No se pudo guardar la imagen en la base de datos."))};
  });
}

async function getImageBlob(key){
  const db=await openImageDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(IMAGE_STORE,"readonly");
    const request=tx.objectStore(IMAGE_STORE).get(key);
    request.onsuccess=()=>{db.close();resolve(request.result||null)};
    request.onerror=()=>{db.close();reject(request.error||new Error("No se pudo leer la imagen."))};
  });
}

function dataURLToBlob(dataURL){
  const parts=dataURL.split(","),meta=parts[0]||"",data=parts[1]||"";
  const mime=(meta.match(/data:([^;]+)/)||[])[1]||"application/octet-stream";
  const binary=atob(data);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type:mime});
}

async function migrateImagesToIndexedDB(dbKey){
  let raw=localStorage.getItem(dbKey);
  if(!raw)return false;
  let db;
  try{db=JSON.parse(raw)}catch{return false}
  if(!db||!Array.isArray(db.products))return false;
  let changed=false;
  for(const product of db.products){
    const id=product.id;
    let productChanged=false;
    if(typeof product.iconImage==="string"&&product.iconImage.startsWith("data:")){
      const key=`${id}_icon`;
      await saveImageBlob(key,dataURLToBlob(product.iconImage));
      product.iconImageRef=`imgdb:${key}`;
      delete product.iconImage;
      productChanged=true;
    }
    if(Array.isArray(product.detailImages)){
      const refs=[];
      for(let i=0;i<product.detailImages.length;i++){
        const ref=product.detailImages[i];
        if(typeof ref==="string"&&ref.startsWith("data:")){
          const key=`${id}_detail_${i+1}`;
          await saveImageBlob(key,dataURLToBlob(ref));
          refs.push(`imgdb:${key}`);
          productChanged=true;
        }else if(ref)refs.push(ref);
      }
      if(productChanged||refs.length!==product.detailImages.length){
        product.detailImageRefs=refs;
        delete product.detailImages;
      }
    }
    if(typeof product.image==="string"&&product.image.startsWith("data:")){
      const key=`${id}_detail_1`;
      await saveImageBlob(key,dataURLToBlob(product.image));
      product.imageRef=`imgdb:${key}`;
      delete product.image;
      productChanged=true;
    }
    if(productChanged)changed=true;
  }
  if(changed){
    localStorage.setItem(dbKey,JSON.stringify(db));
    return true;
  }
  return false;
}
