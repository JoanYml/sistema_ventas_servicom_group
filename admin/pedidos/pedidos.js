const ORDER_STATUSES=["Confirmado","Despachando","Enviando","Entregado"];
function renderOrdersTable(){const db=getDB();$("#ordersTable").innerHTML=db.orders.length?db.orders.map(o=>`<tr><td><b>${o.id}</b></td><td>${escapeHTML(o.customer.name)}<div class="order-detail">${escapeHTML(o.customer.dni)} · ${escapeHTML(o.customer.phone)}</div></td><td>${money(o.total)}</td><td>${new Date(o.date).toLocaleString("es-PE")}</td><td><select onchange="updateOrderStatus('${o.id}',this.value)">${ORDER_STATUSES.map(s=>`<option ${o.status===s?"selected":""}>${s}</option>`).join("")}</select></td><td><details><summary>Ver</summary><div class="order-detail">${o.items.map(i=>`${escapeHTML(i.name)} × ${i.qty}`).join("<br>")}<br><br>${escapeHTML(o.customer.email)}<br>${escapeHTML(o.customer.address)}</div></details></td></tr>`).join(""):'<tr><td colspan="6">No hay pedidos.</td></tr>'}
async function updateOrderStatus(id,s){
  try{await apiUpdateOrderStatus(id,s);await refreshDB();render();toast("Estado actualizado")}
  catch(err){console.error(err);await refreshDB().catch(()=>{});render();toast(err.message||"No se pudo actualizar el estado")}
}
function updateOrdersBadge(){const pending=getDB().orders.filter(o=>o.status!=="Entregado").length;$("#ordersBadge").textContent=pending||""}
