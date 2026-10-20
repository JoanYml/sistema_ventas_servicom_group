const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(require.resolve('../tienda/soporte/respuestas.js'),'utf8'),context);
const {supportAnswer}=context;

test('las preguntas frecuentes reconocen acentos y no prometen cobros reales',()=>{
  assert.equal(supportAnswer('¿Cómo comprar?').topic,'purchase');
  assert.equal(supportAnswer('¿Dónde está mi pedido?').topic,'tracking');
  const payment=supportAnswer('¿Puedo pagar con Yape?');
  assert.equal(payment.topic,'payment');assert.match(payment.text,/no se realiza ningún cargo real/);
  const shipping=supportAnswer('¿Cómo son los envíos?',{freeShippingThreshold:150});
  assert.equal(shipping.topic,'shipping');assert.match(shipping.text,/150\.00/);assert.match(shipping.text,/referencial/);
});
test('los productos usan precios y stock del catálogo activo',()=>{
  const products=[{id:1,name:'Laptop Lenovo',category:'Laptops',active:true,price:799,stock:2},{id:2,name:'Laptop Lenovo oculta',category:'Laptops',active:false,price:1,stock:99}];
  const result=supportAnswer('¿Cuánto cuesta la laptop Lenovo?',{products});
  assert.equal(result.topic,'products');assert.match(result.text,/799\.00/);assert.match(result.text,/2 unidades/);assert.doesNotMatch(result.text,/oculta/);
  assert.equal(result.actions[0].id,1);
  assert.equal(supportAnswer('¿Tienen laptops?',{products}).topic,'products');
});
test('no inventa disponibilidad cuando no se ha cargado el catálogo',()=>{
  assert.match(supportAnswer('¿Hay stock?',{products:[]}).text,/No tengo información del catálogo/);
});
test('sólo consulta pedidos ya autorizados para este navegador',()=>{
  const orders=[{id:'SG-20261020-1000',status:'Enviando'}];
  assert.match(supportAnswer('SG-20261020-1000',{orders}).text,/Enviando/);
  assert.match(supportAnswer('SG-20261020-2000',{orders}).text,/No encuentro/);
  assert.doesNotMatch(supportAnswer('SG-20261020-2000',{orders}).text,/Enviando/);
});
test('los casos humanos y políticas desconocidas se derivan a la bandeja interna',()=>{
  const human=supportAnswer('Quiero hablar con un encargado');
  assert.equal(human.topic,'human');assert.equal(human.actions[0].type,'handoff');assert.match(human.text,/administración/);
  for(const query of ['Quiero cancelar mi compra','¿Cuál es la garantía?','¿Dónde está el local?']){
    const result=supportAnswer(query);assert.equal(result.topic,'policy');assert(result.actions.some(a=>a.type==='handoff'));
  }
  const unknown=supportAnswer('Un asunto que el bot desconoce');
  assert.equal(unknown.topic,'unknown');assert(unknown.actions.some(a=>a.type==='handoff'));
});
test('el bot no convierte texto del usuario en HTML ni ejecuta compras',()=>{
  const result=supportAnswer('<img src=x onerror=alert(1)>');
  assert.equal(result.topic,'unknown');assert(!result.actions.some(a=>['purchase','pay','send'].includes(a.type)));
});
test('los errores de esquema se distinguen de fallos de conexión sin exponer detalles',()=>{
  const c=vm.createContext({});vm.runInContext(fs.readFileSync(require.resolve('../compartido/js/soporte-api.js'),'utf8'),c);
  assert.match(c.supportErrorText({code:'PGRST202'}),/aún no está disponible/);
  assert.match(c.supportErrorText({code:'PGRST205'},true),/supabase\/soporte.sql/);
  assert.doesNotMatch(c.supportErrorText({message:'internal-token-secret'}),/internal-token/);
});
test('la lista administrativa pagina y no solicita tokens de acceso',async()=>{
  const calls=[],rows=Array.from({length:201},(_,id)=>({id}));
  const query={select(fields){calls.push(fields);return this},order(){return this},async range(start,end){return {data:rows.slice(start,end+1)}}};
  const c=vm.createContext({requireClient:()=>({from:()=>query})});vm.runInContext(fs.readFileSync(require.resolve('../compartido/js/soporte-api.js'),'utf8'),c);
  const result=await c.supportAdminList();assert.equal(result.length,201);assert.equal(calls.length,2);assert(!calls.some(x=>x.includes('access_token')));
});
