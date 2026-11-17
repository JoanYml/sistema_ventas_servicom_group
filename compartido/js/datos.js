const SUPABASE_BUCKET="product-images";
const MY_ORDERS_KEY="servicom_my_orders";
const sb=(window.supabase&&typeof SUPABASE_URL==="string"&&!SUPABASE_URL.includes("TU-PROYECTO"))
  ?window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY)
  :null;

let DB={products:[],orders:[]};
let dbScope="tienda";
let adminDataRole=null,adminDashboardDays=30;
function configureAdminData(role){adminDataRole=role;DB={products:[],orders:[]}}

function getDB(){return DB}
function requireClient(){
  if(!sb)throw new Error("Falta configurar Supabase en compartido/js/supabase-config.js");
  return sb;
}

function rowToProduct(r){
  return{
    id:r.id,name:r.name,category:r.category,price:Number(r.price),stock:r.stock,active:r.active,
    icon:r.icon||"📦",description:r.description||"",
    iconImageRef:r.icon_image||null,imageRef:r.image||null,detailImageRefs:r.detail_images||[]
  };
}
function productToRow(p){
  const row={
    name:p.name,category:p.category,price:p.price,stock:p.stock,active:p.active!==false,
    icon:p.icon||"📦",description:p.description||"",
    icon_image:p.iconImageRef||null,image:p.imageRef||null,detail_images:p.detailImageRefs||[]
  };
  if(p.id!==undefined)row.id=p.id;
  return row;
}
function rowToOrder(r){
  return{id:r.id,date:r.created_at,customer:r.customer,items:r.items,total:Number(r.total),status:r.status};
}

function getMyOrders(){
  try{const v=JSON.parse(localStorage.getItem(MY_ORDERS_KEY)||"[]");return Array.isArray(v)?v:[]}
  catch{return[]}
}
function rememberOrder(order){
  const list=getMyOrders().filter(x=>x.id!==order.id);
  list.unshift({id:order.id,token:order.token});
  localStorage.setItem(MY_ORDERS_KEY,JSON.stringify(list.slice(0,100)));
}

function initDB(scope){dbScope=scope==="admin"?"admin":"tienda"}

async function readAllAdminRows(client,table,column,ascending=true,columns="*"){
  const rows=[],pageSize=500;
  for(let offset=0;;offset+=pageSize){
    let query=client.from(table).select(columns).order(column,{ascending});
    if(column!=="id")query=query.order("id",{ascending});
    const result=await query.range(offset,offset+pageSize-1);
    if(result.error)throw result.error;
    rows.push(...result.data);
    if(result.data.length<pageSize)return rows;
  }
}

async function refreshDB(){
  const c=requireClient();
  if(dbScope==="admin"&&adminDataRole==='accountant'){
    const {data,error}=await c.rpc('get_staff_dashboard',{p_days:adminDashboardDays});if(error)throw error;
    const next={products:[],orders:[],dashboard:data},changed=JSON.stringify(next)!==JSON.stringify(DB);DB=next;return changed;
  }
  if(dbScope==="admin"&&!['admin','employee'].includes(adminDataRole))throw new Error('La cuenta no tiene acceso al panel.');
  const prod=dbScope==="admin"
    ?{data:adminDataRole==='admin'?await readAllAdminRows(c,"products","id"):[]}
    :await c.from("products").select("*").order("id");
  if(prod.error)throw prod.error;
  const products=prod.data.map(rowToProduct);
  let orders=[];
  if(dbScope==="admin"){
    orders=(await readAllAdminRows(c,"orders","created_at",false,"id,created_at,customer,items,total,status")).map(rowToOrder);
  }else{
    const tokens=getMyOrders().map(x=>x.token);
    if(tokens.length){
      const r=await c.rpc("get_my_orders",{p_tokens:tokens});
      if(r.error)throw r.error;
      orders=r.data||[];
    }
  }
  const next={products,orders};
  const changed=JSON.stringify(next)!==JSON.stringify(DB);
  DB=next;
  return changed;
}

function oneRow(res,fallbackMsg){
  if(res.error)throw res.error;
  if(!res.data||!res.data.length)throw new Error(fallbackMsg);
  return res.data[0];
}

async function apiInsertProduct(p){
  const res=await requireClient().from("products").insert(productToRow(p)).select();
  return rowToProduct(oneRow(res,"No tienes permiso para crear productos (inicia sesión como administrador)"));
}
async function apiPatchProduct(id,patch){
  const res=await requireClient().from("products").update(patch).eq("id",id).select();
  return rowToProduct(oneRow(res,"No se pudo actualizar: la sesión venció o no tienes permiso"));
}
async function apiDeleteProduct(id){
  const res=await requireClient().from("products").delete().eq("id",id).select();
  oneRow(res,"No se pudo eliminar: la sesión venció o no tienes permiso");
}
async function apiUpdateOrderStatus(id,status,expectedStatus){
  let query=requireClient().from("orders").update({status}).eq("id",id);
  if(expectedStatus!==undefined)query=query.eq("status",expectedStatus);
  const res=await query.select("id,created_at,customer,items,total,status");
  return rowToOrder(oneRow(res,"El pedido cambió o no tienes permiso. Actualiza el listado y vuelve a intentarlo."));
}
async function apiCreateOrder(customer,items){
  const res=await requireClient().rpc("create_order",{p_customer:customer,p_items:items});
  if(res.error)throw res.error;
  rememberOrder(res.data);
  await refreshDB();
  return res.data;
}
