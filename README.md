# Sistema de ventas — Servicom Group

Web para catálogo, carrito, administración y pedidos, conectada a **Supabase** (PostgreSQL + Auth + Storage). Productos, pedidos e imágenes viven en la base de datos; en el navegador solo quedan el carrito, favoritos y preferencias.

## Conectar con Supabase (una sola vez)

1. **Crear las tablas:** Supabase → *SQL Editor* → *New query* → pega todo `supabase/schema.sql` → *Run*.
2. **Crear el administrador:** *Authentication → Users → Add user → Create new user* (correo y contraseña, marca *Auto Confirm User*). Luego, en el *SQL Editor*:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'TU_CORREO@ejemplo.com';
   ```
3. **Cerrar registros públicos:** *Authentication → Sign In / Providers* → desactiva *Allow new users to sign up*.
4. **Pegar las llaves:** en `compartido/js/supabase-config.js` pon la *Project URL* y la clave **publishable** (o *anon*) de *Project Settings → API Keys*. Nunca pongas aquí la clave `secret` / `service_role`.
5. Ejecuta `npm run dev` y abre `/admin/` para iniciar sesión.

La seguridad no depende de esconder la clave publishable: la protegen las políticas RLS definidas en `schema.sql` (el público solo lee productos activos y compra mediante `create_order`; solo el administrador escribe).

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
├── supabase/
│   └── schema.sql                   Tablas, seguridad (RLS), funciones y datos demo
├── scripts/
│   └── servidor-dev.js              Servidor de desarrollo (npm run dev)
├── compartido/                      Código usado por la tienda y por el admin
│   ├── css/base.css
│   └── js/
│       ├── supabase-config.js       URL y clave publishable de tu proyecto
│       ├── datos.js                 Conexión y acceso a Supabase
│       ├── utilidades.js
│       └── tema.js
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
- Administración con menú lateral y tres pestañas: Dashboard, Productos (listado completo con filtros por nombre, categoría y stock, y edición) y Pedidos.
- Modo claro y oscuro.

## Almacenamiento

| Dónde | Clave / nombre | Contenido |
|---|---|---|
| Supabase · tabla `products` | — | Productos (precio, stock, estado, URLs de imágenes) |
| Supabase · tabla `orders` | — | Pedidos con datos del cliente y detalle |
| Supabase · tabla `admins` | — | Usuarios con permiso de administrador |
| Supabase · Storage | bucket `product-images` | Iconos e imágenes de detalle |
| `localStorage` | `servicom_my_orders` | "Llaves" de los pedidos del cliente en este navegador |
| `localStorage` | `servicom_cart` | Carrito del cliente |
| `localStorage` | `servicom_favorites` | IDs de productos favoritos |
| `localStorage` | `servicom_recent` | IDs de productos vistos recientemente |
| `localStorage` | `servicom_theme` | Modo claro u oscuro |
| `sessionStorage` | `servicom_cart_notices` | Avisos del carrito de la sesión |

Los pedidos se crean con la función SQL `create_order`, que recalcula precios y descuenta stock en el servidor. Cada cliente ve solo sus pedidos gracias a una llave (`access_token`) guardada en su navegador. El catálogo se refresca cada 10 s y el admin cada 15 s.

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
| `sb` | Cliente de Supabase (`null` si falta configurar `supabase-config.js`). |
| `defaultProducts` | Productos de demostración (usados por "Restaurar datos demo"). |
| `getDB()` | Devuelve productos y pedidos desde la memoria (rápido, síncrono). |
| `initDB(scope)` / `refreshDB()` | Define si la página es `tienda` o `admin` y descarga los datos de Supabase; devuelve `true` si algo cambió. |
| `apiInsertProduct` / `apiPatchProduct` / `apiDeleteProduct` | Crear, modificar y eliminar productos (solo administrador). |
| `apiUpdateOrderStatus(id, status)` | Cambia el estado de un pedido (solo administrador). |
| `apiCreateOrder(customer, items)` | Crea el pedido con la función `create_order` y recuerda su llave. |
| `apiResetDemo()` | Borra pedidos y productos y recarga los 10 productos demo. |

## `compartido/js/utilidades.js`

| Elemento | Qué hace |
|---|---|
| `$(selector)` | Atajo de `document.querySelector`. |
| `money(n)` | Da formato monetario peruano, por ejemplo `S/ 1899.90`. |
| `escapeHTML(v)` | Escapa texto para insertarlo en HTML sin riesgo (datos de clientes, nombres). |
| `toast(msg, actionLabel, actionFn)` | Muestra una notificación flotante, con botón de acción opcional (por ejemplo "Ver carrito"). |

## `compartido/js/tema.js`

| Elemento | Qué hace |
|---|---|
| `THEME_KEY` | Clave donde se guarda la preferencia de tema. |
| `applyTheme(theme)` | Aplica el modo claro u oscuro y actualiza el icono y las etiquetas del interruptor (☀ / ☾). |
| `initTheme()` | Carga la preferencia guardada (o la del sistema) y conecta el interruptor. |

## `compartido/css/base.css`

Variables de diseño (colores, radios, sombras, tipografías), estilos base, botones, barra superior, interruptor de tema, modales genéricos, formularios (`.form-grid`), notificación `toast`, secciones y modo oscuro de esos elementos.

---

## Tienda

### `tienda/catalogo/imagenes.js`

| Función | Qué hace |
|---|---|
| `imageRef(p, mode)` | Elige la referencia de imagen del producto: `icon` para el catálogo o `detail` para el detalle. |
| `resolveImageRef(ref)` | Devuelve la URL pública de la imagen guardada en Supabase Storage. |
| `productImage(p, cls, mode)` | Genera la etiqueta `<img>` de un producto (o su emoji si no tiene imagen). |
| `hydrateImages(root)` | Carga las imágenes de un contenedor desde sus URLs. |

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
| `initStore()` | Carga los datos de Supabase, categorías, contadores, catálogo, carrito y recientes. |

Además, cada segundo sincroniza el carrito con el catálogo en memoria, y cada 10 s (o al volver a la pestaña) vuelve a descargar el catálogo de Supabase para detectar cambios de precio y stock.

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
| `render()` | Actualiza todo el panel: dashboard, tabla de productos, pedidos y contador del menú. |

También conecta el botón "Restaurar datos demo".

### `admin/panel/navegacion.js`

| Elemento | Qué hace |
|---|---|
| `ADMIN_VIEWS` | Pestañas disponibles: `dashboard`, `productos` y `pedidos` (el enlace antiguo `#categorias` redirige a `productos`). |
| `showView(name)` | Muestra la pestaña elegida, marca el enlace activo del menú lateral y oculta las demás. |

La pestaña activa se guarda en la URL (`#dashboard`, `#productos`, `#pedidos`), así que se conserva al recargar.

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
| `normalizeText(v)` | Normaliza texto (minúsculas y sin tildes) para buscar. |
| `productRowHTML(p)` | Construye la fila de un producto: categoría, precio, stock (con etiqueta "Bajo" o "Agotado"), estado, Editar y Eliminar. |
| `loadFilterCategories()` | Llena el filtro de categorías conservando la selección actual. |
| `getFilteredProducts()` | Devuelve los productos que cumplen nombre, categoría y stock (bajo = 10 o menos, alto = más de 10), ordenados por nombre. |
| `renderProductsTable()` | Dibuja la tabla única de productos con el contador "Mostrando X de Y". |
| `clearProductFilters()` | Limpia los tres filtros. |
| `updateProduct(id, k, v)` | Modifica precio, stock o estado activo (valida números); la tienda detecta el cambio automáticamente. |
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
| `saveProductImage(file, folder, suffix)` | Sube la imagen al bucket `product-images` y devuelve su URL pública. |
| `validateImageDimensions(file, w, h)` | Comprueba que la imagen tenga exactamente las dimensiones requeridas. |
| `resetImageForm()` | Limpia el formulario y las vistas previas. |
| `previewCard(src, name, onRemove, kind)` | Crea una vista previa con botón "×" para quitar la imagen. |
| `handleIconSelection()` | Valida el icono y muestra su vista previa. |
| `handleDetailSelection()` | Valida y agrega varias imágenes de detalle. |
| `renderDetailPreviews()` | Dibuja las imágenes de detalle elegidas y permite quitarlas una por una. |

### `admin/catalogo/formulario-producto.js`

| Evento | Qué hace |
|---|---|
| `editingProductId` | Id del producto que se está editando (`null` cuando se crea uno nuevo). |
| `setProductFormMode(editing)` | Cambia título, texto del botón y nota de imágenes del formulario según sea crear o editar. |
| `editProduct(id)` | Abre el formulario con los datos del producto cargados. |
| Clic en "+ Nuevo producto" | Abre el formulario vacío, carga categorías y limpia las imágenes. |
| Envío de `#productForm` | Valida datos e imágenes y guarda: crea el producto, o actualiza el existente (si no se eligen imágenes nuevas conserva las actuales). |

### `admin/principal.js`

Muestra el login (Supabase Auth), comprueba con `is_admin()` que el usuario sea administrador, carga los datos, refresca cada 15 s y gestiona "Cerrar sesión".

### `admin/css/admin.css`

Menú lateral, títulos y tarjetas del panel, indicadores, tarjetas del dashboard, filtros y tabla de productos, tablas, formulario de producto, selector de categoría, carga y vista previa de imágenes, ventana de nueva categoría, responsive y modo oscuro del admin.

---

## Cambios de la reorganización

- `app.js`, `admin.js`, `styles.css`, `theme.js` e `image-db.js` se repartieron por funcionalidad en las carpetas `tienda/`, `admin/` y `compartido/`.
- `getDB`, `saveDB`, `money`, `toast`, `$` y los productos de demostración estaban repetidos en `app.js` y `admin.js`; ahora hay una sola copia en `compartido/`.
- El admin ahora tiene menú lateral con tres pestañas (Dashboard, Categorías y Pedidos); los pedidos pasaron a `admin/pedidos/`.
- La función `render()` del admin se dividió en `renderStats`, `renderCategoryGroups` y `renderOrdersTable`, y `render()` las llama juntas.
- Se eliminaron todos los comentarios del código; esta documentación reemplaza a `DOCUMENTACION.md`.
- El resto de la lógica no se modificó.
- La pestaña "Categorías" pasó a ser "Productos": en lugar de grupos por categoría, ahora hay una sola tabla con todos los productos, filtros por nombre, categoría y stock (bajo/alto) y un botón Editar que abre el formulario con los datos del producto. `renderCategoryGroups` se reemplazó por `renderProductsTable`.
