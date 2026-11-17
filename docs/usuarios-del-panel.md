# Usuarios del panel e historial de acciones

El dueño dispone de **Usuarios** en el menú administrativo. Puede crear cuentas de administrador, empleado o contable, buscar por nombre/correo/identificador, filtrar por rol y acceso, editar permisos, desactivar/reactivar y restablecer contraseñas. El empleado conserva sólo Pedidos y Atención; el contable sólo Dashboard y Contabilidad.

## Activación en el proyecto existente

1. En Supabase → SQL Editor, ejecuta **completo `supabase/usuarios_auditoria.sql`**, después de `ventas_contabilidad.sql`. Si ya estaban instalados los módulos anteriores, éste es el único SQL nuevo.
2. En Vercel → tu proyecto → Settings → Environment Variables, configura estas variables **del servidor** para el entorno de producción:
   - `SUPABASE_URL`: la URL de **ese mismo proyecto** de Supabase.
   - `SUPABASE_SERVICE_ROLE_KEY`: la clave privada `service_role`, disponible en las claves API de Supabase. No uses la clave publicable en esta variable.
3. Vuelve a desplegar en Vercel para que la función `/api/staff-users` reciba las variables. El proyecto incorpora una función Node.js de Vercel; no hay que instalar una Edge Function.
4. Entra con el dueño y abre Usuarios. Al tener SQL y servidor activos se habilita **Crear usuario**. Si faltan las variables, la consulta, los permisos y los logs siguen funcionando, y se muestra que el servicio de creación todavía no está disponible.

Nunca pegues la clave privada en `compartido/js/supabase-config.js`, en el navegador, en GitHub o en un mensaje. Esa configuración del frontend conserva exclusivamente la URL y la clave publicable. Las claves del servidor no se devuelven al navegador.

### Si Crear usuario sigue deshabilitado

Pulsa **Actualizar** en Usuarios. El aviso muestra el motivo de la comprobación del servidor:

- **Falta configurar una variable**: guárdala con el nombre exacto indicado en Production y vuelve a desplegar. Las variables nuevas no se aplican a un despliegue ya publicado.
- **No se encontró `/api/staff-users`** o no respondió como una función: despliega la última versión de `main` y comprueba que el dominio apunte a ese despliegue. Revisa que la configuración de salida de Vercel incluya la función de `api/staff-users.js`.
- **Supabase rechazó la clave**: utiliza la clave privada `service_role` del mismo proyecto de Supabase. Guarda el cambio y vuelve a desplegar.
- **Supabase rechazó la sesión**: cierra sesión y entra otra vez. Si continúa, comprueba que la URL configurada en Vercel sea la del proyecto que utiliza la tienda.
- **URL no válida**: usa la URL base del proyecto, sin `/rest/v1`, sin rutas adicionales ni parámetros.
- **No se pudo comprobar el rol**: revisa la instalación de los SQL en el mismo proyecto y entra con un administrador activo.

El aviso permite compartir el motivo sin copiar claves privadas ni sesiones. Consultar el listado y cambiar permisos puede funcionar aunque la función de creación aún no esté configurada.

En una instalación nueva, el orden es:

`schema.sql` → `soporte.sql` → `gestion_empresarial.sql` → `roles.sql` → `ventas_contabilidad.sql` → **`usuarios_auditoria.sql` al final**.

Si reinstalas una migración anterior, vuelve a ejecutar las posteriores en este orden. Publicar archivos no ejecuta SQL en Supabase.

## Crear y mantener una cuenta

Pulsa Crear usuario, completa nombre, correo, rol y contraseña inicial (12 a 128 caracteres), y confirma la contraseña. La cuenta se crea en Supabase Auth y recibe su acceso en la base de datos. Se confirma su correo desde la operación administrativa, como al crearla manualmente desde Auth: no depende de un servicio de correo o invitaciones configurado. Comparte las credenciales con la persona por un canal privado.

Crear otra cuenta no cambia la sesión del dueño. **No se usa signUp desde el cliente** ni se permite que un usuario elija su propio rol al iniciar sesión. El registro público de Auth debe seguir deshabilitado.

En Editar acceso se cambia el nombre mostrado, el rol o el estado. El correo no se edita desde esta pantalla. Las cuentas ya existentes en Auth aparecen, incluidas las que están Sin rol; el dueño puede darles acceso sin volver a crearlas. La ficha laboral de Empleados es independiente y no se crea automáticamente.

Desactivar conserva la cuenta y sus registros. PostgreSQL revoca el acceso en la siguiente operación, aunque la sesión siga abierta; la interfaz comprueba el rol cada 15 segundos y vuelve al inicio de sesión. No se ofrece borrar cuentas desde el panel. El dueño no puede quitar su propio rol/acceso, y la base impide dejar al sistema sin un administrador activo. Un control de versión rechaza cambios sobre una cuenta que otro administrador ya modificó.

Selecciona una cuenta → Restablecer contraseña para reemplazarla. La contraseña anterior dejará de funcionar; no se muestra ni se recupera. Las contraseñas no se guardan en tablas de auditoría ni en localStorage y se limpian de los formularios al cerrar o enviar.

## Buscar un usuario y ver sus logs

1. Filtra las cuentas por **Rol actual** y Acceso, o escribe su nombre/correo.
2. Pulsa **Ver actividad**.
3. En **Acciones realizadas** aparecen los eventos cuyo autor es esa cuenta.
4. En **Cambios en su cuenta** aparecen altas, cambios de rol/acceso, nombre y solicitudes de contraseña realizadas por los administradores sobre ella.
5. Filtra por fechas, apartado o **Rol al realizar la acción**. Este último es el rol guardado en el evento, aunque la cuenta ahora tenga otro.
6. Pulsa **Ver todo el equipo** para volver al historial general. Ambos listados tienen paginación en el servidor: 25 cuentas y 30 eventos por página.

Los procesos automáticos se identifican como **Sistema**. Las fechas se filtran según America/Lima. Ver cambios muestra información permitida: por ejemplo, estado anterior/nuevo del pedido, stock/precio, campos de producto modificados, cuenta o período contable.

## Qué registra el historial

- Cuentas: solicitud y resultado de creación/restablecimiento, cambios de rol, acceso y nombre.
- Productos: altas, modificaciones y eliminaciones por cuentas del equipo.
- Pedidos: cambios de estado.
- Atención: respuestas del equipo (identificador y longitud, sin el mensaje) y cierre/reapertura.
- Empleados: creación, edición, situación y traslado de ficha.
- Contabilidad: asientos, reversiones, cierres/reaperturas y otras acciones del registro contable existente.
- Sesión: entrada al panel y cierre explícito desde la aplicación, mediante una RPC que sólo admite el usuario autenticado. Son eventos de la aplicación, no sustituyen los registros de seguridad de Supabase Auth; un corte de red o cierre del navegador puede impedir el aviso de salida.

Los cambios de datos se registran con triggers del servidor, aunque no se use la interfaz habitual. No se registra cada clic, navegación ni lectura/exportación de datos. Los descuentos de stock anónimos no se atribuyen a un empleado. Los asientos automáticos de ventas quedan como Sistema.

El historial empieza **al instalar esta migración**; no se inventan eventos pasados. Los historiales anteriores de empleados, roles y contabilidad se conservan en sus módulos originales. Cada evento conserva identidad y rol de su autor en ese momento. No se copian contraseñas, llaves de pedidos/conversaciones, cuerpos de mensajes, datos completos de clientes ni remuneraciones.

El historial es sólo de consulta desde la aplicación: el dueño no puede reescribirlo ni borrarlo por la API pública. El propietario de la base y el servidor con `service_role` siguen siendo entornos de confianza con privilegios administrativos.

## Consistencia de creación y contraseñas

Auth y PostgreSQL son servicios distintos: no forman una única transacción. Antes de llamar a Auth se guarda una solicitud en `staff_auth_operations` sin contraseña. Su resultado final también queda registrado. Repetir una solicitud ya terminada no crea otra cuenta ni vuelve a cambiar una contraseña.

Si se corta la conexión, no se repite automáticamente una operación cuyo resultado no se conoce. Actualiza Usuarios y busca el correo. Si una creación quedó en Auth pero sin rol, el dueño puede completar su acceso con Editar acceso. Si falla la asignación después de una creación confirmada, el servidor intenta eliminar únicamente la cuenta nueva que acaba de crear; si no logra compensar, esa cuenta sigue sin acceso hasta que el dueño la revise.

Una contraseña podría haber cambiado aunque falle la confirmación final. En ese caso la aplicación lo indica y conserva la solicitud para revisarla. El historial distingue solicitudes, resultados confirmados y resultados no confirmados; no los presenta todos como operaciones exitosas.

## Desarrollo local

Sin credenciales privadas se puede revisar la interfaz y gestionar roles/logs sobre una base preparada; crear cuentas requiere el servidor configurado. Para probar localmente esa función, guarda las dos variables anteriores en `.env.local` (ignorado por Git) y, con Node.js 20.6 o superior, ejecuta:

```bash
node --env-file=.env.local scripts/servidor-dev.js
```

El servidor local bloquea rutas de archivos ocultos y sirve `/api/staff-users` como una función, sin publicar su código o `.env.local`. En Vercel se utilizan sus variables de entorno, no ese archivo.
