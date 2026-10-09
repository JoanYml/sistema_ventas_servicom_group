let editingProductId=null;
function setProductFormMode(editing){
  $("#productModalTitle").textContent=editing?"Editar producto":"Nuevo producto tecnológico";
  $("#saveProductBtn").textContent=editing?"Guardar cambios":"Guardar producto";
  $("#editImagesNote").classList.toggle("hidden",!editing);
}
function openProductModal(){$("#adminModal").classList.remove("hidden")}
$("#addProduct").onclick=()=>{editingProductId=null;resetImageForm();setProductFormMode(false);loadProductCategories();openProductModal()};
function editProduct(id){
  const p=getDB().products.find(x=>x.id===id);
  if(!p)return toast("El producto ya no existe");
  editingProductId=id;
  resetImageForm();
  setProductFormMode(true);
  loadProductCategories(p.category);
  const form=$("#productForm");
  form.elements.name.value=p.name;
  form.elements.price.value=p.price;
  form.elements.stock.value=p.stock;
  form.elements.description.value=p.description||"";
  openProductModal();
}
$("#productForm").onsubmit=async e=>{
  e.preventDefault();
  const form=e.target,f=new FormData(form),editing=editingProductId!==null,name=String(f.get("name")||"").trim(),category=String(f.get("category")||"").trim(),price=Number(f.get("price")),stock=Number(f.get("stock")),description=String(f.get("description")||"").trim(),iconImageFile=f.get("iconImage");
  if(!name||!category||!Number.isFinite(price)||price<0||!Number.isFinite(stock)||stock<0)return toast("Completa correctamente nombre, categoría, precio y stock");
  const saveButton=$("#saveProductBtn");
  saveButton.disabled=true;saveButton.textContent="Guardando...";
  try{
    await migrateImagesToIndexedDB(DB_KEY);
    const hasNewIcon=!!(iconImageFile&&iconImageFile.size>0);
    if(hasNewIcon)await validateImageDimensions(iconImageFile,ICON_WIDTH,ICON_HEIGHT);
    for(const file of detailImageFiles)await validateImageDimensions(file,DETAIL_WIDTH,DETAIL_HEIGHT);
    const db=getDB();
    if(editing){
      const p=db.products.find(x=>x.id===editingProductId);
      if(!p)throw new Error("El producto ya no existe");
      Object.assign(p,{name,category,price,stock,description});
      if(hasNewIcon)p.iconImageRef=await saveProductImage(iconImageFile,p.id,"icon");
      if(detailImageFiles.length){
        const refs=[];
        for(let i=0;i<detailImageFiles.length;i++)refs.push(await saveProductImage(detailImageFiles[i],p.id,`detail-${i+1}`));
        p.detailImageRefs=refs;p.imageRef=refs[0]||null;
      }
    }else{
      const id=Date.now();
      const iconImageRef=await saveProductImage(iconImageFile,id,"icon");
      const detailImageRefs=[];
      for(let i=0;i<detailImageFiles.length;i++)detailImageRefs.push(await saveProductImage(detailImageFiles[i],id,`detail-${i+1}`));
      db.products.push({id,name,category,price,stock,active:true,icon:"📦",iconImageRef,imageRef:detailImageRefs[0]||null,detailImageRefs,description});
    }
    saveDB(db);
    resetImageForm();
    $("#adminModal").classList.add("hidden");
    editingProductId=null;
    render();
    toast(editing?"Producto actualizado correctamente":"Producto creado correctamente");
  }catch(err){
    console.error(err);
    toast(`No se pudo ${editing?"actualizar":"crear"} el producto: ${err.message||"revisa las imágenes"}`);
  }finally{
    saveButton.disabled=false;saveButton.textContent=editingProductId!==null?"Guardar cambios":"Guardar producto";
  }
};
