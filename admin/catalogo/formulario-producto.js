$("#addProduct").onclick=()=>{$("#adminModal").classList.remove("hidden");loadProductCategories();resetImageForm()};
$("#productForm").onsubmit=async e=>{
  e.preventDefault();
  const form=e.target,f=new FormData(form),db=getDB(),name=String(f.get("name")||"").trim(),category=String(f.get("category")||"").trim(),price=Number(f.get("price")),stock=Number(f.get("stock")),description=String(f.get("description")||"").trim(),iconImageFile=f.get("iconImage");
  if(!name||!category||!Number.isFinite(price)||price<0||!Number.isFinite(stock)||stock<0)return toast("Completa correctamente nombre, categoría, precio y stock");
  const saveButton=form.querySelector('button[type="submit"]');
  if(saveButton){saveButton.disabled=true;saveButton.textContent="Guardando..."}
  try{
    await migrateImagesToIndexedDB(DB_KEY);
    if(iconImageFile&&iconImageFile.size>0)await validateImageDimensions(iconImageFile,ICON_WIDTH,ICON_HEIGHT);
    for(const file of detailImageFiles)await validateImageDimensions(file,DETAIL_WIDTH,DETAIL_HEIGHT);
    const id=Date.now();
    const iconImageRef=await saveProductImage(iconImageFile,id,"icon");
    const detailImageRefs=[];
    for(let i=0;i<detailImageFiles.length;i++)detailImageRefs.push(await saveProductImage(detailImageFiles[i],id,`detail-${i+1}`));
    db.products.push({id,name,category,price,stock,active:true,icon:"📦",iconImageRef,imageRef:detailImageRefs[0]||null,detailImageRefs,description});
    saveDB(db);
    resetImageForm();
    $("#adminModal").classList.add("hidden");
    render();
    toast("Producto creado correctamente");
  }catch(err){
    console.error(err);
    toast(`No se pudo crear el producto: ${err.message||"revisa las imágenes"}`);
  }finally{
    if(saveButton){saveButton.disabled=false;saveButton.textContent="Guardar producto"}
  }
};
