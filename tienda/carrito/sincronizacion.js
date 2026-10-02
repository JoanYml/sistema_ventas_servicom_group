let cart=JSON.parse(localStorage.getItem("servicom_cart")||"[]");
let cartNotices=JSON.parse(sessionStorage.getItem("servicom_cart_notices")||"[]");
function addCartNotice(message,type="info"){
  const notice={message,type,time:new Date().toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"})};
  cartNotices.unshift(notice);
  cartNotices=cartNotices.slice(0,8);
  sessionStorage.setItem("servicom_cart_notices",JSON.stringify(cartNotices));
  renderCartNotices();
}
function renderCartNotices(){
  const box=$("#cartNotifications");
  if(!box)return;
  box.innerHTML=cartNotices.length
    ? cartNotices.map(n=>`<div class="cart-notice ${n.type}"><span>↻</span><div>${n.message}<small>${n.time}</small></div></div>`).join("")
    : "";
}
function syncCartWithCatalog(){
  const db=getDB();
  let changed=false;
  const nextCart=[];
  cart.forEach(item=>{
    const p=db.products.find(x=>x.id===item.id);
    if(!p || !p.active){
      changed=true;
      addCartNotice(`El producto que estaba en tu carrito ya no está disponible.`,"warning");
      return;
    }
    const previousPrice=Number(item.lastPrice);
    const previousStock=Number(item.lastStock);
    const hasSnapshot=Number.isFinite(previousPrice)&&Number.isFinite(previousStock);
    if(hasSnapshot && previousPrice!==Number(p.price)){
      addCartNotice(`El producto <b>${p.name}</b> cambió el precio de <b>${money(previousPrice)}</b> a <b>${money(p.price)}</b>.`,"price");
      changed=true;
    }
    if(hasSnapshot && previousStock!==Number(p.stock)){
      addCartNotice(`El producto <b>${p.name}</b> cambió el stock de <b>${previousStock}</b> a <b>${p.stock}</b>.`,"stock");
      changed=true;
    }
    if(Number(p.stock)<=0){
      changed=true;
      addCartNotice(`El producto <b>${p.name}</b> quedó sin stock y fue retirado del carrito.`,"warning");
      return;
    }
    const oldQty=Number(item.qty)||1;
    const newQty=Math.min(oldQty,Number(p.stock));
    if(oldQty!==newQty){
      changed=true;
      addCartNotice(`La cantidad de <b>${p.name}</b> se ajustó de <b>${oldQty}</b> a <b>${newQty}</b> por disponibilidad de stock.`,"warning");
    }
    nextCart.push({id:item.id,qty:newQty,lastPrice:Number(p.price),lastStock:Number(p.stock)});
  });
  cart=nextCart;
  const stored=JSON.stringify(JSON.parse(localStorage.getItem("servicom_cart")||"[]"));
  const current=JSON.stringify(cart);
  if(changed || current!==stored)localStorage.setItem("servicom_cart",current);
  renderCartNotices();
  return changed;
}
