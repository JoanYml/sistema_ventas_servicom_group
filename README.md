# Sistema de ventas — Servicom Group

Demo web para catálogo, carrito, administración y pedidos. Funciona sin base de datos remota: los datos se guardan en el navegador (`localStorage` e `IndexedDB`).

## Cómo ejecutarlo

Requiere Node.js 20 o superior. No hay dependencias que instalar.

```bash
npm run dev
```

- Tienda: http://localhost:5173/tienda/
- Administración: http://localhost:5173/admin/

Si el puerto está ocupado: `npm run dev -- --port 3000`.
El servidor recarga la página automáticamente cuando guardas un archivo.

## Estructura del proyecto

```text
sistema_ventas_servicom_group/
├── package.json
├── README.md
├── index.html                       Redirige a la tienda
├── scripts/
│   └── servidor-dev.js              Servidor de desarrollo (npm run dev)
├── compartido/                      Código usado por la tienda y por el admin
│   ├── css/base.css
│   └── js/
│       ├── datos.js
│       ├── utilidades.js
│       ├── tema.js
│       └── imagenes-db.js
├── tienda/                          Todo lo que ve el cliente
│   ├── index.html
│   ├── css/tienda.css
│   ├── principal.js
│   ├── catalogo/  (imagenes.js, catalogo.js, detalle.js)
│   ├── carrito/   (sincronizacion.js, carrito.js)
│   ├── favoritos/ (favoritos.js)
│   ├── recientes/ (recientes.js)
│   ├── compra/    (checkout.js)
│   └── pedidos/   (pedidos.js)
└── admin/                           Solo funcionalidades de administración
    ├── index.html
    ├── css/admin.css
    ├── principal.js
    ├── panel/     (panel.js, navegacion.js)
    ├── pedidos/   (pedidos.js)
    └── catalogo/  (productos.js, categorias.js, imagenes.js, formulario-producto.js)
```

Los scripts son clásicos (no módulos) y se cargan en el orden indicado al final de cada `index.html`: primero `compartido/`, luego las carpetas de la sección y al final `principal.js`. Las funciones son globales porque el HTML las invoca con `onclick`.

## Funcionalidades principales

- Catálogo tecnológico con búsqueda, filtro por categoría, orden y filtro de favoritos.
- Detalle de producto con carrusel de imágenes.
- Carrito con cantidades, eliminación individual y avisos de cambios de precio y stock.
- Compra con datos de entrega, pago simulado y voucher.
- Historial de pedidos con seguimiento y opción de comprar de nuevo.
- Administración con menú lateral y tres pestañas: Dashboard, Categorías (productos agrupados por categoría) y Pedidos.
- Modo claro y oscuro.

## Almacenamiento

| Dónde | Clave / base | Contenido |
|---|---|---|
| `localStorage` | `servicom_group_db_v1` | Productos y pedidos |
| `localStorage` | `servicom_cart` | Carrito del cliente |
| `localStorage` | `servicom_favorites` | IDs de productos favoritos |
| `localStorage` | `servicom_recent` | IDs de productos vistos recientemente |
| `localStorage` | `servicom_theme` | Modo claro u oscuro |
| `sessionStorage` | `servicom_cart_notices` | Avisos del carrito de la sesión |
| IndexedDB | `servicom_group_images_v1` | Imágenes como `Blob` |

Las imágenes no se guardan en una carpeta del proyecto ni como Base64 en `localStorage`. El producto solo guarda referencias como `imgdb:123_icon`, lo que evita el error de cuota de `localStorage`. Si se encuentran imágenes antiguas en Base64, se migran solas a IndexedDB.

## Dimensiones de imágenes

- Icono: **600 × 400 px** (horizontal).
- Detalle: **800 × 1200 px** (vertical); se pueden subir varias.
- Las dimensiones son exactas: una imagen con otra resolución se rechaza.

---

# Resumen de funciones

## `scripts/servidor-dev.js`

| Función | Qué hace |
|---|---|
| `readPort()` | Lee el puerto desde `--port`, desde la variable `PORT` o usa 5173. |
| `send(res, status, body, type)` | Responde con el código, el contenido y el tipo indicados, sin caché. |
| `handle(req, res)` | Atiende cada petición: recarga automática, redirección de `/` a `/tienda/`, protección de rutas y archivos estáticos. |
| `serveFile(file, res)` | Lee un archivo y lo envía con su tipo MIME; en los HTML inserta el script de recarga automática. |
| `watchChanges()` | Vigila los archivos del proyecto y avisa a los navegadores abiertos para que se recarguen. |

## `compartido/js/datos.js`

| Elemento | Qué hace |
|---|---|
| `DB_KEY` | Clave de `localStorage` donde viven productos y pedidos. |
| `defaultProducts` / `defaultDB` | Productos y base de datos de demostración iniciales. |
| `getDB()` | Obtiene productos y pedidos desde `localStorage`; si no hay datos usa los de demostración. |
| `saveDB(db)` | Guarda productos y pedidos en `localStorage`. |

## `compartido/js/utilidades.js`

| Elemento | Qué hace |
|---|---|
| `$(selector)` | Atajo de `document.querySelector`. |
| `money(n)` | Da formato monetario peruano, por ejemplo `S/ 1899.90`. |
| `toast(msg, actionLabel, actionFn)` | Muestra una notificación flotante, con botón de acción opcional (por ejemplo "Ver carrito"). |

## `compartido/js/tema.js`

| Elemento | Qué hace |
|---|---|
| `THEME_KEY` | Clave donde se guarda la preferencia de tema. |
| `applyTheme(theme)` | Aplica el modo claro u oscuro y actualiza el icono y las etiquetas del interruptor (☀ / ☾). |
| `initTheme()` | Carga la preferencia guardada (o la del sistema) y conecta el interruptor. |

## `compartido/js/imagenes-db.js`

| Función | Qué hace |
|---|---|
| `openImageDB()` | Abre o crea la base IndexedDB `servicom_group_images_v1` y su almacén `images`. |
| `saveImageBlob(key, blob)` | Guarda una imagen como `Blob`, sin convertirla a Base64. |
| `getImageBlob(key)` | Recupera una imagen por su clave. |
| `dataURLToBlob(dataURL)` | Convierte una imagen Base64 antigua en `Blob`. |
| `migrateImagesToIndexedDB(dbKey)` | Mueve las imágenes antiguas de `localStorage` a IndexedDB y deja solo referencias en los productos. |

## `compartido/css/base.css`

Variables de diseño (colores, radios, sombras, tipografías), estilos base, botones, barra superior, interruptor de tema, modales genéricos, formularios (`.form-grid`), notificación `toast`, secciones y modo oscuro de esos elementos.

---

## Tienda

### `tienda/catalogo/imagenes.js`

| Función | Qué hace |
|---|---|
| `imageRef(p, mode)` | Elige la referencia de imagen del producto: `icon` para el catálogo o `detail` para el detalle. |
| `resolveImageRef(ref)` | Convierte una referencia `imgdb:*` en una URL temporal del `Blob` guardado en IndexedDB. |
| `productImage(p, cls, mode)` | Genera la etiqueta `<img>` de un producto (o su emoji si no tiene imagen). |
| `hydrateImages(root)` | Reemplaza las referencias `imgdb:*` de un contenedor por imágenes visibles. |

### `tienda/catalogo/catalogo.js`

| Función | Qué hace |
|---|---|
| `loadCategories()` | Llena el filtro de categorías con las que existen en el catálogo. |
| `sortProducts(list, sortBy)` | Ordena por precio, nombre o disponibilidad. |
| `productCardHTML(p)` | Construye la tarjeta de un producto: favorito, aviso de stock, ver producto y compra rápida. |
| `emptyStateHTML()` | Mensaje de "sin resultados" con botón para quitar filtros. |
| `resetFilters()` | Limpia búsqueda, categoría, orden y filtro de favoritos. |
| `updateSearchClearVisibility()` | Muestra u oculta la "×" del buscador según haya texto. |
| `renderProducts()` | Dibuja el catálogo respetando búsqueda, categoría, orden, favoritos y productos activos. |

### `tienda/catalogo/detalle.js`

| Función | Qué hace |
|---|---|
| `detailCarousel(p)` | Construye el carrusel con las imágenes de detalle (flechas y puntos si hay más de una). |
| `openProduct(id)` | Abre el detalle del producto, lo registra como visto y configura cantidad, carrusel, "Agregar al carrito" y "Comprar ahora". |

### `tienda/carrito/sincronizacion.js`

| Elemento | Qué hace |
|---|---|
| `cart` | Estado del carrito; cada ítem guarda el último precio y stock conocidos. |
| `cartNotices` | Historial de avisos visibles en el carrito. |
| `addCartNotice(message, type)` | Agrega un aviso (precio, stock o advertencia) a la parte superior del carrito. |
| `renderCartNotices()` | Dibuja los avisos en `#cartNotifications`. |
| `syncCartWithCatalog()` | Compara el carrito con el catálogo: avisa cambios de precio y stock, ajusta cantidades y retira productos inexistentes, inactivos o sin stock. |

### `tienda/carrito/carrito.js`

| Función | Qué hace |
|---|---|
| `FREE_SHIPPING_THRESHOLD` | Monto desde el cual el envío prioritario es gratis. |
| `saveCart()` | Sincroniza y guarda el carrito, y actualiza la interfaz. |
| `updateCount()` | Actualiza el contador del botón Carrito. |
| `addToCart(id, qty, silent)` | Agrega un producto validando el stock. |
| `quickAdd(id)` | Agrega 1 unidad desde la tarjeta del catálogo. |
| `changeQty(id, d)` | Sube o baja la cantidad sin superar el stock. |
| `removeFromCart(id)` | Elimina un producto del carrito. |
| `clearCart()` | Vacía el carrito previa confirmación. |
| `renderShippingProgress(total)` | Muestra cuánto falta para el envío prioritario gratis. |
| `renderCart()` | Dibuja productos, cantidades, total y progreso de envío. |
| `totalCart()` | Calcula el total con precios y stock actuales. |
| `openCart()` / `closeCart()` | Abren y cierran el carrito lateral. |

### `tienda/favoritos/favoritos.js`

| Función | Qué hace |
|---|---|
| `saveFavorites()` | Guarda los favoritos y actualiza el contador. |
| `isFavorite(id)` | Indica si un producto es favorito. |
| `updateFavCount()` | Actualiza el contador de favoritos de la barra superior. |
| `toggleFavorite(id)` | Agrega o quita un favorito y refresca catálogo, recientes y detalle. |
| `setOnlyFavorites(v)` | Activa o desactiva el filtro "solo favoritos". |

### `tienda/recientes/recientes.js`

| Función | Qué hace |
|---|---|
| `trackRecent(id)` | Registra un producto como visto (máximo 8, sin duplicados). |
| `renderRecent()` | Dibuja la franja "Vistos recientemente"; se oculta si no hay historial. |

### `tienda/compra/checkout.js`

| Función | Qué hace |
|---|---|
| `checkout()` | Abre el formulario de entrega (DNI, teléfono, nombre, correo, dirección). |
| `showPayment(c)` | Muestra el pago con tarjeta simulado; no se hace ningún cargo real. |
| `finishPayment(c)` | Registra el pedido, descuenta el stock, vacía el carrito y muestra el voucher. |
| `showVoucher(o)` | Muestra la constancia de compra simulada. |

### `tienda/pedidos/pedidos.js`

| Función | Qué hace |
|---|---|
| `reorder(orderId)` | Vuelve a agregar al carrito los productos de un pedido, respetando el stock actual. |
| `openOrders()` | Muestra el historial y el seguimiento: Confirmado → Despachando → Enviando → Entregado. |
| `closeAll()` | Cierra el carrito y todos los modales. |

### `tienda/principal.js`

Conecta los botones y campos de `tienda/index.html` con sus funciones (carrito, pedidos, buscador, categoría, orden, favoritos, cierre de modales y tecla Esc).

| Función | Qué hace |
|---|---|
| `initStore()` | Migra imágenes antiguas, carga categorías, contadores, catálogo, carrito y recientes. |

Además, cada segundo sincroniza el carrito con el catálogo para detectar cambios hechos desde el admin, y escucha el evento `storage` para reaccionar a cambios de otras pestañas.

### `tienda/css/tienda.css`

Portada, catálogo y tarjetas, carrito lateral, detalle y carrusel, checkout y voucher, pedidos, vistos recientemente, responsive y modo oscuro de la tienda.

---

## Administración

### `admin/panel/panel.js`

| Función | Qué hace |
|---|---|
| `LOW_STOCK_LIMIT` | Stock máximo (10) para considerar un producto con stock bajo. |
| `renderStats()` | Muestra los indicadores: productos, activos, pedidos y ventas demo. |
| `renderRecentOrders()` | Lista los 5 pedidos más recientes con total y estado. |
| `renderLowStock()` | Lista los productos con stock bajo o agotados. |
| `renderCategorySummary()` | Muestra por categoría la cantidad de productos y unidades en stock con barras. |
| `render()` | Actualiza todo el panel: dashboard, categorías, pedidos y contador del menú. |

También conecta el botón "Restaurar datos demo".

### `admin/panel/navegacion.js`

| Elemento | Qué hace |
|---|---|
| `ADMIN_VIEWS` | Pestañas disponibles: `dashboard`, `categorias` y `pedidos`. |
| `showView(name)` | Muestra la pestaña elegida, marca el enlace activo del menú lateral y oculta las demás. |

La pestaña activa se guarda en la URL (`#dashboard`, `#categorias`, `#pedidos`), así que se conserva al recargar.

### `admin/pedidos/pedidos.js`

| Función | Qué hace |
|---|---|
| `ORDER_STATUSES` | Estados de seguimiento: Confirmado, Despachando, Enviando, Entregado. |
| `renderOrdersTable()` | Dibuja la tabla de pedidos con su estado y detalle. |
| `updateOrderStatus(id, s)` | Cambia el estado de seguimiento de un pedido. |
| `updateOrdersBadge()` | Muestra en el menú cuántos pedidos aún no están entregados. |

### `admin/catalogo/productos.js`

| Función | Qué hace |
|---|---|
| `closedCategories` | Categorías que el administrador colapsó, para mantenerlas cerradas al refrescar. |
| `productRowHTML(p)` | Construye la fila de un producto con precio, stock y estado editables. |
| `renderCategoryGroups()` | Dibuja un grupo desplegable por categoría con su tabla de productos. |
| `updateProduct(id, k, v)` | Modifica precio, stock o estado activo; la tienda detecta el cambio automáticamente. |
| `deleteProduct(id)` | Elimina un producto previa confirmación. |

### `admin/catalogo/categorias.js`

| Función | Qué hace |
|---|---|
| `getCategories()` | Devuelve las categorías únicas, ordenadas alfabéticamente. |
| `loadProductCategories(selected)` | Llena el selector de categoría del formulario de producto. |
| `openCategoryModal()` | Abre la ventana para crear una categoría. |
| `closeCategoryModal()` | Cierra la ventana y limpia el campo. |
| `createCategory()` | Crea una categoría nueva, evita duplicados y la deja seleccionada. |

### `admin/catalogo/imagenes.js`

| Elemento | Qué hace |
|---|---|
| `ICON_WIDTH`, `ICON_HEIGHT` | Dimensión exacta del icono (600 × 400). |
| `DETAIL_WIDTH`, `DETAIL_HEIGHT` | Dimensión exacta de las imágenes de detalle (800 × 1200). |
| `detailImageFiles` | Lista de imágenes de detalle elegidas antes de guardar. |
| `saveProductImage(file, id, suffix)` | Guarda la imagen en IndexedDB y devuelve su referencia `imgdb:*`. |
| `validateImageDimensions(file, w, h)` | Comprueba que la imagen tenga exactamente las dimensiones requeridas. |
| `resetImageForm()` | Limpia el formulario y las vistas previas. |
| `previewCard(src, name, onRemove, kind)` | Crea una vista previa con botón "×" para quitar la imagen. |
| `handleIconSelection()` | Valida el icono y muestra su vista previa. |
| `handleDetailSelection()` | Valida y agrega varias imágenes de detalle. |
| `renderDetailPreviews()` | Dibuja las imágenes de detalle elegidas y permite quitarlas una por una. |

### `admin/catalogo/formulario-producto.js`

| Evento | Qué hace |
|---|---|
| Clic en "+ Nuevo producto" | Abre el formulario, carga categorías y limpia las imágenes. |
| Envío de `#productForm` | Valida datos e imágenes, guarda las imágenes en IndexedDB, crea el producto con sus referencias, actualiza el panel y confirma. |

### `admin/principal.js`

Migra imágenes antiguas a IndexedDB, conecta el cierre de modales (`data-close`) y hace el primer `render()` del panel.

### `admin/css/admin.css`

Menú lateral, títulos y tarjetas del panel, indicadores, tarjetas del dashboard, grupos por categoría, tablas, formulario de producto, selector de categoría, carga y vista previa de imágenes, ventana de nueva categoría, responsive y modo oscuro del admin.

---

## Cambios de la reorganización

- `app.js`, `admin.js`, `styles.css`, `theme.js` e `image-db.js` se repartieron por funcionalidad en las carpetas `tienda/`, `admin/` y `compartido/`.
- `getDB`, `saveDB`, `money`, `toast`, `$` y los productos de demostración estaban repetidos en `app.js` y `admin.js`; ahora hay una sola copia en `compartido/`.
- El admin ahora tiene menú lateral con tres pestañas (Dashboard, Categorías y Pedidos); los pedidos pasaron a `admin/pedidos/`.
- La función `render()` del admin se dividió en `renderStats`, `renderCategoryGroups` y `renderOrdersTable`, y `render()` las llama juntas.
- Se eliminaron todos los comentarios del código; esta documentación reemplaza a `DOCUMENTACION.md`.
- El resto de la lógica no se modificó.
