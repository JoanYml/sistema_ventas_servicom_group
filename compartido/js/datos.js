const DB_KEY="servicom_group_db_v1";
const defaultProducts=[
{id:1,name:"Laptop Lenovo IdeaPad 3",category:"Laptops",price:1899.90,stock:12,active:true,icon:"💻",description:"Laptop para trabajo y estudio con pantalla de 15.6 pulgadas, procesador eficiente y almacenamiento SSD."},
{id:2,name:"Laptop HP 15",category:"Laptops",price:2199.90,stock:8,active:true,icon:"🖥️",description:"Equipo portátil de 15.6 pulgadas pensado para productividad, clases virtuales y oficina."},
{id:3,name:"Monitor LG 24 pulgadas",category:"Monitores",price:699.90,stock:15,active:true,icon:"🖥️",description:"Monitor Full HD de 24 pulgadas, ideal para oficina, diseño y entretenimiento."},
{id:4,name:"Teclado Mecánico Redragon",category:"Periféricos",price:179.90,stock:20,active:true,icon:"⌨️",description:"Teclado mecánico con iluminación y diseño compacto para trabajo y gaming."},
{id:5,name:"Mouse Logitech inalámbrico",category:"Periféricos",price:89.90,stock:30,active:true,icon:"🖱️",description:"Mouse inalámbrico cómodo para oficina y uso diario."},
{id:6,name:"Audífonos Sony Bluetooth",category:"Audio",price:349.90,stock:10,active:true,icon:"🎧",description:"Audífonos inalámbricos con conexión Bluetooth y sonido de alta calidad."},
{id:7,name:"SSD Kingston 1 TB",category:"Almacenamiento",price:329.90,stock:18,active:true,icon:"💾",description:"Unidad SSD de 1 TB para acelerar el almacenamiento y arranque del equipo."},
{id:8,name:"Router TP-Link WiFi 6",category:"Redes",price:299.90,stock:14,active:true,icon:"📡",description:"Router WiFi 6 para una conexión estable y rápida en hogares y oficinas."},
{id:9,name:"Webcam Logitech C920",category:"Accesorios",price:299.90,stock:9,active:true,icon:"📷",description:"Webcam Full HD para videollamadas, reuniones y clases virtuales."},
{id:10,name:"Impresora Epson EcoTank",category:"Impresoras",price:849.90,stock:7,active:true,icon:"🖨️",description:"Impresora multifunción con sistema de tanque de tinta de alto rendimiento."}
];
const defaultDB={products:defaultProducts,orders:[]};
function getDB(){return JSON.parse(localStorage.getItem(DB_KEY)||JSON.stringify(defaultDB))}
function saveDB(db){localStorage.setItem(DB_KEY,JSON.stringify(db))}
