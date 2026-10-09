const $=s=>document.querySelector(s);
function money(n){return `S/ ${Number(n).toFixed(2)}`}
let toastTimer=null;
function toast(msg,actionLabel,actionFn){
  const t=$("#toast");
  t.innerHTML=`<span>${msg}</span>${actionLabel?`<button type="button" class="toast-action" id="toastActionBtn">${actionLabel}</button>`:""}`;
  t.classList.add("show");
  if(actionLabel&&actionFn){
    const btn=$("#toastActionBtn");
    if(btn)btn.onclick=()=>{t.classList.remove("show");actionFn()};
  }
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove("show"),2600);
}
function escapeHTML(v){return String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
