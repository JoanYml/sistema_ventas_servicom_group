function supportNormalize(value){
  return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9\s-]/g," ").replace(/\s+/g," ").trim();
}

function supportHandoff(){
  return {
    text:"Puedes enviar tu consulta al equipo de Servicom Group. Un encargado la verá en administración y podrá responderte aquí. Esto no confirma disponibilidad inmediata: conserva este navegador para volver a consultar la respuesta.",
    actions:[{type:"handoff",label:"Enviar consulta al equipo"}],topic:"human"
  };
}

function supportProductMatches(message,products){
  const ignored=new Set("que cual cuales cuanto cuantos cuesta cuestan precio precios stock hay tiene tienen tienes teneis disponible disponibles disponibilidad producto productos comprar compra quiero quisiera necesito busco buscar ver saber me puedes podria por favor para un una unos unas el la los las de del en y o con es son esta estan este estas ese esos se a al su sus si mas mi mis informacion sobre buen buenas hola dias tardes noches".split(" "));
  const words=supportNormalize(message).split(" ").filter(w=>w.length>2&&!ignored.has(w));
  if(!words.length)return [];
  return products.filter(p=>p.active).map(p=>{
    const haystack=supportNormalize(`${p.name} ${p.category}`).split(" ");
    const score=words.reduce((n,w)=>n+(haystack.some(h=>h===w||h.replace(/s$/,"")===w.replace(/s$/,""))?1:0),0);
    return {product:p,score};
  }).filter(p=>p.score===words.length).sort((a,b)=>b.product.stock-a.product.stock).slice(0,3).map(x=>x.product);
}

function supportAnswer(message,context={}){
  const text=supportNormalize(message),products=context.products||[],orders=context.orders||[];
  const catalog={type:"catalog",label:"Ir al catálogo"},tracking={type:"orders",label:"Ver mis pedidos"},human={type:"handoff",label:"Consultar con un encargado"};
  const answer=(text,actions=[],topic="faq")=>({text,actions,topic});
  if(!text)return answer("Escribe tu pregunta o elige una de las opciones.");
  if(/\b(encargad[oa]|asesor[a]?|persona|alguien|humano|humana|agente|contacto|contactar|soporte|whatsapp|atencion al cliente)\b/.test(text))return supportHandoff();
  if(/\b(devolucion|devoluciones|devolver|cambio|cambiar|cancelar|cancelacion|reembolso|garantia|garantias|reclamo|reclamar|defectuoso|averiado)\b/.test(text)){
    return answer("Un encargado debe revisar tu caso para confirmar las condiciones de cambios, garantías, devoluciones o cancelaciones. Ten a mano tu número de pedido. Desde este chat no se modifican pedidos ni se tramitan reembolsos.",[human,tracking],"policy");
  }
  const orderCode=String(message).match(/\bSG-\d{4,8}(?:-\d+)?\b/i)?.[0]?.toUpperCase();
  if(orderCode){
    const order=orders.find(o=>String(o.id).toUpperCase()===orderCode);
    return order?answer(`El pedido ${order.id} figura como «${order.status}» en los datos disponibles de este navegador. Abre «Mis pedidos» para actualizar el seguimiento.`,[tracking,human],"tracking"):
      answer("No encuentro ese pedido entre los disponibles en este navegador. Abre «Mis pedidos» desde el navegador donde realizaste la compra o consulta con un encargado. No puedo buscar pedidos de otras personas.",[tracking,human],"tracking");
  }
  if(/\b(pedido|pedidos|seguimiento|rastrear|rastre[oa]|estado|no llega|no llego)\b/.test(text)){
    return answer("En «Mis pedidos» puedes consultar las compras realizadas desde este navegador y su seguimiento: Confirmado → Despachando → Enviando → Entregado. Si compraste desde otro navegador o borraste sus datos, consulta con un encargado.",[tracking,human],"tracking");
  }
  if(/\b(envio|envios|entrega|entregas|delivery|domicilio|demora|llega|cobertura|provincia|provincias|distrito|distritos)\b/.test(text)){
    const threshold=Number(context.freeShippingThreshold);
    const promotion=Number.isFinite(threshold)&&threshold>0?` El carrito indica envío prioritario gratis desde S/ ${threshold.toFixed(2)}.`:"";
    return answer(`La tienda anuncia un plazo referencial de 24–48 horas.${promotion} Confirma con un encargado la cobertura, la fecha y cualquier costo de entrega aplicable a tu dirección.`,[human,{type:"cart",label:"Ver carrito"}],"shipping");
  }
  if(/\b(pago|pagos|pagar|tarjeta|tarjetas|yape|plin|transferencia|deposito|efectivo|cobro|cobraron|voucher|boleta|factura)\b/.test(text)){
    return answer("Esta tienda funciona como demostración: el pago con tarjeta y el voucher son simulados, no se realiza ningún cargo real. No ingreses datos de una tarjeta real. Para consultar otros medios de pago o comprobantes, habla con un encargado.",[human],"payment");
  }
  if(/\b(horario|horarios|direccion|ubicacion|local|tienda fisica|abren|cierran|descuento|descuentos|cupon|cupones)\b/.test(text)){
    return answer("No tengo información confirmada sobre horarios, ubicación física ni descuentos adicionales. Un encargado puede ayudarte a confirmarlos.",[human],"policy");
  }
  const matches=supportProductMatches(message,products);
  if(matches.length){
    return answer("Encontré estas opciones en el catálogo disponible:\n"+matches.map(p=>`${p.name}: S/ ${Number(p.price).toFixed(2)} · ${Number(p.stock)>0?`${p.stock} unidades disponibles`:"Sin stock"}.`).join("\n")+"\nLa disponibilidad puede cambiar antes de confirmar la compra.",matches.map(p=>({type:"product",id:p.id,label:`Ver ${p.name}`})),"products");
  }
  if(/\b(stock|producto|productos|catalogo|precio|precios|disponible|disponibles|disponibilidad|venden|tienen|tienes|laptop|laptops|monitor|monitores|teclado|mouse|audifonos|impresora)\b/.test(text)){
    return answer(products.length?"Puedes ver precios y disponibilidad en cada producto del catálogo. Dime el nombre del producto o su categoría para buscar una opción. Si no lo encuentras, consulta con un encargado.":"No tengo información del catálogo para confirmar precios o stock en este momento. Abre el catálogo o consulta con un encargado.",[catalog,human],"products");
  }
  if(/\b(comprar|compra|carrito|agregar|anadir|registrar|registro|cuenta)\b/.test(text)){
    return answer("Elige un producto del catálogo, agrégalo al carrito y pulsa «Continuar compra». Completa los datos de entrega y continúa al pago simulado. No necesitas crear una cuenta para comprar. Al terminar, encontrarás la constancia y el seguimiento en «Mis pedidos».",[catalog,{type:"cart",label:"Abrir carrito"}],"purchase");
  }
  if(/\b(gracias|perfecto|listo|genial)\b/.test(text))return answer("¡Con gusto! Si necesitas otra cosa, puedes preguntarme o hablar con un encargado.",[human],"thanks");
  if(/\b(hola|buenas|buenos dias|buenas tardes|buenas noches|ayuda|ayudar)\b/.test(text))return answer("¡Hola! Soy el asistente virtual de Servicom Group. Puedo ayudarte con productos, compras, envíos, pagos y seguimiento de pedidos. ¿Qué necesitas?",[{type:"question",label:"Cómo comprar",question:"¿Cómo comprar?"},human],"greeting");
  return answer("No tengo una respuesta confirmada para esa consulta. Puedo orientarte sobre productos, compras, envíos y pedidos; para otros temas, puedes consultar con un encargado.",[human,catalog],"unknown");
}
