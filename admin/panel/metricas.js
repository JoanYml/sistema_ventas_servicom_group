const DASHBOARD_TIMEZONE="America/Lima";
const DASHBOARD_STATUSES=["Confirmado","Despachando","Enviando","Entregado"];

function dashboardDay(value){
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return null;
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:DASHBOARD_TIMEZONE,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const part=type=>parts.find(p=>p.type===type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function shiftDashboardDay(day,amount){
  const date=new Date(day+"T12:00:00Z");
  date.setUTCDate(date.getUTCDate()+amount);
  return date.toISOString().slice(0,10);
}
function dashboardNumber(value){const n=Number(value);return Number.isFinite(n)?Math.max(0,n):0}
function dashboardChange(current,previous){
  if(!previous)return current?null:0;
  return (current-previous)/previous*100;
}
function dashboardMetrics(db,days=30,now=new Date()){
  days=[7,30,90].includes(Number(days))?Number(days):30;
  const today=dashboardDay(now),start=shiftDashboardDay(today,1-days),previousStart=shiftDashboardDay(start,-days);
  const orders=db.orders.filter(o=>{const day=dashboardDay(o.date);return day&&day>=start&&day<=today&&new Date(o.date)<=now});
  const previous=db.orders.filter(o=>{const day=dashboardDay(o.date);return day&&day>=previousStart&&day<start});
  const sum=list=>list.reduce((total,o)=>total+dashboardNumber(o.total),0);
  const revenue=sum(orders),previousRevenue=sum(previous),ticket=orders.length?revenue/orders.length:0;
  const series=Array.from({length:days},(_,i)=>({day:shiftDashboardDay(start,i),total:0,count:0}));
  const byDay=new Map(series.map(x=>[x.day,x]));
  const ranking=new Map();
  for(const order of orders){
    const day=byDay.get(dashboardDay(order.date));day.total+=dashboardNumber(order.total);day.count++;
    for(const item of order.items||[]){
      const key=String(item.id??item.name),row=ranking.get(key)||{id:item.id,name:item.name||"Producto sin nombre",qty:0,revenue:0};
      row.qty+=dashboardNumber(item.qty);row.revenue+=dashboardNumber(item.qty)*dashboardNumber(item.price);ranking.set(key,row);
    }
  }
  const statuses=DASHBOARD_STATUSES.map(name=>({name,count:orders.filter(o=>o.status===name).length}));
  const other=orders.filter(o=>!DASHBOARD_STATUSES.includes(o.status)).length;
  if(other)statuses.push({name:"Otros",count:other});
  const lowStock=db.products.filter(p=>dashboardNumber(p.stock)<=LOW_STOCK_LIMIT).sort((a,b)=>a.stock-b.stock);
  const categories=[...new Set(db.products.map(p=>p.category||"Sin categoría"))].map(name=>{
    const items=db.products.filter(p=>(p.category||"Sin categoría")===name);
    return {name,count:items.length,stock:items.reduce((n,p)=>n+dashboardNumber(p.stock),0)};
  }).sort((a,b)=>b.stock-a.stock);
  return {days,today,start,orders,revenue,ticket,series,statuses,lowStock,categories,
    revenueChange:dashboardChange(revenue,previousRevenue),ordersChange:dashboardChange(orders.length,previous.length),
    ticketChange:dashboardChange(ticket,previous.length?previousRevenue/previous.length:0),
    pending:db.orders.filter(o=>o.status!=="Entregado").length,
    active:db.products.filter(p=>p.active).length,units:db.products.reduce((n,p)=>n+dashboardNumber(p.stock),0),
    inventoryValue:db.products.reduce((n,p)=>n+dashboardNumber(p.stock)*dashboardNumber(p.price),0),
    topProducts:[...ranking.values()].sort((a,b)=>b.qty-a.qty||b.revenue-a.revenue).slice(0,5)};
}
