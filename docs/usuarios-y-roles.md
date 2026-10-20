# Usuarios y permisos del equipo

Se usa **Supabase Auth** para correo/contraseña y **`public.user_roles`** para los permisos. Las cuentas del equipo entran por el mismo `/admin/`; no hay un selector de rol en el formulario.

| Rol en la base | Nombre en pantalla | Apartados |
|---|---|---|
| `admin` | Administrador | Dashboard, Productos, Pedidos, Atención, Empleados y Contabilidad. |
| `employee` | Empleado | Pedidos y Atención. |
| `accountant` | Contable | Dashboard y Contabilidad. |

Puedes crear varias cuentas por rol, cada una con su correo y contraseña. Crear una cuenta de Auth por sí solo no concede acceso.

## 1. Activar los permisos

En **Supabase → SQL Editor**, ejecuta completo [supabase/roles.sql](../supabase/roles.sql). Necesita las tablas originales y los módulos anteriores. Para una instalación nueva, el orden es:

1. `supabase/schema.sql`
2. `supabase/soporte.sql`
3. `supabase/gestion_empresarial.sql`
4. **`supabase/roles.sql`, siempre al final.**

Si ya tienes los tres primeros instalados, sólo necesitas ejecutar `roles.sql`. Es una migración transaccional y repetible: conserva los productos, pedidos, conversaciones, empleados y contabilidad. Copia los administradores existentes de `public.admins` a `user_roles` con rol `admin`, conservando el acceso del dueño. No crea cuentas de Auth, no agrega contraseñas y no asigna roles al resto de usuarios.

Si vuelves a ejecutar alguno de los tres esquemas anteriores, ejecuta nuevamente `roles.sql` al terminar: los esquemas anteriores contienen los permisos originales de administrador. La web admite al dueño con el esquema anterior y muestra un aviso de activación; los accesos de empleado y contable requieren esta migración.

## 2. Crear las cuentas cuando estés listo

En **Supabase → Authentication → Users → Add user / Create new user**, crea las cuentas con los correos reales y sus contraseñas. Para cuentas creadas manualmente, confirma el correo con la opción correspondiente o completa la verificación de Supabase. Mantén deshabilitado el registro público para cuentas del equipo.

Después abre **SQL Editor**, reemplaza los correos de ejemplo y ejecuta:

```sql
-- El dueño existente ya conserva su acceso. Usa esta línea si creas otro dueño:
select public.assign_staff_role('dueno@tuempresa.com', 'admin');

-- Empleado: únicamente Pedidos y Atención.
select public.assign_staff_role('empleado@tuempresa.com', 'employee');

-- Contable: únicamente Dashboard y Contabilidad.
select public.assign_staff_role('contable@tuempresa.com', 'accountant');
```

La función comprueba que el correo exista en Auth; si no lo encuentra, no asigna nada. Puedes asignar un correo por vez. Usa los valores `admin`, `employee` y `accountant` exactamente como aparecen aquí.

Las asignaciones se realizan desde SQL Editor o un entorno confiable con `service_role`. Ninguna cuenta de la web, incluido el dueño, puede modificar roles mediante la API pública del navegador. Nunca pegues una clave `service_role` en el frontend. No uses `user_metadata` para conceder permisos.

Consulta las asignaciones desde SQL Editor:

```sql
select u.email, r.role, r.active, r.updated_at
from public.user_roles r
join auth.users u on u.id = r.user_id
order by u.email;
```

## 3. Acceso y funciones

Al entrar, el menú muestra el rol y el correo. El dueño y el contable comienzan en Dashboard; el empleado en Pedidos. Los enlaces directos a apartados restringidos llevan al primer apartado permitido. Las cuentas sin rol activo permanecen en el inicio de sesión.

El empleado puede consultar los datos necesarios para preparar los pedidos, cambiar su estado, exportar e imprimir constancias, responder consultas y cerrarlas o reabrirlas. No puede cambiar clientes, importes, productos, inventario, empleados ni contabilidad; tampoco obtiene las llaves privadas de pedidos o conversaciones.

El contable tiene las funciones del módulo contable, incluidos asientos, cobros/pagos, reversiones y cierre/reapertura. Su dashboard muestra indicadores, gráficos, inventario de consulta y actividad por día. Obtiene datos resumidos desde una función del servidor, sin descargar clientes, direcciones, identificadores ni llaves de pedidos. El CSV del dashboard contable contiene fecha, cantidad de pedidos y total diario. No aparecen botones para modificar productos, gestionar pedidos o restaurar datos de demostración.

Los límites se aplican también en PostgreSQL mediante RLS, privilegios de columnas y validaciones de RPC. Ocultar el menú no es la medida que protege los datos. El catálogo público de productos activos y las funciones de compra/seguimiento de clientes siguen disponibles como antes.

## Ficha laboral y cuenta de acceso

`public.employees` guarda la ficha laboral; `auth.users` guarda la cuenta. Vincularlas es opcional y no concede permisos. Puedes enlazarlas desde SQL Editor:

```sql
update public.employees
set user_id = (select id from auth.users where lower(email) = 'empleado@tuempresa.com')
where document_number = 'DOCUMENTO_REAL';
```

Reemplaza correo y documento por valores reales. Una cuenta puede vincularse a una sola ficha. El empleado sigue teniendo acceso sólo a Pedidos y Atención; las fichas y remuneraciones permanecen reservadas al dueño.

## Cambiar o revocar permisos

Para cambiar un rol, vuelve a ejecutar `assign_staff_role` con el mismo correo y el nuevo rol. Para desactivar el acceso, usa el tercer argumento:

```sql
select public.assign_staff_role('empleado@tuempresa.com', 'employee', false);
-- Reactivar:
select public.assign_staff_role('empleado@tuempresa.com', 'employee', true);
```

La base aplica los cambios en la siguiente operación, incluso si el usuario conserva una sesión abierta. La web comprueba el rol cada 15 segundos y recarga la sesión si cambió. Las asignaciones y revocaciones quedan en `public.staff_role_history`, visible sólo para el dueño.

## Pruebas locales

`npm test` comprueba la matriz de apartados y la carga mínima de datos. Las pruebas opcionales usan PostgreSQL local mediante PGlite, sin escribir en tu Supabase:

```bash
SERVICOM_PGLITE_PATH=/ruta/a/@electric-sql/pglite node scripts/probar-roles-sql.cjs
# Con npm run dev activo, Playwright y Chromium disponibles:
SERVICOM_PGLITE_PATH=/ruta/a/@electric-sql/pglite node scripts/probar-roles-navegador.cjs
```

El navegador de pruebas admite `SERVICOM_PLAYWRIGHT_PATH` y `SERVICOM_CHROMIUM_PATH`.
