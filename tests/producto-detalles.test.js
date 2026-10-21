const {test}=require('node:test');
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const c=vm.createContext({});
vm.runInContext(fs.readFileSync(require.resolve('../compartido/js/producto-detalles.js'),'utf8'),c);
test('las descripciones existentes se conservan sin inventar características',()=>{
  const value='Portátil de 15.6 pulgadas.\nPara oficina y estudio.';
  assert.equal(c.splitProductDescription(value).description,value);
  assert.equal(c.splitProductDescription(value).specifications,'');
  assert.equal(c.composeProductDescription(value,''),value);
  assert.equal(c.splitProductDescription(null).description,'');
});
test('editar y guardar características no duplica ni pierde el texto del producto',()=>{
  const description='Un equipo para trabajar.\nIncluye cargador.',specifications='Marca: Ejemplo\nPuertos: USB-C: datos y video\nIncluye manual';
  let stored=c.composeProductDescription(description,specifications);
  for(let i=0;i<3;i++){const parts=c.splitProductDescription(stored);assert.equal(parts.description,description);assert.equal(parts.specifications,specifications);stored=c.composeProductDescription(parts.description,parts.specifications)}
  assert.equal(stored.split('Características técnicas:').length,2);
  assert.equal(c.splitProductDescription('Características técnicas:\r\nMarca: Ejemplo').description,'');
  assert.equal(c.splitProductDescription('Texto sobre características técnicas: sin salto').description,'Texto sobre características técnicas: sin salto');
});
test('la ficha separa valores con dos puntos y conserva características libres',()=>{
  const rows=c.productSpecificationRows('Marca: Ejemplo\n\n- Puertos: USB-C: datos y video\n• Incluye manual\nNota sin valor:');
  assert.deepEqual(Array.from(rows,row=>({...row})),[{label:'Marca',value:'Ejemplo'},{label:'Puertos',value:'USB-C: datos y video'},{label:'',value:'Incluye manual'},{label:'',value:'Nota sin valor:'}]);
});
