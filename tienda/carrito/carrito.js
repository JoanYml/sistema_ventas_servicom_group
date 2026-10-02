const FREE_SHIPPING_THRESHOLD=150;
function saveCart(){
  syncCartWithCatalog();
  localStorage.setItem("servicom_cart",JSON.stringify(cart));
  renderCart();
  updateCount();
}
function updateCount(){
  syncCartWithCatalog();
  $("#cartCount").textContent=cart.reduce((a,x)=>a+x.qty,0);
}
function addToCart(id,qty=1,silent=false){
  const p=getDB().products.find(x=>x.id===id);if(!p||p.stock<1)return toast("Producto sin stock");
  const item=cart.find(x=>x.id===id);
  const newQty=(item?item.qty:0)+qty;
  if(newQty>p.stock)return toast(`Solo quedan ${p.stock} unidades`);
  if(item){item.qty=newQty;item.lastPrice=Number(p.price);item.lastStock=Number(p.stock)}
  else cart.push({id,qty,lastPrice:Number(p.price),lastStock:Number(p.stock)});
  saveCart();
  if(!silent)toast("Producto agregado al carrito","Ver carrito",openCart);
}
function quickAdd(id){addToCart(id,1)}
function changeQty(id,d){syncCartWithCatalog();const p=getDB().products.find(x=>x.id===id),i=cart.findIndex(x=>x.id===id);if(i<0||!p||p.stock<=0){saveCart();return;}cart[i].qty+=d;if(cart[i].qty>p.stock)cart[i].qty=p.stock;if(cart[i].qty<=0)cart.splice(i,1);saveCart()}
function removeFromCart(id){
  const index=cart.findIndex(x=>x.id===id);
  if(index<0)return;
  const db=getDB();
  const product=db.products.find(x=>x.id===id);
  const name=product?product.name:"Producto";
  cart.splice(index,1);
  saveCart();
  toast(`${name} eliminado del carrito`);
}
function clearCart(){
  if(!cart.length)return toast("Tu carrito ya está vacío");
  if(!confirm("¿Vaciar todo el carrito?"))return;
  cart=[];
  saveCart();
  toast("Carrito vaciado");
}
function renderShippingProgress(total){
  const box=$("#shippingProgress");
  if(!box)return;
  if(!cart.length){box.classList.add("hidden");return}
  box.classList.remove("hidden");
  if(total>=FREE_SHIPPING_THRESHOLD){
    box.classList.add("done");
    box.innerHTML=`<p class="shipping-msg">🚚 ¡Tu pedido califica para envío prioritario gratis!</p><div class="shipping-bar"><div class="shipping-fill" style="width:100%"></div></div>`;
  }else{
    box.classList.remove("done");
    const pct=Math.max(4,Math.min(100,Math.round((total/FREE_SHIPPING_THRESHOLD)*100)));
    box.innerHTML=`<p class="shipping-msg">🚚 Agrega ${money(FREE_SHIPPING_THRESHOLD-total)} más para envío prioritario gratis</p><div class="shipping-bar"><div class="shipping-fill" style="width:${pct}%"></div></div>`;
  }
}
async function renderCart(){
  const db=getDB();let total=0,qty=0;
  if(!cart.length)$("#cartItems").innerHTML='<div class="empty"><span class="empty-icon">🛒</span>Tu carrito está vacío.<br>Agrega productos desde el catálogo.<button class="secondary-btn" type="button" onclick="closeCart();document.getElementById(\'catalogo\').scrollIntoView({behavior:\'smooth\'})">Ir al catálogo</button></div>';
  else $("#cartItems").innerHTML=cart.map(i=>{const p=db.products.find(x=>x.id===i.id);if(!p)return"";total+=p.price*i.qty;qty+=i.qty;return `<div class="cart-item"><div class="cart-thumb">${productImage(p,"cart-img")}</div><div class="cart-product-info"><h4>${p.name}</h4><small>${money(p.price)} c/u</small><div class="qty"><button onclick="changeQty(${p.id},-1)">−</button><b>${i.qty}</b><button onclick="changeQty(${p.id},1)">+</button></div></div><div class="cart-item-actions"><button class="remove-cart-btn" onclick="removeFromCart(${p.id})" title="Quitar del carrito" aria-label="Quitar ${p.name} del carrito">🗑</button><strong>${money(p.price*i.qty)}</strong></div></div>`}).join("");
  $("#cartTotal").textContent=money(total);
  $("#cartSummary").textContent=`${qty} producto${qty===1?"":"s"}`;
  renderShippingProgress(total);
  await hydrateImages($("#cartItems"))
}
function totalCart(){syncCartWithCatalog();const db=getDB();return cart.reduce((s,i)=>{const p=db.products.find(x=>x.id===i.id);return s+(p?p.price*Math.min(i.qty,p.stock):0)},0)}
function openCart(){syncCartWithCatalog();renderCart();updateCount();$("#drawerBackdrop").classList.remove("hidden");$("#cartDrawer").classList.add("open")}
function closeCart(){$("#drawerBackdrop").classList.add("hidden");$("#cartDrawer").classList.remove("open")}
