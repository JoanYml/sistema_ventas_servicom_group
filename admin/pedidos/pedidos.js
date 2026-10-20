let ordersPage=1;
let openOrderId=null;
let orderSaving=false;
let orderDetailTrigger=null;

function ordersDate(value){
  const date=new Date(value);
  return Number.isFinite(date.getTime())?date.toLocaleString("es-PE",{dateStyle:"medium",timeStyle:"short",timeZone:DASHBOARD_TIMEZONE}):"Fecha no disponible";
}
function orderStatusClass(status){const index=ORDER_STATUSES.indexOf(status);return index<0?"unknown":String(index)}
function orderStatusBadge(status){return `<span class="order-state order-state-${orderStatusClass(status)}"><i aria-hidden="true"></i>${escapeHTML(status)}</span>`}
function getOrderFilters(){return {search:$("#orderSearch").value,status:$("#orderStatusFilter").value,from:$("#orderDateFrom").value,to:$("#orderDateTo").value,sort:$("#orderSort").value}}
function renderOrdersSummary(){
  const s=summarizeAdminOrders(getDB().orders),selected=$("#orderStatusFilter").value;
  const cards=[{filter:"all",label:"Todos los pedidos",value:s.total,icon:"▤"},{filter:"pending",label:"Pendientes de entrega",value:s.pending,icon:"◷"},{filter:"Enviando",label:"En camino",value:s.shipping,icon:"→"},{filter:"Entregado",label:"Entregados",value:s.delivered,icon:"✓"}];
  $("#ordersSummary").innerHTML=cards.map((c,i)=>`<button type="button" class="order-summary-card summary-${i} ${selected===c.filter?"selected":""}" data-order-filter="${c.filter}" aria-pressed="${selected===c.filter}"><span class="order-summary-icon" aria-hidden="true">${c.icon}</span><span><small>${c.label}</small><strong>${c.value}</strong></span></button>`).join("");
  document.querySelectorAll("[data-order-filter]").forEach(button=>button.onclick=()=>{$("#orderStatusFilter").value=button.dataset.orderFilter;ordersPage=1;renderOrdersTable()});
}
function renderOrdersTable(){
  const db=getDB(),filters=getOrderFilters(),invalid=filters.from&&filters.to&&filters.from>filters.to;
  $("#orderDateError").classList.toggle("hidden",!invalid);
  $("#orderDateFrom").setAttribute("aria-invalid",String(!!invalid));
  $("#orderDateTo").setAttribute("aria-invalid",String(!!invalid));
  const filtered=filterAdminOrders(db.orders,filters),page=paginateAdminOrders(filtered,ordersPage,$("#ordersPageSize").value);
  ordersPage=page.page;
  renderOrdersSummary();
  $("#ordersCount").textContent=`${page.from}–${page.to} de ${filtered.length} pedidos · Total filtrado: ${money(filtered.reduce((n,o)=>n+dashboardNumber(o.total),0))}`;
  $("#ordersPageInfo").textContent=`Página ${page.page} de ${page.pages}`;
  $("#ordersPrev").disabled=page.page===1;$("#ordersNext").disabled=page.page===page.pages;
  $("#ordersExport").disabled=!filtered.length;
  $("#ordersTable").innerHTML=page.items.length?page.items.map(o=>{
    const customer=o.customer||{},units=(o.items||[]).reduce((n,i)=>n+dashboardNumber(i.qty),0);
    return `<tr><td><b class="order-id">${escapeHTML(o.id)}</b><span class="order-cell-secondary">${escapeHTML(ordersDate(o.date))}</span></td><td><b>${escapeHTML(customer.name||"Sin nombre")}</b><span class="order-cell-secondary">${escapeHTML(customer.email||customer.phone||"Sin contacto")}</span></td><td>${units} <span class="order-cell-secondary">${units===1?"unidad":"unidades"}</span></td><td class="order-amount">${money(o.total)}</td><td>${orderStatusBadge(o.status)}</td><td><button class="order-open-btn" type="button" data-order-open="${escapeHTML(o.id)}" aria-label="Ver pedido ${escapeHTML(o.id)}">Ver detalle →</button></td></tr>`;
  }).join(""):`<tr><td colspan="6"><div class="orders-empty"><span aria-hidden="true">▤</span><b>${invalid?"Revisa el rango de fechas":db.orders.length?"No encontramos pedidos":"Aún no hay pedidos"}</b><p>${invalid?"Corrige las fechas para consultar el listado.":db.orders.length?"Prueba con otros filtros o usa «Limpiar filtros».":"Las nuevas compras aparecerán aquí para que puedas gestionarlas."}</p></div></td></tr>`;
  document.querySelectorAll("[data-order-open]").forEach(button=>button.onclick=()=>openOrderDetail(button.dataset.orderOpen,button));
}
function updateOrdersBadge(){const pending=summarizeAdminOrders(getDB().orders).pending;$("#ordersBadge").textContent=pending||""}
function resetOrderFilters(){
  $("#orderSearch").value="";$("#orderStatusFilter").value="all";$("#orderDateFrom").value="";$("#orderDateTo").value="";$("#orderSort").value="newest";ordersPage=1;renderOrdersTable();
}
function renderOrderDetail(){
  const order=getDB().orders.find(o=>o.id===openOrderId);
  if(!order){closeOrderDetail();toast("El pedido ya no está disponible");return}
  const c=order.customer||{},current=ORDER_STATUSES.indexOf(order.status);
  $("#orderDetailContent").innerHTML=`
    <header class="order-detail-heading"><p class="eyebrow">SERVICOM GROUP · CONSTANCIA DE PEDIDO</p><h2 id="orderDetailTitle">${escapeHTML(order.id)}</h2><div><span>${escapeHTML(ordersDate(order.date))} · Perú</span>${orderStatusBadge(order.status)}</div></header>
    <ol class="order-progress" aria-label="Seguimiento del pedido">${ORDER_STATUSES.map((s,i)=>`<li class="${i<=current?"reached":""} ${i===current?"current":""}" ${i===current?'aria-current="step"':""}><span aria-hidden="true">${i<current?"✓":i+1}</span><b>${s}</b></li>`).join("")}</ol>
    <div class="order-customer-grid"><section><h3>Datos del cliente</h3><dl><div><dt>Nombre</dt><dd>${escapeHTML(c.name||"No indicado")}</dd></div><div><dt>DNI</dt><dd>${escapeHTML(c.dni||"No indicado")}</dd></div><div><dt>Correo</dt><dd>${escapeHTML(c.email||"No indicado")}</dd></div><div><dt>Teléfono</dt><dd>${escapeHTML(c.phone||"No indicado")}</dd></div></dl></section><section><h3>Dirección de entrega</h3><p class="order-address">${escapeHTML(c.address||"No indicada")}</p><p class="orders-caption">Revisa los datos de contacto antes de coordinar la entrega.</p></section></div>
    <section class="order-items"><h3>Productos del pedido</h3><div class="table-wrap"><table><thead><tr><th>Producto</th><th>Cant.</th><th>Precio unit.</th><th>Subtotal</th></tr></thead><tbody>${(order.items||[]).map(item=>`<tr><td>${escapeHTML(item.name)}</td><td>${dashboardNumber(item.qty)}</td><td>${money(item.price)}</td><td>${money(dashboardNumber(item.price)*dashboardNumber(item.qty))}</td></tr>`).join("")}</tbody></table></div><div class="order-total"><span>Total del pedido</span><strong>${money(order.total)}</strong></div></section>
    <p class="order-demo-note">Pago simulado. Esta constancia no acredita un cobro real ni sustituye una boleta o factura.</p>`;
  $("#orderStatusEdit").innerHTML=ORDER_STATUSES.map(s=>`<option value="${s}">${s}</option>`).join("");
  $("#orderStatusEdit").value=order.status;
  $("#orderStatusFeedback").textContent="Elige un estado y guarda para actualizar el seguimiento.";
  updateOrderSaveButton();
}
function updateOrderSaveButton(){
  const order=getDB().orders.find(o=>o.id===openOrderId);
  $("#orderStatusSave").disabled=orderSaving||!order||$("#orderStatusEdit").value===order.status;
  $("#orderStatusEdit").disabled=orderSaving;
  $("#orderDetailClose").disabled=orderSaving;$("#orderDetailDone").disabled=orderSaving;$("#orderDetailPrint").disabled=orderSaving;
}
function openOrderDetail(id,trigger){
  openOrderId=id;orderDetailTrigger=trigger||document.activeElement;
  renderOrderDetail();if(openOrderId===null)return;
  $("#orderDetailModal").classList.remove("hidden");
  document.body.classList.add("order-dialog-open");
  $("#orderDetailClose").focus();
}
function closeOrderDetail(){
  if(orderSaving)return;
  $("#orderDetailModal").classList.add("hidden");document.body.classList.remove("order-dialog-open");openOrderId=null;
  if(orderDetailTrigger?.isConnected)orderDetailTrigger.focus();else $("#orderSearch").focus();
}
async function updateOrderStatus(id,status){
  const order=getDB().orders.find(o=>o.id===id);
  if(orderSaving||!order||!ORDER_STATUSES.includes(status)||order.status===status)return;
  if(!confirm(`¿Cambiar el pedido ${id} de «${order.status}» a «${status}»?`))return;
  const previousStatus=order.status;orderSaving=true;updateOrderSaveButton();$("#orderStatusSave").textContent="Guardando…";
  let feedback="";
  try{
    const updated=await apiUpdateOrderStatus(id,status,previousStatus);
    Object.assign(order,updated);
    try{await refreshDB();dashboardDataUpdated();feedback="Estado guardado correctamente."}
    catch(err){dashboardSyncError=true;feedback="Estado guardado. No se pudo recargar el listado; vuelve a actualizarlo.";console.warn(err)}
    render();renderOrderDetail();toast("Estado del pedido guardado");
  }catch(err){
    console.error(err);
    try{await refreshDB();dashboardDataUpdated()}catch{dashboardSyncError=true}
    render();renderOrderDetail();
    feedback="No se pudo guardar. Actualiza el listado y revisa si el pedido cambió en otra sesión antes de intentarlo de nuevo.";
  }finally{
    orderSaving=false;$("#orderStatusSave").textContent="Guardar estado";updateOrderSaveButton();
    $("#orderStatusFeedback").textContent=feedback;
    $("#orderStatusEdit").focus();
  }
}

for(const selector of ["#orderSearch","#orderStatusFilter","#orderDateFrom","#orderDateTo","#orderSort","#ordersPageSize"]){
  const field=$(selector);field.addEventListener(field.type==="search"?"input":"change",()=>{ordersPage=1;renderOrdersTable()});
}
$("#ordersClear").onclick=resetOrderFilters;
$("#ordersPrev").onclick=()=>{ordersPage--;renderOrdersTable()};
$("#ordersNext").onclick=()=>{ordersPage++;renderOrdersTable()};
$("#orderDetailClose").onclick=closeOrderDetail;$("#orderDetailDone").onclick=closeOrderDetail;
$("#orderDetailModal").addEventListener("click",e=>{if(e.target===$("#orderDetailModal"))closeOrderDetail()});
$("#orderStatusEdit").onchange=updateOrderSaveButton;
$("#orderStatusForm").onsubmit=e=>{e.preventDefault();updateOrderStatus(openOrderId,$("#orderStatusEdit").value)};
$("#orderDetailPrint").onclick=()=>window.print();
$("#ordersRefresh").onclick=async()=>{
  const btn=$("#ordersRefresh");btn.disabled=true;btn.textContent="Actualizando…";
  try{await refreshDB();dashboardDataUpdated();render();$("#ordersNotice").textContent="Listado actualizado correctamente."}
  catch(err){console.error(err);dashboardSyncError=true;renderDashboardSync();$("#ordersNotice").textContent="No se pudo actualizar. Se conserva el último listado cargado."}
  finally{btn.disabled=false;btn.textContent="↻ Actualizar"}
};
$("#ordersExport").onclick=()=>{
  const orders=filterAdminOrders(getDB().orders,getOrderFilters());if(!orders.length)return;
  const url=URL.createObjectURL(new Blob([dashboardCSV({orders})],{type:"text/csv;charset=utf-8;"})),link=document.createElement("a");
  link.href=url;link.download=`pedidos-filtrados-${dashboardDay(new Date())}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
document.addEventListener("keydown",event=>{
  if($("#orderDetailModal").classList.contains("hidden"))return;
  if(event.key==="Escape"){event.preventDefault();closeOrderDetail()}
  if(event.key==="Tab"){
    const controls=[...$("#orderDetailModal").querySelectorAll("button:not(:disabled),select:not(:disabled),[tabindex='0']")],first=controls[0],last=controls.at(-1);
    if(!first){event.preventDefault();return}
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }
});
