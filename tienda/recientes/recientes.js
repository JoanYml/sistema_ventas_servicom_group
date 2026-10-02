const RECENT_KEY="servicom_recent";
let recentIds=JSON.parse(localStorage.getItem(RECENT_KEY)||"[]");
function trackRecent(id){
  recentIds=[id,...recentIds.filter(x=>x!==id)].slice(0,8);
  localStorage.setItem(RECENT_KEY,JSON.stringify(recentIds));
  renderRecent();
}
async function renderRecent(){
  const section=$("#recientes"),grid=$("#recentGrid");
  if(!section||!grid)return;
  const db=getDB();
  const list=recentIds.map(id=>db.products.find(p=>p.id===id)).filter(p=>p&&p.active);
  if(!list.length){section.classList.add("hidden");grid.innerHTML="";return}
  section.classList.remove("hidden");
  grid.innerHTML=list.map(p=>`<button type="button" class="recent-card" onclick="openProduct(${p.id})"><div class="recent-thumb">${productImage(p,"product-img","icon")}</div><div class="recent-body"><b>${p.name}</b><span>${money(p.price)}</span></div></button>`).join("");
  await hydrateImages(grid);
}
