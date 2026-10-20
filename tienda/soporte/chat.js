(()=>{
  const storageKey="servicom_support_token",widget=document.getElementById("supportWidget"),panel=document.getElementById("supportPanel"),log=document.getElementById("supportMessages");
  const node=id=>document.getElementById(id);
  let token=null,conversation=null,mode="bot",busy=false,loadPromise=null,conversationVersion=0,lastQuestion="",seenMessage=0,remoteSignature="";
  try{const saved=localStorage.getItem(storageKey);if(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved||""))token=saved}catch{}
  function feedback(text){node("supportFeedback").textContent=text}
  function scrollBottom(){log.scrollTop=log.scrollHeight}
  function message(sender,text,actions=[]){
    const entry=document.createElement("div");entry.className=`support-message support-message-${sender}`;
    const label=document.createElement("small");label.textContent=sender==="customer"?"Tú":sender==="admin"?"Equipo Servicom":"Asistente virtual";
    const body=document.createElement("p");body.textContent=text;entry.append(label,body);
    if(actions.length){const controls=document.createElement("div");controls.className="support-message-actions";for(const action of actions){const button=document.createElement("button");button.type="button";button.textContent=action.label;button.onclick=()=>runAction(action);controls.append(button)}entry.append(controls)}
    log.append(entry);if(mode==="bot")while(log.children.length>80)log.firstElementChild.remove();scrollBottom();
  }
  function updateMode(){
    const human=mode==="human",handoff=mode==="handoff",closed=human&&conversation?.status==="closed";
    node("supportTitle").textContent=human?"Equipo Servicom":"Asistente Servicom";
    node("supportSubtitle").textContent=human?"Respuestas de un encargado":"Preguntas frecuentes";
    node("supportModeLabel").textContent=human?(closed?"Consulta cerrada":"Consulta enviada al equipo"):"Asistente automático";
    node("supportModeSwitch").textContent=human||handoff?"Preguntas frecuentes":token?"Ver mi consulta":"Hablar con el equipo";
    node("supportSuggestions").hidden=human||handoff;node("supportHandoffForm").hidden=!handoff;
    node("supportMessageForm").hidden=handoff;
    node("supportInput").placeholder=human?"Escribe un mensaje al equipo…":"Escribe tu pregunta…";
    node("supportInput").disabled=busy||closed;node("supportSend").disabled=busy||closed;
    node("supportRequestSend").disabled=busy;node("supportRequestCancel").disabled=busy;
    node("supportName").disabled=busy;node("supportRequest").disabled=busy;
    node("supportModeSwitch").disabled=busy;
    if(closed)feedback("El equipo cerró esta consulta. Puedes volver a las preguntas frecuentes o iniciar una nueva.");
  }
  function showBot(){mode="bot";feedback("");log.replaceChildren();remoteSignature="";updateMode();message("bot","¡Hola! Soy el asistente virtual de Servicom Group. Puedo orientarte sobre productos, compras, envíos y pedidos. Si necesitas más ayuda, puedes enviar una consulta al equipo.",[{type:"question",label:"Cómo comprar",question:"¿Cómo comprar?"},{type:"question",label:"Hablar con un encargado",question:"Hablar con un encargado"}]);node("supportInput").focus()}
  function renderConversation(data){
    conversation=data;
    if(mode!=="human")return;
    const signature=JSON.stringify([data.status,data.messages]);
    if(signature!==remoteSignature){
      const oldScroll=log.scrollTop,atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<60;
      log.replaceChildren();for(const item of data.messages)message(item.sender,item.body);
      if(data.status==="closed")message("bot","Esta consulta está cerrada. Si necesitas ayuda con otro tema, puedes iniciar una nueva.",[{type:"new-request",label:"Nueva consulta"}]);
      remoteSignature=signature;if(atBottom)scrollBottom();else log.scrollTop=oldScroll;
    }
    if(!panel.hidden)seenMessage=Number(data.messages.at(-1)?.id||0);
    node("supportUnread").hidden=!(data.messages.at(-1)?.sender==="admin"&&Number(data.messages.at(-1).id)>seenMessage);
    updateMode();
  }
  function refreshConversation(){
    if(!token||busy||document.hidden)return Promise.resolve();
    if(loadPromise)return loadPromise;
    const requestToken=token,version=conversationVersion;
    loadPromise=(async()=>{try{
      const data=await supportLoadConversation(requestToken);if(token!==requestToken||version!==conversationVersion)return;
      if(data){conversation=data;if(mode==="human")renderConversation(data);else node("supportUnread").hidden=!(data.messages.at(-1)?.sender==="admin"&&Number(data.messages.at(-1).id)>seenMessage)}
      else if(mode==="human"){feedback("No se encontró la consulta. Puedes enviar una nueva desde «Hablar con el equipo».");mode="bot";updateMode()}
    }catch(error){if(!panel.hidden&&mode==="human")feedback(supportErrorText(error))}
    finally{loadPromise=null}})();
    return loadPromise;
  }
  async function openChat(){
    panel.hidden=false;node("supportToggle").setAttribute("aria-expanded","true");feedback("");
    if(token){await refreshConversation();if(conversation){mode="human";remoteSignature="";renderConversation(conversation)}}
    updateMode();if(!node("supportInput").disabled)node("supportInput").focus();else node("supportClose").focus();
  }
  function closeChat(restoreFocus=true){panel.hidden=true;node("supportToggle").setAttribute("aria-expanded","false");if(restoreFocus)node("supportToggle").focus()}
  async function handoff(){
    if(token){await refreshConversation();if(conversation){mode="human";remoteSignature="";feedback("");renderConversation(conversation);return}}
    mode="handoff";feedback("");node("supportRequest").value=lastQuestion;updateMode();node("supportName").focus();
  }
  function runAction(action){
    if(busy)return;
    if(action.type==="question")sendBotQuestion(action.question);
    else if(action.type==="handoff")handoff();
    else if(action.type==="new-request"){
      token=null;conversation=null;remoteSignature="";seenMessage=0;lastQuestion="";
      try{localStorage.removeItem(storageKey)}catch{}
      node("supportUnread").hidden=true;handoff();
    }else{
      closeChat(false);
      if(action.type==="catalog")node("catalogo").scrollIntoView({behavior:"smooth"});
      else if(action.type==="cart")openCart();
      else if(action.type==="orders")openOrders();
      else if(action.type==="product"){const product=getDB().products.find(p=>p.id===action.id&&p.active);if(product)openProduct(product.id);else toast("Ese producto ya no está disponible")}
    }
  }
  function sendBotQuestion(text){
    if(busy)return;
    text=String(text).trim().slice(0,1000);if(!text)return;
    message("customer",text);
    const result=supportAnswer(text,{products:getDB().products,orders:getDB().orders,freeShippingThreshold:FREE_SHIPPING_THRESHOLD});
    if(result.topic!=="human"&&result.topic!=="greeting"&&result.topic!=="thanks")lastQuestion=text;
    message("bot",result.text,result.actions);feedback("");
  }
  node("supportToggle").onclick=()=>panel.hidden?openChat():closeChat();node("supportClose").onclick=()=>closeChat();
  node("supportModeSwitch").onclick=()=>mode==="bot"?handoff():showBot();node("supportRequestCancel").onclick=showBot;
  widget.querySelectorAll("[data-support-question]").forEach(button=>button.onclick=()=>sendBotQuestion(button.dataset.supportQuestion));
  node("supportHandoffForm").onsubmit=async event=>{
    event.preventDefault();if(busy)return;
    const name=node("supportName").value.trim(),text=node("supportRequest").value.trim();
    if(!name||!text)return;
    busy=true;conversationVersion++;updateMode();feedback("Enviando consulta…");
    try{
      if(!token){token=crypto.randomUUID();try{localStorage.setItem(storageKey,token)}catch{token=null;throw new Error("storage")}}
      const data=await supportCreateRequest(token,name,text);
      mode="human";remoteSignature="";renderConversation(data);feedback("Consulta enviada. El equipo responderá aquí cuando esté disponible.");
    }catch(error){feedback(error.message==="storage"?"Este navegador no permite guardar la conversación. Habilita el almacenamiento del sitio para poder volver a ver las respuestas.":supportErrorText(error))}
    finally{busy=false;updateMode()}
  };
  node("supportMessageForm").onsubmit=async event=>{
    event.preventDefault();if(busy)return;
    const input=node("supportInput"),text=input.value.trim();if(!text)return;
    if(mode==="bot"){input.value="";sendBotQuestion(text);return}
    if(conversation?.status!=="open")return;
    busy=true;conversationVersion++;updateMode();feedback("Enviando…");
    try{const data=await supportSendCustomer(token,text);input.value="";renderConversation(data);feedback("Mensaje enviado al equipo.")}
    catch(error){feedback(supportErrorText(error))}
    finally{busy=false;updateMode();if(!input.disabled)input.focus()}
  };
  widget.addEventListener("keydown",event=>{if(event.key==="Escape"&&!panel.hidden){event.preventDefault();closeChat()}});
  function syncOverlays(){
    const obscured=[...document.querySelectorAll(".modal")].some(element=>!element.classList.contains("hidden"))||node("cartDrawer").classList.contains("open");
    widget.hidden=obscured;if(obscured&&!panel.hidden)closeChat(false);
  }
  const observer=new MutationObserver(syncOverlays);document.querySelectorAll(".modal,#cartDrawer").forEach(element=>observer.observe(element,{attributes:true,attributeFilter:["class"]}));
  function viewport(){
    const view=window.visualViewport;if(!view)return;
    widget.style.setProperty("--support-viewport-height",`${view.height}px`);
    widget.style.setProperty("--support-keyboard-offset",`${Math.max(0,innerHeight-view.height-view.offsetTop)}px`);
  }
  window.visualViewport?.addEventListener("resize",viewport);viewport();
  showBot();if(document.activeElement===node("supportInput"))node("supportInput").blur();
  syncOverlays();setInterval(refreshConversation,8000);if(token)refreshConversation();
})();
