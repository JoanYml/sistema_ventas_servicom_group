# Servicom Group

Sistema web de venta de productos tecnológicos y gestión administrativa. La tienda y el panel están desarrollados con HTML, CSS y JavaScript. Supabase proporciona la base de datos PostgreSQL, la autenticación y el almacenamiento de imágenes; Vercel aloja la página y la función de administración de cuentas.

## Funciones

- Tienda con búsqueda, categorías, filtros, favoritos y detalle de productos.
- Carrito con cantidades y avisos de cambios de precio y disponibilidad.
- Registro de pedidos con datos de entrega, pago simulado y seguimiento.
- Chat de preguntas frecuentes con respuestas programadas y atención de un encargado.
- Dashboard con ventas, pedidos, ticket promedio, gráficos e inventario.
- Gestión de productos, pedidos, empleados, usuarios y permisos.
- Contabilidad con ingresos automáticos por ventas, compras manuales, reportes y cierres mensuales.
- Historial de acciones del equipo, con búsqueda y filtros por usuario, rol y apartado.
- Diseño adaptable a celulares y modo claro u oscuro.

El pago y las constancias de compra son simulados. No se realizan cargos bancarios ni se emiten comprobantes tributarios.

## Instalación de Supabase

En el SQL Editor del proyecto, ejecuta completos los archivos en este orden:

1. [schema.sql](supabase/schema.sql): productos, pedidos, imágenes y catálogo inicial.
2. [soporte.sql](supabase/soporte.sql): conversaciones y atención al cliente.
3. [gestion_empresarial.sql](supabase/gestion_empresarial.sql): empleados, sucursales y contabilidad.
4. [roles.sql](supabase/roles.sql): permisos del equipo.
5. [ventas_contabilidad.sql](supabase/ventas_contabilidad.sql): ingresos automáticos de pedidos y compras manuales.
6. [usuarios_auditoria.sql](supabase/usuarios_auditoria.sql): administración de cuentas e historial de acciones.

Si reinstalas un módulo anterior, vuelve a ejecutar los posteriores en el mismo orden. Subir archivos a GitHub o desplegar en Vercel no ejecuta estos SQL.

En **Authentication → Users**, crea la cuenta del dueño y asigna su rol desde el SQL Editor:

```sql
select public.assign_staff_role('dueño@tuempresa.com', 'admin');
```

Desactiva el registro público de nuevas cuentas en la configuración de Supabase Auth. Las cuentas del equipo se administran desde el panel.

En [compartido/js/supabase-config.js](compartido/js/supabase-config.js), configura la URL del proyecto y su clave pública `publishable` o `anon`. La clave privada `service_role` se configura exclusivamente en el servidor.

## Ejecutar en local

Se requiere Node.js 20 o superior. El servidor utiliza las bibliotecas incluidas en Node.js y no necesita dependencias adicionales.

```bash
npm run dev
```

- Tienda: http://localhost:5173/tienda/
- Administración: http://localhost:5173/admin/

Para usar otro puerto:

```bash
npm run dev -- --port 3000
```

El servidor recarga la página al guardar cambios. Crear cuentas y restablecer contraseñas requiere las variables privadas indicadas en la siguiente sección. En local se pueden guardar en `.env.local`, que está excluido de Git, y cargar con Node.js 20.6 o superior:

```bash
node --env-file=.env.local scripts/servidor-dev.js
```

## Configuración de Vercel

Para administrar cuentas desde el panel, agrega estas variables al entorno **Production** y vuelve a desplegar:

| Variable | Contenido |
| --- | --- |
| `SUPABASE_URL` | URL base HTTPS del mismo proyecto de Supabase, sin rutas adicionales. |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave privada `service_role` del proyecto. Configúrala como Secret. |

La función [api/staff-users.js](api/staff-users.js) valida la sesión y el rol de administrador antes de crear cuentas o cambiar contraseñas. La clave privada no se incluye en los archivos del navegador.

## Accesos del equipo

| Rol | Apartados disponibles |
| --- | --- |
| Administrador | Dashboard, Productos, Pedidos, Atención, Empleados, Contabilidad y Usuarios. |
| Empleado | Pedidos y Atención. |
| Contable | Dashboard y Contabilidad. |

Las cuentas se autentican con Supabase Auth. La tabla `user_roles` guarda sus permisos; Supabase comprueba el acceso en cada operación. El contable recibe un dashboard agregado sin datos personales de los pedidos.

Una ficha de Empleados es independiente de una cuenta de acceso. Las sucursales iniciales son Chimbote y Nuevo Chimbote.

## Datos y almacenamiento

Los productos, pedidos, conversaciones, empleados y movimientos contables se guardan en Supabase. Las imágenes utilizan el bucket `product-images`.

El navegador conserva el carrito, favoritos, productos vistos y preferencias en `localStorage`. También guarda las llaves necesarias para recuperar los pedidos y la conversación de ese navegador. Los avisos temporales del carrito se guardan en `sessionStorage`.

Los pedidos se registran mediante `create_order`, que valida los datos, recalcula los precios y descuenta stock en una transacción. Sus ingresos se contabilizan en **Ingreso general**, sin asignarlos a una sucursal. Las compras y los gastos se registran manualmente.

El dashboard permite consultar los últimos 7, 30 o 90 días y compararlos con el período anterior. Las fechas utilizan la zona horaria `America/Lima`. Los indicadores de inventario y pedidos pendientes incluyen todo el historial.

## Imágenes y características

En Administración → Productos se pueden cargar imágenes y completar las características técnicas del producto, una por línea, como `Marca: ...` o `Memoria RAM: ...`.

- Imagen del catálogo: 600 × 400 píxeles.
- Imágenes de detalle: 800 × 1200 píxeles; se admite más de una.
- Logo de la página: [compartido/imagenes/logo-servicom.png](compartido/imagenes/logo-servicom.png).

## Organización

| Carpeta | Contenido |
| --- | --- |
| `tienda/` | Catálogo, carrito, compra, pedidos y chat del cliente. |
| `admin/` | Panel administrativo y sus apartados. |
| `compartido/` | Estilos, configuración y funciones comunes. |
| `api/` | Función de servidor para administrar cuentas. |
| `supabase/` | Instalación de la base de datos y carga opcional de ventas. |
| `scripts/` | Servidor de desarrollo local. |
| `docs/` | Guías de configuración y uso. |

## Guías

- [Usuarios, roles y permisos](docs/usuarios-y-roles.md).
- [Administración de cuentas e historial](docs/usuarios-del-panel.md).
- [Empleados y contabilidad](docs/gestion-empresarial.md).
- [Ventas y compras](docs/ventas-y-compras.md).
- [Carga opcional de 120 ventas de demostración](docs/ventas-de-demostracion.md).
