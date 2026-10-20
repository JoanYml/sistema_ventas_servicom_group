const ORDER_STATUSES=["Confirmado","Despachando","Enviando","Entregado"];

function normalizeOrderSearch(value){
  return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
}
function filterAdminOrders(orders,filters={}){
  const term=normalizeOrderSearch(filters.search);
  if(filters.from&&filters.to&&filters.from>filters.to)return [];
  return orders.filter(order=>{
    const customer=order.customer||{};
    const haystack=[order.id,customer.name,customer.email,customer.dni,customer.phone].map(normalizeOrderSearch).join(" ");
    if(term&&!haystack.includes(term))return false;
    if(filters.status==="pending"&&order.status==="Entregado")return false;
    if(ORDER_STATUSES.includes(filters.status)&&order.status!==filters.status)return false;
    const day=dashboardDay(order.date);
    if((filters.from||filters.to)&&!day)return false;
    return (!filters.from||day>=filters.from)&&(!filters.to||day<=filters.to);
  }).sort((a,b)=>{
    const dateA=new Date(a.date).getTime()||0,dateB=new Date(b.date).getTime()||0;
    const difference=filters.sort==="oldest"?dateA-dateB:filters.sort==="highest"?dashboardNumber(b.total)-dashboardNumber(a.total):filters.sort==="lowest"?dashboardNumber(a.total)-dashboardNumber(b.total):dateB-dateA;
    return difference||String(a.id).localeCompare(String(b.id),"es");
  });
}
function paginateAdminOrders(orders,page=1,pageSize=10){
  pageSize=[10,25,50].includes(Number(pageSize))?Number(pageSize):10;
  const pages=Math.max(1,Math.ceil(orders.length/pageSize));
  page=Math.min(pages,Math.max(1,Math.floor(Number(page)||1)));
  const offset=(page-1)*pageSize;
  return {items:orders.slice(offset,offset+pageSize),page,pages,from:orders.length?offset+1:0,to:Math.min(offset+pageSize,orders.length),total:orders.length};
}
function summarizeAdminOrders(orders){
  return {total:orders.length,pending:orders.filter(o=>o.status!=="Entregado").length,shipping:orders.filter(o=>o.status==="Enviando").length,delivered:orders.filter(o=>o.status==="Entregado").length};
}
