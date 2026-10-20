let adminSupportActive=false,adminSupportTimer=null,adminSupportRows=[],adminSupportCurrent=null,adminSupportBusy=false,adminSupportLoading=false;
const adminSupportDrafts=new Map();
let adminSupportThreadVersion=0;
function supportInboxFeedback(text){$("#supportInboxFeedback").textContent=text}
function renderSupportInbox(){
  const search=normalizeOrderSearch($("#supportInboxSearch").value),filter=$("#supportInboxFilter").value;
  const rows=adminSupportRows.filter(row=>{
    const matchesStatus=filter==="all"||(filter==="pending"?row.status==="open"&&row.last_sender==="customer":row.status===filter);
    return matchesStatus&&(!search||normalizeOrderSearch(`${row.customer_name} ${row.last_message}`).includes(search));
  });
  const pending=adminSupportRows.filter(row=>row.status==="open"&&row.last_sender==="customer").length;
  $("#supportInboxBadge").textContent=pending||"";
  $("#supportInboxCount").textContent=`${rows.length} consultas · ${pending} por responder`;
  const list=$("#supportInboxItems");list.replaceChildren();
  for(const row of rows){
    const button=document.createElement("button");button.type="button";button.className="support-inbox-item";button.classList.toggle("selected",row.id===adminSupportCurrent?.id);
    const name=document.createElement("b");name.textContent=row.customer_name||"Cliente";
    const preview=document.createElement("p");preview.textContent=row.last_message||"Sin mensajes";
    const state=document.createElement("small");state.textContent=`${row.status==="closed"?"Cerrada":row.last_sender==="customer"?"Por responder":"Respuesta enviada"} · ${ordersDate(row.updated_at)}`;
    button.append(name,preview,state);button.onclick=()=>selectSupportConversation(row.id);list.append(button);
  }
  if(!rows.length){const empty=document.createElement("p");empty.className="empty-note";empty.textContent="No hay consultas que coincidan con estos filtros.";list.append(empty)}
}
function renderSupportThread(data){
  adminSupportCurrent=data;$("#supportThreadEmpty").hidden=true;$("#supportThread").hidden=false;
  $("#supportThreadTitle").textContent=data.customer_name;
  $("#supportThreadStatus").textContent=`${data.status==="closed"?"Consulta cerrada":"Consulta abierta"} · El cliente verá las respuestas en su chat`;
  $("#supportThreadToggle").textContent=data.status==="closed"?"Reabrir consulta":"Cerrar consulta";
  const log=$("#supportThreadMessages"),signature=JSON.stringify(data.messages);
  if(log.dataset.signature!==signature){
    const oldScroll=log.scrollTop,atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<60;
    log.replaceChildren();for(const item of data.messages||[]){
      const message=document.createElement("div");message.className=`support-admin-message ${item.sender==="admin"?"from-admin":""}`;
      const label=document.createElement("small");label.textContent=`${item.sender==="admin"?"Equipo Servicom":data.customer_name} · ${ordersDate(item.created_at)}`;
      const body=document.createElement("p");body.textContent=item.body;message.append(label,body);log.append(message);
    }
    log.dataset.signature=signature;log.scrollTop=atBottom?log.scrollHeight:oldScroll;
  }
  const draft=adminSupportDrafts.get(data.id)||"";
  if($("#supportReply").value!==draft)$("#supportReply").value=draft;
  $("#supportReply").disabled=data.status!=="open"||adminSupportBusy;
  $("#supportReplySend").disabled=data.status!=="open"||adminSupportBusy;
  $("#supportThreadToggle").disabled=adminSupportBusy;
}
async function selectSupportConversation(id){
  if(adminSupportBusy)return;
  const version=++adminSupportThreadVersion;
  $("#supportReplyFeedback").textContent="Cargando conversación…";
  try{
    const data=await supportAdminConversation(id);if(version!==adminSupportThreadVersion||!adminSupportActive)return;
    $("#supportThreadMessages").dataset.signature="";renderSupportThread(data);renderSupportInbox();$("#supportReplyFeedback").textContent="";
  }catch(error){if(version===adminSupportThreadVersion)supportInboxFeedback(supportErrorText(error,true))}
}
async function loadAdminSupport(){
  if(!adminSupportActive||adminSupportLoading||adminSupportBusy)return;
  adminSupportLoading=true;const version=adminSupportThreadVersion;
  try{
    const rows=await supportAdminList();if(!adminSupportActive)return;
    adminSupportRows=rows;renderSupportInbox();supportInboxFeedback("Se actualiza automáticamente cada 8 segundos.");
    if(adminSupportCurrent){const id=adminSupportCurrent.id,data=await supportAdminConversation(id);if(adminSupportActive&&version===adminSupportThreadVersion&&id===adminSupportCurrent?.id&&!adminSupportBusy)renderSupportThread(data)}
  }catch(error){if(adminSupportActive)supportInboxFeedback(supportErrorText(error,true))}
  finally{adminSupportLoading=false}
}
function startAdminSupport(){
  if(!staffCan('atencion'))return;
  adminSupportActive=true;clearInterval(adminSupportTimer);loadAdminSupport();
  adminSupportTimer=setInterval(()=>{if(!document.hidden)loadAdminSupport()},8000);
}
function stopAdminSupport(){
  adminSupportActive=false;clearInterval(adminSupportTimer);adminSupportThreadVersion++;adminSupportRows=[];adminSupportCurrent=null;adminSupportDrafts.clear();
  $("#supportInboxItems").replaceChildren();$("#supportThreadMessages").replaceChildren();$("#supportReply").value="";
}
$("#supportInboxSearch").oninput=renderSupportInbox;$("#supportInboxFilter").onchange=renderSupportInbox;
$("#supportInboxRefresh").onclick=loadAdminSupport;
$("#supportReply").oninput=()=>{if(adminSupportCurrent)adminSupportDrafts.set(adminSupportCurrent.id,$("#supportReply").value)};
$("#supportReplyForm").onsubmit=async event=>{
  event.preventDefault();const text=$("#supportReply").value.trim(),id=adminSupportCurrent?.id;
  if(!text||!id||adminSupportBusy||adminSupportCurrent.status!=="open")return;
  adminSupportBusy=true;adminSupportThreadVersion++;renderSupportThread(adminSupportCurrent);$("#supportReplyFeedback").textContent="Enviando respuesta…";
  try{
    const data=await supportAdminReply(id,text);adminSupportDrafts.delete(id);renderSupportThread(data);$("#supportReplyFeedback").textContent="Respuesta guardada. El cliente la verá en su chat.";
  }catch(error){$("#supportReplyFeedback").textContent=supportErrorText(error,true)}
  finally{adminSupportBusy=false;if(adminSupportCurrent)renderSupportThread(adminSupportCurrent);loadAdminSupport()}
};
$("#supportThreadToggle").onclick=async()=>{
  if(!adminSupportCurrent||adminSupportBusy)return;
  const id=adminSupportCurrent.id,status=adminSupportCurrent.status==="closed"?"open":"closed";
  if(status==="closed"&&!confirm("¿Cerrar esta consulta? El cliente podrá leerla, pero no enviar nuevos mensajes hasta que la reabras."))return;
  adminSupportBusy=true;adminSupportThreadVersion++;renderSupportThread(adminSupportCurrent);
  try{const data=await supportAdminStatus(id,status);renderSupportThread(data);$("#supportReplyFeedback").textContent=status==="closed"?"Consulta cerrada.":"Consulta reabierta."}
  catch(error){$("#supportReplyFeedback").textContent=supportErrorText(error,true)}
  finally{adminSupportBusy=false;if(adminSupportCurrent)renderSupportThread(adminSupportCurrent);loadAdminSupport()}
};
