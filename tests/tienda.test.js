const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const c=vm.createContext({isFavorite:()=>false});
for(const file of ['compartido/js/utilidades.js','tienda/catalogo/imagenes.js','tienda/catalogo/presentacion.js','tienda/catalogo/catalogo.js'])vm.runInContext(fs.readFileSync(require.resolve('../'+file),'utf8'),c);
const products=[
  {id:1,name:'Teclado mecánico',category:'Periféricos',description:'Para trabajar',price:100,stock:0,active:true},
  {id:2,name:'Laptop Lenovo',category:'Laptops',description:'Equipo para estudiar',price:1800,stock:5,active:true},
  {id:3,name:'Mouse',category:'Periféricos',description:'Inalámbrico',price:80,stock:15,active:true},
  {id:4,name:'Oculto',category:'Privada',description:'No publicado',price:1,stock:99,active:false}
];
test('la búsqueda reconoce tildes, categorías y descripciones',()=>{
  assert.equal(c.filterStoreProducts(products,{search:'mecanico'})[0].id,1);
  assert.equal(c.filterStoreProducts(products,{search:'ESTUDIAR'})[0].id,2);
  assert.equal(c.filterStoreProducts(products,{search:'perifericos'}).length,2);
  assert.equal(c.filterStoreProducts(products,{search:'No publicado'}).length,0);
});
test('combina categoría, favoritos y disponibilidad sin cambiar los productos',()=>{
  const filtered=c.filterStoreProducts(products,{category:'Periféricos',inStock:true,onlyFavorites:true,favorites:[1,3]});
  assert.equal(filtered.length,1);assert.equal(filtered[0].id,3);
  assert.equal(c.filterStoreProducts(products,{category:'Laptops',onlyFavorites:true,favorites:[3]}).length,0);
  assert.equal(products[0].id,1);
});
test('ordena el catálogo por precio y stock',()=>{
  assert.deepEqual(Array.from(c.filterStoreProducts(products,{sort:'price-asc'}),p=>p.id),[3,1,2]);
  assert.deepEqual(Array.from(c.filterStoreProducts(products,{sort:'stock-desc'}),p=>p.id),[3,2,1]);
});
test('los accesos por categoría cuentan únicamente productos publicados',()=>{
  const groups=c.storeCategoryGroups(products);
  assert.equal(groups.length,2);assert.equal(groups.find(g=>g.name==='Periféricos').count,2);
  assert(!groups.some(g=>g.name==='Privada'));
  assert.equal(c.filterStoreProducts([{...products[0],category:''}],{category:'Otros'}).length,1);
});
test('las tarjetas escapan los textos y permiten consultar productos agotados',()=>{
  const html=c.productCardHTML({...products[0],name:'<img src=x onerror=alert(1)>',category:'" autofocus',description:'<script>alert(1)</script>'});
  assert(!html.includes('<img src=x'));assert(!html.includes('<script>'));assert(html.includes('&lt;img'));
  assert.match(html,/quick-add-btn[^>]*disabled/);
  assert.match(html,/store-product-details[^>]*>Ver detalles/);
  assert.match(html,/Imagen no disponible/);
});
