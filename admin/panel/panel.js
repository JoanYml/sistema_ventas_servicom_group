const LOW_STOCK_LIMIT=10;
let dashboardLastSync=null;
let dashboardSyncError=false;
function dashboardDataUpdated(){dashboardLastSync=new Date();dashboardSyncError=false;renderDashboardSync()}
function renderDashboardSync(){
  const box=$("#dashboardSync");
  box.textContent=dashboardSyncError?"No se pudo actualizar · Vuelve a intentarlo":dashboardLastSync?`Actualizado ${dashboardLastSync.toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit",timeZone:DASHBOARD_TIMEZONE})} · automático cada 15 s`:"Esperando datos…";
  box.classList.toggle("sync-error",dashboardSyncError);
  $("#dashboardExport").disabled=!dashboardLastSync;
}
function currentDashboard(){return staffRole==='accountant'&&getDB().dashboard?getDB().dashboard:dashboardMetrics(getDB(),Number($("#dashboardPeriod").value))}
function dashboardOrderCount(m){return m.orderCount??m.orders.length}
function dashboardDate(day){return new Date(day+"T12:00:00Z").toLocaleDateString("es-PE",{day:"numeric",month:"short",timeZone:DASHBOARD_TIMEZONE})}
function dashboardEmpty(title,detail){return `<div class="dashboard-empty"><span aria-hidden="true">◇</span><b>${title}</b><p>${detail}</p></div>`}
function dashboardTrend(value){
  if(value===null)return '<span class="stat-trend neutral">Sin base de comparación</span>';
  return `<span class="stat-trend ${value>0?"up":value<0?"down":"neutral"}">${value>0?"↗ +":value<0?"↘ ":"— "}${value.toLocaleString("es-PE",{maximumFractionDigits:1})}% <span>vs. período anterior</span></span>`;
}
function renderStats(m){
  $("#stats").innerHTML=`
    <div class="stat"><div class="stat-heading"><small>Ventas del período</small><span aria-hidden="true">S/</span></div><strong>${money(m.revenue)}</strong>${dashboardTrend(m.revenueChange)}</div>
    <div class="stat"><div class="stat-heading"><small>Pedidos del período</small><span aria-hidden="true">▤</span></div><strong>${dashboardOrderCount(m)}</strong>${dashboardTrend(m.ordersChange)}</div>
    <div class="stat"><div class="stat-heading"><small>Ticket promedio</small><span aria-hidden="true">↗</span></div><strong>${money(m.ticket)}</strong>${dashboardTrend(m.ticketChange)}</div>
    <div class="stat"><div class="stat-heading"><small>Inventario disponible</small><span aria-hidden="true">▦</span></div><strong>${m.units.toLocaleString("es-PE")} <em>uds.</em></strong><span class="stat-trend neutral">${m.active} activos / ${m.productCount??getDB().products.length} productos</span></div>`;
}
function renderDashboardAlerts(m){
  const out=m.lowStock.filter(p=>dashboardNumber(p.stock)===0).length;
  if(!staffCan('productos')){
    $("#dashboardAlerts").innerHTML=`<div class="dashboard-alert"><span class="alert-symbol" aria-hidden="true">▤</span><div><b>${m.pending} pedidos pendientes</b><small>Resumen de preparación y entrega</small></div></div><div class="dashboard-alert"><span class="alert-symbol" aria-hidden="true">!</span><div><b>${m.lowStock.length} productos por reponer</b><small>${out} agotados · Consulta de inventario</small></div></div><div class="dashboard-alert"><span class="alert-symbol" aria-hidden="true">S/</span><div><b>${money(m.inventoryValue)}</b><small>Valor del stock al precio de venta actual</small></div></div>`;return;
  }
  $("#dashboardAlerts").innerHTML=`
    <a href="#pedidos" class="dashboard-alert"><span class="alert-symbol" aria-hidden="true">▤</span><div><b>${m.pending} ${m.pending===1?"pedido pendiente":"pedidos pendientes"}</b><small>Por preparar o entregar · Ver pedidos →</small></div></a>
    <button type="button" class="dashboard-alert ${m.lowStock.length?"warning":""}" data-dashboard-stock><span class="alert-symbol" aria-hidden="true">${m.lowStock.length?"!":"✓"}</span><div><b>${m.lowStock.length?`${m.lowStock.length} productos por reponer`:"Inventario sin alertas"}</b><small>${out} agotados · Revisar stock →</small></div></button>
    <div class="dashboard-alert"><span class="alert-symbol" aria-hidden="true">S/</span><div><b>${money(m.inventoryValue)}</b><small>Valor del stock al precio de venta actual</small></div></div>`;
  $("[data-dashboard-stock]").onclick=openDashboardLowStock;
}
function renderSalesChart(m){
  $("#salesRange").textContent=`${dashboardDate(m.start)} – ${dashboardDate(m.today)} · ${m.days} días`;
  if(!dashboardOrderCount(m)){$("#salesChart").innerHTML=dashboardEmpty("Aún no hay ventas en este período","Los pedidos aparecerán aquí cuando se registren. Prueba otro período.");return}
  const w=640,h=210,left=72,right=18,top=18,bottom=36,max=Math.max(1,...m.series.map(x=>x.total));
  const x=i=>left+i/(m.days-1)*(w-left-right),y=v=>h-bottom-v/max*(h-top-bottom);
  const points=m.series.map((d,i)=>`${x(i)},${y(d.total)}`).join(" ");
  const ticks=Array.from({length:4},(_,i)=>{const value=max*i/3,at=y(value);return `<line x1="${left}" x2="${w-right}" y1="${at}" y2="${at}" class="chart-grid"/><text x="${left-10}" y="${at+4}" text-anchor="end">${new Intl.NumberFormat("es-PE",{notation:"compact",maximumFractionDigits:1}).format(value)}</text>`}).join("");
  const labels=[0,Math.floor((m.days-1)/2),m.days-1].map(i=>`<text x="${x(i)}" y="${h-8}" text-anchor="${i===0?"start":i===m.days-1?"end":"middle"}">${dashboardDate(m.series[i].day)}</text>`).join("");
  $("#salesChart").innerHTML=`<div class="sales-chart-total"><strong>${money(m.revenue)}</strong><span>en pedidos registrados</span></div>
    <svg class="sales-svg" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="salesChartTitle salesChartDesc"><title id="salesChartTitle">Ventas diarias en soles</title><desc id="salesChartDesc">${escapeHTML(`${money(m.revenue)} entre ${dashboardDate(m.start)} y ${dashboardDate(m.today)}. Consulta los importes de cada día en la tabla de datos.`)}</desc><defs><linearGradient id="salesArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#788bff" stop-opacity=".3"/><stop offset="100%" stop-color="#788bff" stop-opacity="0"/></linearGradient></defs>${ticks}<polygon points="${left},${h-bottom} ${points} ${w-right},${h-bottom}" fill="url(#salesArea)"/><polyline points="${points}" class="sales-line"/>${labels}${m.series.map((d,i)=>`<circle cx="${x(i)}" cy="${y(d.total)}" r="4" class="sales-point"><title>${dashboardDate(d.day)}: ${money(d.total)} · ${d.count} pedidos</title></circle>`).join("")}</svg>
    <details class="chart-data"><summary>Ver datos diarios</summary><div class="chart-data-scroll"><table><caption class="sr-only">Ventas y pedidos por día</caption><thead><tr><th>Fecha</th><th>Pedidos</th><th>Ventas</th></tr></thead><tbody>${m.series.map(d=>`<tr><td>${dashboardDate(d.day)}</td><td>${d.count}</td><td>${money(d.total)}</td></tr>`).join("")}</tbody></table></div></details>`;
}
function renderOrderStatusChart(m){
  const count=dashboardOrderCount(m);
  if(!count){$("#orderStatusChart").innerHTML=dashboardEmpty("Sin pedidos que mostrar","La distribución se actualizará con tus pedidos.");return}
  let offset=0;
  const segments=m.statuses.map((s,i)=>{const pct=s.count/count*100;const circle=`<circle class="status-color-${i}" cx="70" cy="70" r="54" fill="none" stroke-width="15" pathLength="100" stroke-dasharray="${pct} ${100-pct}" stroke-dashoffset="${-offset}"/>`;offset+=pct;return circle}).join("");
  $("#orderStatusChart").innerHTML=`<div class="status-chart"><svg viewBox="0 0 140 140" role="img" aria-label="Distribución de ${count} pedidos por estado"><g transform="rotate(-90 70 70)">${segments}</g><text x="70" y="68" text-anchor="middle" class="donut-value">${count}</text><text x="70" y="87" text-anchor="middle" class="donut-label">pedidos</text></svg><ul class="status-legend">${m.statuses.map((s,i)=>`<li><span class="status-dot status-color-${i}"></span><span>${s.name}</span><b>${s.count}</b><small>${Math.round(s.count/count*100)}%</small></li>`).join("")}</ul></div>`;
}
function renderRecentOrders(m){
  $('#dashboardRecentTitle').textContent=m.aggregated?'Actividad reciente':'Últimos pedidos';$('#dashboardRecentNote').textContent=m.aggregated?'Últimos 5 días con pedidos del período.':'Los 5 más recientes del período.';
  if(m.aggregated){const days=m.series.filter(day=>day.count>0).slice(-5).reverse();$('#recentOrders').innerHTML=days.length?days.map(day=>`<div class="mini-row"><div><b>${dashboardDate(day.day)}</b><div class="order-detail">${day.count} pedidos registrados</div></div><b>${money(day.total)}</b></div>`).join(''):dashboardEmpty('Sin actividad reciente','Selecciona otro período para consultar el resumen.');return}
  const list=[...m.orders].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
  $("#recentOrders").innerHTML=list.length?list.map(o=>`<div class="mini-row"><div><b>${escapeHTML(o.id)}</b><div class="order-detail">${escapeHTML(o.customer?.name||"Cliente")} · ${dashboardDate(dashboardDay(o.date))}</div></div><div class="mini-row-end"><b>${money(o.total)}</b><span class="status-pill">${escapeHTML(o.status)}</span></div></div>`).join(""):dashboardEmpty("No hay pedidos recientes","Selecciona otro período para consultar el historial.");
}
function renderTopProducts(m){
  $("#topProducts").innerHTML=m.topProducts.length?m.topProducts.map((p,i)=>`<div class="mini-row ranking-row"><span class="ranking-number">${i+1}</span><div class="ranking-name"><b>${escapeHTML(p.name)}</b><div class="order-detail">${p.qty} unidades vendidas</div></div><b>${money(p.revenue)}</b></div>`).join(""):dashboardEmpty("Tu ranking empieza aquí","Mostraremos los productos de tus pedidos, ordenados por unidades.");
}
function renderLowStock(m){
  const list=m.lowStock.slice(0,5);
  $("#lowStock").innerHTML=list.length?list.map(p=>`<div class="mini-row"><div class="inventory-name"><b>${escapeHTML(p.name)}</b><div class="order-detail">${escapeHTML(p.category)}${p.active?"":" · Inactivo"}</div></div><span class="stock-pill ${p.stock===0?"out":""}">${p.stock===0?"Agotado":p.stock+" uds."}</span>${staffCan('productos')?`<button class="mini-btn" type="button" data-edit-stock="${escapeHTML(p.id)}">Editar</button>`:''}</div>`).join("")+(m.lowStock.length>5?`<p class="empty-note">Y ${m.lowStock.length-5} más.${staffCan('productos')?' Usa «Gestionar» para verlos todos.':''}</p>`:""):dashboardEmpty("Stock en buen estado","Ningún producto está por debajo del umbral de reposición.");
  document.querySelectorAll("[data-edit-stock]").forEach(b=>b.onclick=()=>editProduct(Number(b.dataset.editStock)));
}
function renderCategorySummary(m){
  const max=Math.max(1,...m.categories.map(r=>r.stock));
  $("#categorySummary").innerHTML=m.categories.length?m.categories.map(r=>`<div class="inventory-bar-row"><div><b>${escapeHTML(r.name)}</b><span>${r.stock} uds. <small>· ${r.count} prod.</small></span></div><div class="bar-track"><div class="bar-fill" style="width:${r.stock/max*100}%"></div></div></div>`).join(""):dashboardEmpty("Sin inventario registrado","Añade tu primer producto para comenzar.");
}
function renderDashboard(){const m=currentDashboard();renderStats(m);renderDashboardAlerts(m);renderSalesChart(m);renderOrderStatusChart(m);renderRecentOrders(m);renderTopProducts(m);renderLowStock(m);renderCategorySummary(m);renderDashboardSync()}
function render(){if(staffCan('dashboard'))renderDashboard();if(staffCan('productos'))renderProductsTable();if(staffCan('pedidos')){renderOrdersTable();updateOrdersBadge()}else $('#ordersBadge').textContent=''}
function openDashboardLowStock(){
  if(!staffCan('productos'))return;
  clearProductFilters();$("#filterStock").value="low";renderProductsTable();location.hash="productos";showView("productos");
}
function dashboardCSV(m){
  const cell=v=>'"'+String(v??"").replace(/^[=+\-@\t\r]/,"'$&").replace(/"/g,'""')+'"';
  const rows=m.aggregated?[["Fecha (Perú)","Pedidos","Total (PEN)"],...m.series.map(day=>[day.day,day.count,dashboardNumber(day.total).toFixed(2)])]:[["Pedido","Fecha (Perú)","Estado","Total (PEN)"],...m.orders.map(o=>[o.id,new Date(o.date).toLocaleString("es-PE",{timeZone:DASHBOARD_TIMEZONE}),o.status,dashboardNumber(o.total).toFixed(2)])];
  return "\uFEFF"+rows.map(row=>row.map(cell).join(",")).join("\r\n");
}
$("#dashboardPeriod").onchange=()=>{adminDashboardDays=Number($('#dashboardPeriod').value);if(staffRole==='accountant')$('#dashboardRefresh').click();else if(staffCan('dashboard'))renderDashboard()};
$("#dashboardLowStock").onclick=openDashboardLowStock;
$("#dashboardNewProduct").onclick=()=>$("#addProduct").click();
$("#dashboardRefresh").onclick=async()=>{
  if(!staffCan('dashboard'))return;
  const btn=$("#dashboardRefresh");btn.disabled=true;btn.textContent="Actualizando…";
  try{await refreshDB();dashboardDataUpdated();render();toast("Dashboard actualizado")}
  catch(err){dashboardSyncError=true;renderDashboardSync();toast("No se pudo actualizar el dashboard. Inténtalo de nuevo.");console.error(err)}
  finally{btn.disabled=false;btn.textContent="↻ Actualizar"}
};
$("#dashboardExport").onclick=()=>{
  const m=currentDashboard();if(!staffCan('dashboard')||!dashboardOrderCount(m))return toast("No hay pedidos para exportar en este período");
  const url=URL.createObjectURL(new Blob([dashboardCSV(m)],{type:"text/csv;charset=utf-8;"})),a=document.createElement("a");
  a.href=url;a.download=`${m.aggregated?"resumen-ventas":"pedidos"}-${m.start}-${m.today}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$("#resetData").onclick=async()=>{
  if(!staffCan('productos'))return;
  if(!confirm("Esto BORRARÁ todos los productos y pedidos de la base de datos y cargará los 10 productos demo. ¿Continuar?"))return;
  try{await apiResetDemo();await refreshDB();dashboardDataUpdated();render();toast("Datos restaurados")}
  catch(err){console.error(err);toast("No se pudieron restaurar los datos")}
};
