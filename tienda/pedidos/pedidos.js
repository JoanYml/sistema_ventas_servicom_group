function reorder(orderId){
  const db=getDB();
  const order=db.orders.find(o=>o.id===orderId);
  if(!order)return;
  let added=0,adjusted=0;
  order.items.forEach(i=>{
    const p=db.products.find(x=>x.id===i.id);
    if(!p||!p.active||p.stock<1)return;
    const existing=cart.find(c=>c.id===i.id);
    const currentQty=existing?existing.qty:0;
    const room=Math.max(0,p.stock-currentQty);
    if(room<=0)return;
    const addQty=Math.min(i.qty,room);
    if(addQty<i.qty)adjusted++;
    if(existing){existing.qty+=addQty;existing.lastPrice=Number(p.price);existing.lastStock=Number(p.stock)}
    else cart.push({id:i.id,qty:addQty,lastPrice:Number(p.price),lastStock:Number(p.stock)});
    added++;
  });
  saveCart();
  if(added)toast(adjusted?"Se agregaron al carrito (algunas cantidades se ajustaron por stock)":"Pedido agregado nuevamente al carrito","Ver carrito",openCart);
  else toast("Los productos de ese pedido ya no están disponibles");
}
async function openOrders(){try{await refreshDB()}catch(err){console.warn(err)}const db=getDB();$("#ordersList").innerHTML=db.orders.length?db.orders.map(o=>`<div class="order-card"><div class="order-head"><div><strong>${o.id}</strong><div class="order-detail">${new Date(o.date).toLocaleString("es-PE")} · ${escapeHTML(o.customer.name)}</div></div><b>${money(o.total)}</b></div><div class="status-timeline">${["Confirmado","Despachando","Enviando","Entregado"].map(s=>`<span class="${["Confirmado","Despachando","Enviando","Entregado"].indexOf(s)<=["Confirmado","Despachando","Enviando","Entregado"].indexOf(o.status)?"done":""}">${s}</span>`).join("")}</div><div class="order-detail" style="margin-top:10px">${o.items.map(i=>`${escapeHTML(i.name)} × ${i.qty}`).join(" · ")}</div><div class="order-actions"><button class="reorder-btn" type="button" onclick="reorder('${o.id}')">🔁 Comprar de nuevo</button></div></div>`).join(""):'<div class="empty"><span class="empty-icon">📦</span>Todavía no tienes pedidos.</div>';$("#ordersModal").classList.remove("hidden")}
function closeAll(){closeCart();document.querySelectorAll(".modal").forEach(m=>m.classList.add("hidden"))}
