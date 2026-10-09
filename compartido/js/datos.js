const SUPABASE_BUCKET="product-images";
const MY_ORDERS_KEY="servicom_my_orders";
const defaultProducts=[
{id:1,name:"Laptop Lenovo IdeaPad 3",category:"Laptops",price:1899.90,stock:12,active:true,icon:"💻",description:"Laptop para trabajo y estudio con pantalla de 15.6 pulgadas, procesador eficiente y almacenamiento SSD."},
{id:2,name:"Laptop HP 15",category:"Laptops",price:2199.90,stock:8,active:true,icon:"🖥️",description:"Equipo portátil de 15.6 pulgadas pensado para productividad, clases virtuales y oficina."},
{id:3,name:"Monitor LG 24 pulgadas",category:"Monitores",price:699.90,stock:15,active:true,icon:"🖥️",description:"Monitor Full HD de 24 pulgadas, ideal para oficina, diseño y entretenimiento."},
{id:4,name:"Teclado Mecánico Redragon",category:"Periféricos",price:179.90,stock:20,active:true,icon:"⌨️",description:"Teclado mecánico con iluminación y diseño compacto para trabajo y gaming."},
{id:5,name:"Mouse Logitech inalámbrico",category:"Periféricos",price:89.90,stock:30,active:true,icon:"🖱️",description:"Mouse inalámbrico cómodo para oficina y uso diario."},
{id:6,name:"Audífonos Sony Bluetooth",category:"Audio",price:349.90,stock:10,active:true,icon:"🎧",description:"Audífonos inalámbricos con conexión Bluetooth y sonido de alta calidad."},
{id:7,name:"SSD Kingston 1 TB",category:"Almacenamiento",price:329.90,stock:18,active:true,icon:"💾",description:"Unidad SSD de 1 TB para acelerar el almacenamiento y arranque del equipo."},
{id:8,name:"Router TP-Link WiFi 6",category:"Redes",price:299.90,stock:14,active:true,icon:"📡",description:"Router WiFi 6 para una conexión estable y rápida en hogares y oficinas."},
{id:9,name:"Webcam Logitech C920",category:"Accesorios",price:299.90,stock:9,active:true,icon:"📷",description:"Webcam Full HD para videollamadas, reuniones y clases virtuales."},
{id:10,name:"Impresora Epson EcoTank",category:"Impresoras",price:849.90,stock:7,active:true,icon:"🖨️",description:"Impresora multifunción con sistema de tanque de tinta de alto rendimiento."}
];

const sb=(window.supabase&&typeof SUPABASE_URL==="string"&&!SUPABASE_URL.includes("TU-PROYECTO"))
  ?window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY)
  :null;

let DB={products:[],orders:[]};
let dbScope="tienda";

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

async function refreshDB(){
  const c=requireClient();
  const prod=await c.from("products").select("*").order("id");
  if(prod.error)throw prod.error;
  const products=prod.data.map(rowToProduct);
  let orders=[];
  if(dbScope==="admin"){
    const r=await c.from("orders").select("*").order("created_at",{ascending:false});
    if(r.error)throw r.error;
    orders=r.data.map(rowToOrder);
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
async function apiUpdateOrderStatus(id,status){
  const res=await requireClient().from("orders").update({status}).eq("id",id).select();
  oneRow(res,"No se pudo actualizar el pedido: la sesión venció o no tienes permiso");
}
async function apiResetDemo(){
  const c=requireClient();
  const o=await c.from("orders").delete().neq("id","");
  if(o.error)throw o.error;
  const p=await c.from("products").delete().gt("id",0);
  if(p.error)throw p.error;
  const ins=await c.from("products").insert(defaultProducts.map(productToRow)).select();
  if(ins.error)throw ins.error;
}
async function apiCreateOrder(customer,items){
  const res=await requireClient().rpc("create_order",{p_customer:customer,p_items:items});
  if(res.error)throw res.error;
  rememberOrder(res.data);
  await refreshDB();
  return res.data;
}
