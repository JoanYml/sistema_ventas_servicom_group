// Navegador y permisos reales sobre PostgreSQL local. No usa credenciales ni escrituras remotas.
const {chromium}=require(process.env.SERVICOM_PLAYWRIGHT_PATH||'playwright');
const {createRolesDB}=require('./helpers/roles-db.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
(async()=>{
 const {db,users,branch,readSQL}=await createRolesDB();await db.exec(readSQL('ventas_contabilidad.sql'));let queue=Promise.resolve();
 const serial=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result};
 const rpcArgs={finance_sales_status:[],finance_sync_sales:['p_history','p_limit'],finance_configure_sales:['p_cash'],finance_report_general:['p_from','p_to'],finance_record_purchase:['p_branch','p_date','p_supplier','p_description','p_reference','p_amount','p_cash','p_account','p_request','p_due'],finance_get_entry:['p_id'],finance_set_period:['p_branch','p_month','p_close','p_reason'],finance_ledger_rows:['p_ids'],finance_settle_document:['p_id','p_amount','p_cash','p_date','p_request'],create_order:['p_customer','p_items'],get_my_orders:['p_tokens'],get_my_staff_role:[],is_admin:[],get_staff_dashboard:['p_days'],support_admin_get:['p_id'],support_admin_reply:['p_id','p_message'],support_admin_set_status:['p_id','p_status'],management_save_employee:['p_id','p_data','p_version'],finance_record_cash:['p_branch','p_date','p_direction','p_amount','p_cash','p_counter','p_description','p_reference','p_request'],finance_report:['p_branch','p_from','p_to']};
 const tables=new Set(['finance_order_sales','finance_journal_totals','finance_general_period_locks','products','orders','user_roles','employees','employee_history','branches','support_conversations','support_messages','finance_accounts','finance_journals','finance_document_balances','finance_payments','finance_period_locks','finance_audit']);
 const token=randomUUID(),conversation=(await db.query("select public.support_create_request($1,'Cliente de atención','Quisiera ayuda con mi compra') as data",[token])).rows[0].data;
 function sdk(user){
  let signedIn=true;const request=(type,body)=>fetch('/__roles/'+type,{method:'POST',body:JSON.stringify(body)}).then(response=>response.json());
  window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:signedIn?{user}:null}}),signOut:async()=>{signedIn=false;return {}},signInWithPassword:async()=>{signedIn=true;return {}}},rpc:(name,values)=>request('rpc',{name,values:values||{}}),from(table){
   let columns='*',orders=[],filters=[],start=0,end=499,action='select',data;
   const read=()=>request('table',{table,columns,orders,filters,start,end,action,data});
   return {select(value='*'){columns=value;return this},order(column,opts={}){orders.push({column,desc:opts.ascending===false});return this},eq(key,value){filters.push({key,value,op:'='});return this},neq(key,value){filters.push({key,value,op:'<>'});return this},gt(key,value){filters.push({key,value,op:'>'});return this},update(value){action='update';data=value;return this},insert(value){action='insert';data=value;return this},delete(){action='delete';return this},range(a,b){start=a;end=b;return read()},then(a,b){return read().then(a,b)}};
  }})};
 }
 const browser=await chromium.launch({executablePath:process.env.SERVICOM_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const errors=[];
 async function makePage(role,legacy=false){
  const context=await browser.newContext({viewport:{width:1360,height:950}}),page=await context.newPage(),requests=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(role+': '+error.message));
  await context.route('**/__recargar',route=>route.abort());
  await context.route('https://**/*',route=>route.request().url().includes('cdn.jsdelivr.net/npm/@supabase/supabase-js@2')?route.fulfill({contentType:'application/javascript',body:`(${sdk.toString()})(${JSON.stringify({id:users[role],email:role+'@example.com'})})`}):route.abort());
  await context.route('**/__roles/*',async route=>{
   const body=route.request().postDataJSON();requests.push(body);
   if(legacy&&body.name==='get_my_staff_role')return route.fulfill({json:{error:{code:'PGRST202'}}});
   try{const data=await serial(async()=>{
    await db.exec(`reset role;set role ${role==='anon'?'anon':'authenticated'};set request.jwt.claim.sub='${users[role]||''}'`);
    if(route.request().url().endsWith('/rpc')){
     assert(rpcArgs[body.name]);const values=rpcArgs[body.name].map(key=>{const value=body.values[key];return ['p_tokens','p_ids'].includes(key)?'{'+value.join(',')+'}':value&&typeof value==='object'?JSON.stringify(value):value});
     return (await db.query(`select public.${body.name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) as data`,values)).rows[0].data;
    }
    assert(tables.has(body.table));const valid=value=>{assert(/^[a-z_]+$/.test(value));return value};assert(/^[a-z_,*]+$/.test(body.columns));
    let values=[],sql;
    const where=()=>body.filters.length?' where '+body.filters.map(filter=>{assert(['=','<>','>'].includes(filter.op));values.push(filter.value);return valid(filter.key)+filter.op+'$'+values.length}).join(' and '):'';
    if(body.action==='select'){
     sql=`select ${body.columns} from public.${body.table}${where()}`;if(body.orders.length)sql+=' order by '+body.orders.map(order=>valid(order.column)+(order.desc?' desc':' asc')).join(',');sql+=` limit ${body.end-body.start+1} offset ${body.start}`;
    }else if(body.action==='update'){
     sql='update public.'+body.table+' set '+Object.entries(body.data).map(([key,value])=>{values.push(value&&typeof value==='object'?JSON.stringify(value):value);return valid(key)+'=$'+values.length}).join(',')+where()+' returning '+body.columns;
    }else if(body.action==='delete'){sql='delete from public.'+body.table+where()+' returning '+body.columns}
    else throw Error('Unsupported test mutation');
    return (await db.query(sql,values)).rows;
   });await route.fulfill({json:{data:Array.isArray(data)?data.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value instanceof Date&&(/_date$/.test(key)||key==='month')?value.toISOString().slice(0,10):value]))):data}})}
   catch(error){await route.fulfill({json:{error:{code:error.code||'P0001',message:error.message}}})}
  });return {page,requests};
 }
 async function ready(page){await page.waitForFunction(()=>!!staffRole&&!!dashboardLastSync)}
 async function text(page,selector,value){await page.waitForFunction(({selector,value})=>document.querySelector(selector).textContent.includes(value),{selector,value})}
 async function menu(page){return page.locator('.sidebar-link:not(.hidden)').evaluateAll(buttons=>buttons.map(button=>button.dataset.view))}
 const owner=await makePage('admin'),page=owner.page;await page.goto('http://127.0.0.1:5173/admin/#contabilidad');await text(page,'#financeFeedback','Datos de Supabase');await text(page,'#financeSalesState','3 ventas contabilizadas');
 const oldest=await serial(async()=>{await db.exec('reset role');return (await db.query('select min(order_date)::text as day from public.finance_order_sales')).rows[0].day});await page.fill('#financeFrom',oldest);await page.locator('#financeApply').click();await page.waitForFunction(value=>financeData?.filters.from===value&&!financeLoading,oldest);
 await page.locator('[data-finance-tab=sales]').click();assert.equal(await page.locator('#financeSalesBody [data-sale-entry]').count(),3);await text(page,'#financeSalesSummary','200.00');assert(!(await page.locator('#financeSalesBody').innerText()).includes('Chimbote'));
 await page.locator('[data-sale-entry]').first().click();await text(page,'#managementModalBody','Ingreso automático de un pedido');assert.equal(await page.locator('#financeReverseOpen').count(),0);await page.locator('#managementClose').click();
 await page.locator('#financeNewPurchase').click();assert.equal(await page.locator('#managementForm [name=branch]').inputValue(),'general');await page.fill('#managementForm [name=description]','Materiales de oficina');await page.fill('#managementForm [name=supplier]','Proveedor de prueba');await page.fill('#managementForm [name=amount]','100');await page.locator('#managementSubmit').click();await page.waitForFunction(()=>document.getElementById('managementModal').classList.contains('hidden')&&!financeLoading);
 await page.locator('[data-finance-tab=purchases]').click();await text(page,'#financePurchasesBody','Materiales de oficina');await text(page,'#financePurchasesBody','100.00');
 const store=await makePage('anon'),shop=store.page;await shop.goto('http://127.0.0.1:5173/tienda/');await shop.waitForFunction(()=>document.querySelectorAll('#productsGrid .product-card').length===10);await shop.locator('[data-product-id="4"] .store-product-preview').click();await shop.locator('#buyNowDetail').click();
 for(const [name,value] of Object.entries({dni:'12345678',phone:'999111222',name:'Cliente de compra automática',email:'compra@example.com',address:'Dirección de entrega'}))await shop.locator('#customerForm [name="'+name+'"]').fill(value);
 await shop.locator('#customerForm button').click();await shop.fill('#card','4111 1111 1111 1111');await shop.fill('#cardName','Cliente de prueba');await shop.fill('#exp','12/29');await shop.fill('#cvv','123');await shop.locator('#payBtn').click();await text(shop,'#checkoutContent','Compra registrada');
 const orderID=await shop.evaluate(()=>getMyOrders()[0].id);assert(orderID.startsWith('SG-'));
 await page.locator('#financeRefresh').click();await page.waitForFunction(()=>financeData?.saleRows.length===4&&!financeLoading);await page.locator('[data-finance-tab=sales]').click();await text(page,'#financeSalesBody',orderID);await text(page,'#financeSalesSummary','379.90');
 await page.locator('#financeRefresh').click();await page.waitForFunction(()=>!financeLoading);assert.equal(await page.locator('#financeSalesBody [data-sale-entry]').count(),4);
 const downloadPromise=page.waitForEvent('download');await page.locator('#financeSalesExport').click();const download=await downloadPromise,csv=fs.readFileSync(await download.path(),'utf8');assert(csv.includes(orderID));assert(!csv.includes('compra@example.com'));
 await page.selectOption('#financeBranch','general');await page.locator('#financeApply').click();await page.waitForFunction(()=>financeData.filters.branch==='general'&&!financeLoading);await page.locator('[data-finance-tab=reports]').click();await text(page,'#financeIncomeStatement','379.90');await text(page,'#financeIncomeStatement','100.00');await text(page,'#financeBalanceSheet','Diferencia de comprobación: S/ 0.00');
 await page.selectOption('#financeBranch',branch);await page.locator('#financeApply').click();await page.waitForFunction(value=>financeData.filters.branch===value&&!financeLoading,branch);await page.locator('[data-finance-tab=sales]').click();await text(page,'#financeSalesBody','Las ventas se registran sin sucursal');
 await page.selectOption('#financeBranch','');await page.locator('#financeApply').click();await page.waitForFunction(()=>!financeData.filters.branch&&!financeLoading);
 await page.locator('#financeNewPurchase').click();await page.fill('#managementForm [name=description]','Compra a crédito de materiales');await page.fill('#managementForm [name=supplier]','Proveedor a crédito');await page.fill('#managementForm [name=amount]','50');await page.selectOption('#financePurchaseMode','credit');assert(!(await page.locator('#financePurchaseCashField').isVisible()));assert(await page.locator('#financePurchaseDueField').isVisible());await page.locator('#managementSubmit').click();await page.waitForFunction(()=>document.getElementById('managementModal').classList.contains('hidden')&&!financeLoading);await page.locator('[data-finance-tab=purchases]').click();await text(page,'#financePurchasesBody','Compra a crédito de materiales');
 await page.locator('[data-finance-tab=documents]').click();await text(page,'#financeDocumentsBody','Proveedor a crédito');await page.locator('[data-document-settle]').click();await page.fill('#managementForm [name=amount]','20');await page.selectOption('#managementForm [name=cash]','1000');await page.locator('#managementSubmit').click();await page.waitForFunction(()=>document.getElementById('managementModal').classList.contains('hidden')&&!financeLoading);await text(page,'#financeDocumentsBody','30.00');
 await page.locator('#financeNewCash').click();await page.selectOption('#financeCashDirection','income');assert.equal(await page.locator('#financeCashCounter option[value="4000"]').count(),0);await page.locator('#managementClose').click();
 const accountant=await makePage('accountant'),book=accountant.page;await book.goto('http://127.0.0.1:5173/admin/#contabilidad');await text(book,'#financeFeedback','Datos de Supabase');assert(!(await book.locator('#financeSalesConfigure').isVisible()));assert(await book.locator('#financeNewPurchase').isEnabled());assert.deepEqual(await menu(book),['dashboard','contabilidad']);
 for(const tab of ['sales','purchases','reports']){await page.locator('[data-finance-tab='+tab+']').click();for(const width of [390,768,1360]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+tab+' '+width)}}
 await page.locator('[data-finance-tab=sales]').click();await page.evaluate(()=>{applyTheme('light');scrollTo(0,0)});await page.screenshot({path:'/tmp/servicom-ingresos-generales.png',fullPage:true});await page.evaluate(()=>applyTheme('dark'));await page.locator('[data-finance-tab=purchases]').click();await page.screenshot({path:'/tmp/servicom-compras-manuales.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.locator('#financeNewPurchase').click();await page.waitForTimeout(250);await page.screenshot({path:'/tmp/servicom-compra-mobile.png'});const box=await page.locator('.management-modal-card').boundingBox();assert(box.x>=0&&box.x+box.width<=390);
 assert.deepEqual(errors,[]);await queue;await browser.close();await db.close();console.log('PASS navegador + PostgreSQL ventas: histórico general, checkout anónimo completo e ingreso automático, sincronización sin duplicados, compras pagadas y a crédito, pagos parciales, filtros, reportes, CSV, protección de ventas, roles, temas y móvil.');
})().catch(error=>{console.error(error);process.exit(1)});
