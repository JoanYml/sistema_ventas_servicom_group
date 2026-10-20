let financeSalesPage=1,financePurchasePage=1;
function financeBranchValue(value){return value==='general'?null:value}
function financeScopeOptions(selected=''){
 if(!financeData?.sales?.installed)return businessBranchOptions(selected);
 const value=selected||'general';
 return `<option value="general" ${value==='general'?'selected':''}>Ingreso general · Sin sucursal</option>`+businessBranches.filter(b=>b.active).map(b=>`<option value="${b.id}" ${b.id===value?'selected':''}>${escapeHTML(b.name)}</option>`).join('');
}
function financeFillScopeSelect(){
 const select=$('#financeBranch'),value=select.value;
 if(!financeData.sales.installed){businessFillBranchSelect('financeBranch');return}
 select.innerHTML='<option value="">Consolidado · General y sucursales</option>'+financeScopeOptions(value||'general');select.value=value;
}
function financeSourceSales(){
 if(!financeData?.sales?.installed)return [];
 const filters=financeData.filters,query=managementNormalize($('#financeSaleSearch').value);
 return financeData.saleRows.filter(s=>(!filters.branch||filters.branch==='general')&&s.order_date>=filters.from&&s.order_date<=filters.to&&(!query||managementNormalize(s.order_id).includes(query))).sort((a,b)=>b.order_date.localeCompare(a.order_date)||b.order_id.localeCompare(a.order_id));
}
function renderFinanceSales(){
 const status=financeData.sales,installed=status.installed;
 $('#financeSalesState').textContent=installed?`Ingresos automáticos en Ingreso general · ${status.posted} ventas contabilizadas · ${status.pending} pendientes en todo el historial. Cuenta de destino: ${status.settings.cash_account}.`:'Para registrar las ventas automáticamente ejecuta completo supabase/ventas_contabilidad.sql en Supabase, después de roles.sql.';
 $('#financeSalesRetry').disabled=!installed||!status.pending;$('#financeSalesConfigure').classList.toggle('hidden',!installed||staffRole!=='admin');
 const rows=financeSourceSales(),page=paginateAdminOrders(rows,financeSalesPage,10);financeSalesPage=page.page;
 $('#financeSalesSummary').innerHTML=financeMetric('Ventas del período',rows.reduce((n,s)=>n+financeCents(s.amount),0),'Total histórico de los pedidos')+financeMetric('Ingresos contabilizados',rows.filter(s=>s.status!=='pending').reduce((n,s)=>n+financeCents(s.amount),0),'Ingreso general · Sin sucursal')+`<div class="business-stat"><small>Pendientes del período</small><strong>${rows.filter(s=>s.status==='pending').length}</strong><span>Revisa períodos cerrados o incidencias</span></div>`;
 $('#financeSalesBody').innerHTML=page.items.length?page.items.map(s=>`<tr><td><b>${escapeHTML(s.order_id)}</b><span class="business-subtext">${s.order_date} · Ingreso general</span></td><td>${financeMoney(s.amount)}</td><td><span class="business-pill ${s.status==='pending'?'warning':'positive'}">${s.status==='pending'?'Pendiente':s.status==='zero'?'Sin importe':'Ingreso automático'}</span><span class="business-subtext">${escapeHTML(s.error_message||'')}</span></td><td>${s.journal_id?`<button type="button" class="mini-btn" data-sale-entry="${s.journal_id}">Ver asiento</button>`:'—'}</td></tr>`).join(''):`<tr><td colspan="4" class="business-empty">${!installed?'Activa la integración para incorporar los pedidos.':financeData.filters.branch&&financeData.filters.branch!=='general'?'Las ventas se registran sin sucursal. Selecciona Ingreso general o el consolidado.':'No hay ventas en el período seleccionado.'}</td></tr>`;
 $('#financeSalesPage').textContent=`Página ${page.page} de ${page.pages} · ${rows.length} ventas`;$('#financeSalesPrev').disabled=page.page===1;$('#financeSalesNext').disabled=page.page===page.pages;$('#financeSalesExport').disabled=!rows.length;
 document.querySelectorAll('[data-sale-entry]').forEach(button=>button.onclick=()=>financeShowEntry(button.dataset.saleEntry));
}
function renderFinancePurchases(){
 const rows=financeFilterJournals(financeData.journals,{...financeData.filters,search:$('#financePurchaseSearch').value}).filter(j=>j.source==='purchase'),page=paginateAdminOrders(rows,financePurchasePage,10);financePurchasePage=page.page;
 $('#financePurchasesBody').innerHTML=page.items.length?page.items.map(j=>`<tr><td>${j.entry_date}<span class="business-subtext">${escapeHTML(businessBranchName(j.branch_id))}</span></td><td>${escapeHTML(j.description)}<span class="business-subtext">${escapeHTML(j.reference||'Sin comprobante')}</span></td><td>${financeMoney(j.total)}</td><td><span class="business-pill ${j.reversed_by?'muted':'positive'}">${j.reversed_by?'Revertida':'Compra manual'}</span></td><td><button class="mini-btn" type="button" data-purchase-entry="${j.id}">Ver asiento</button></td></tr>`).join(''):'<tr><td colspan="5" class="business-empty">No hay compras manuales con estos filtros. Usa Registrar compra para agregar una.</td></tr>';
 $('#financePurchasePage').textContent=`Página ${page.page} de ${page.pages} · ${rows.length} compras`;$('#financePurchasePrev').disabled=page.page===1;$('#financePurchaseNext').disabled=page.page===page.pages;
 document.querySelectorAll('[data-purchase-entry]').forEach(button=>button.onclick=()=>financeShowEntry(button.dataset.purchaseEntry));
}
function financeOpenPurchase(){
 if(!financeData?.sales?.installed||!staffCan('contabilidad'))return;
 managementOpenModal('Registrar compra manual',`<p class="business-caption">Registra compras a proveedores. Elige si ya las pagaste o si quedan por pagar. El inventario físico se gestiona en Productos.</p>${financeCommonFields()}<div class="form-grid">${managementField('Proveedor','supplier','text','','required minlength="2" maxlength="120"')}${managementField('Importe total (S/)','amount','number','','required min="0.01" step="0.01" max="999999999999.99"')}<label>Forma de registro<select id="financePurchaseMode" name="mode"><option value="paid">Compra pagada</option><option value="credit">Compra a crédito / pendiente</option></select></label><label>Cuenta de compra o gasto<select name="account" required>${financeAccountOptions(a=>a.kind==='expense'||a.kind==='asset'&&!a.is_cash&&!['1200','1300'].includes(a.code),'5900')}</select></label><label id="financePurchaseCashField">Caja / banco<select name="cash" required>${financeAccountOptions(a=>a.is_cash,financeData.sales.settings.cash_account)}</select></label><label id="financePurchaseDueField" hidden>Vencimiento<input name="due" type="date" value="${managementToday()}"></label></div>`,async(form,request)=>{
  return managementRPC('finance_record_purchase',{p_branch:financeBranchValue(form.get('branch')),p_date:form.get('date'),p_supplier:form.get('supplier'),p_description:form.get('description'),p_reference:form.get('reference'),p_amount:form.get('amount'),p_cash:form.get('cash'),p_account:form.get('account'),p_request:request,p_due:form.get('mode')==='credit'?form.get('due'):null});
 });
 const update=()=>{const credit=$('#financePurchaseMode').value==='credit';$('#financePurchaseCashField').hidden=credit;$('#financePurchaseCashField select').disabled=credit;$('#financePurchaseDueField').hidden=!credit;$('#financePurchaseDueField input').disabled=!credit;$('#financePurchaseDueField input').required=credit};$('#financePurchaseMode').onchange=update;update();
}
$('#financeNewPurchase').onclick=financeOpenPurchase;
$('#financeSalesRetry').onclick=async()=>{const button=$('#financeSalesRetry');button.disabled=true;try{const result=await managementRPC('finance_sync_sales',{p_history:false,p_limit:500});await loadFinance(true);toast(result.failed?'Quedan ventas pendientes. Revisa la incidencia indicada.':'Ventas sincronizadas correctamente')}catch(error){$('#financeFeedback').textContent=managementError(error)}finally{button.disabled=!financeData?.sales?.pending}};
$('#financeSalesConfigure').onclick=()=>{if(staffRole!=='admin'||!financeData.sales.installed)return;managementOpenModal('Cuenta para los ingresos automáticos',`<p class="business-caption">Todas las ventas pertenecen a Ingreso general, sin sucursal. El cambio de cuenta se aplica sólo a ventas que aún no tienen asiento.</p><label>Cuenta de destino<select name="cash" required>${financeAccountOptions(a=>a.is_cash,financeData.sales.settings.cash_account)}</select></label>`,async form=>managementRPC('finance_configure_sales',{p_cash:form.get('cash')}))};
$('#financeSaleSearch').oninput=()=>{financeSalesPage=1;renderFinanceSales()};$('#financePurchaseSearch').oninput=()=>{financePurchasePage=1;renderFinancePurchases()};
$('#financeSalesPrev').onclick=()=>{financeSalesPage--;renderFinanceSales()};$('#financeSalesNext').onclick=()=>{financeSalesPage++;renderFinanceSales()};$('#financePurchasePrev').onclick=()=>{financePurchasePage--;renderFinancePurchases()};$('#financePurchaseNext').onclick=()=>{financePurchasePage++;renderFinancePurchases()};
$('#financeSalesExport').onclick=()=>managementDownload('ingresos-generales-'+financeData.filters.from+'-'+financeData.filters.to+'.csv',[['Pedido','Fecha','Ingreso general (PEN)','Estado'],...financeSourceSales().map(s=>[s.order_id,s.order_date,s.amount,s.status])]);
