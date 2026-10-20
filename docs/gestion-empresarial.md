# Empleados y contabilidad

## Activación en tu Supabase

1. Debe estar instalado el esquema original de `supabase/schema.sql` y tu usuario debe figurar en `public.admins`.
2. Abre **Supabase → SQL Editor → New query**. Copia y ejecuta **todo** el archivo [gestion_empresarial.sql](../supabase/gestion_empresarial.sql). Incluye tablas, funciones, permisos, cuentas iniciales y las sucursales **Chimbote** y **Nuevo Chimbote**.
3. Inicia sesión en `/admin/` y abre **Empleados** o **Contabilidad**. Si ya estabas dentro, pulsa **Actualizar**.

Este script no borra productos ni pedidos, no crea empleados ficticios y se puede volver a ejecutar. La web explica cómo activar el módulo si faltan sus tablas. No se ha aplicado automáticamente a tu base remota: ejecútalo en tu proyecto de Supabase.

## Qué agregar a la base para que aparezcan tus empleados

Los empleados se guardan en **`public.employees`**. Cada ficha necesita:

| Columna | Qué colocar |
|---|---|
| `full_name` | Nombre y apellidos reales, de 2 a 120 caracteres. |
| `document_number` | DNI o documento único, de 6 a 20 letras/números/guiones. Guárdalo como texto para conservar ceros iniciales. |
| `job_title` | Cargo, por ejemplo asesor de ventas o cajero. |
| `branch_id` | UUID de Chimbote o Nuevo Chimbote, tomado de `branches`. |

Consulta primero los identificadores de las dos sucursales:

```sql
select id, code, name
from public.branches
order by name;
```

Puedes cargar las fichas desde **Table Editor → employees → Insert row / Import CSV**, o desde **Administración → Empleados → Nuevo empleado**. Para importar CSV utiliza los encabezados de [empleados-plantilla.csv](empleados-plantilla.csv) y agrega tus filas con el UUID de la sucursal correspondiente.

También puedes usar SQL. Este es un ejemplo para adaptar con datos reales antes de ejecutarlo:

```sql
insert into public.employees
  (full_name, document_number, job_title, branch_id)
select
  'NOMBRE Y APELLIDOS REALES',
  'DOCUMENTO_REAL',
  'CARGO REAL',
  id
from public.branches
where code = 'NUEVO_CHIMBOTE'; -- O 'CHIMBOTE'
```

Los campos opcionales son `email`, `phone`, `hire_date`, `status`, `base_salary` y `notes`. Si los omites, la fecha de ingreso toma el día actual de Perú, la situación es `active`, el salario queda sin registrar y los textos vacíos. Si conoces la fecha real de ingreso, inclúyela con formato `AAAA-MM-DD`. Las situaciones admitidas son `active` (activo), `leave` (de licencia) e `inactive` (inactivo).

Deja que la base genere `id`, `employee_code`, `version`, `created_at` y `updated_at`. El documento no puede repetirse. Cada alta o cambio genera historial, incluso si se hace desde el SQL Editor. Los códigos de sucursal se resuelven a UUID; no pongas el nombre de la sucursal en `branch_id`.

**Al guardar en la base, las fichas aparecerán al abrir Empleados, al pulsar Actualizar o en la siguiente actualización automática (15 segundos mientras el apartado está visible).** El apartado permite buscar, filtrar por sucursal y situación, editar fichas, trasladar empleados, consultar historial y exportar el listado CSV. La remuneración base se ve en la ficha y no se incluye en esa exportación.

Una ficha de empleado no crea una cuenta de inicio de sesión. Sólo los administradores tienen acceso a empleados, historial y contabilidad. El salario es informativo: no genera planillas ni pagos automáticos. Usa la situación Inactivo para conservar el historial al dar de baja a una persona.

## Operar la contabilidad

Todos los importes están en **PEN / soles**, con hasta dos decimales. Selecciona sucursal y rango, y pulsa **Aplicar**. Hay una vista consolidada de ambas sucursales. El rango afecta al resumen, diario y reportes; los documentos muestran **saldos pendientes actuales de todas las fechas**, según la sucursal elegida.

- **Resumen:** ingresos y gastos devengados, resultado, caja y bancos, comparación mensual y resultado por sucursal.
- **Ingreso / gasto:** registra ingresos cobrados o gastos pagados; elige caja/banco y la cuenta correspondiente. También permite transferir entre caja y banco dentro de la misma sucursal.
- **Libro diario:** consulta los asientos, su detalle y su exportación CSV con líneas de Debe/Haber. Registra asientos manuales para apertura, costos, tributos, remuneraciones u otros ajustes. Debe y Haber deben cuadrar.
- **Documentos:** registra cuentas por cobrar a clientes y por pagar a proveedores. Admite abonos parciales, controla el saldo, identifica vencimientos y conserva el historial de cobros/pagos. No admite pagar/cobrar por encima del saldo.
- **Reportes:** balance de comprobación con saldos iniciales/movimientos/finales, estado de resultados del período y situación patrimonial a la fecha. Exportación de balance CSV e impresión de los tres reportes.
- **Cuentas:** plan inicial con caja, bancos, clientes, proveedores, capital, inventario al costo, tributos, remuneraciones, ingresos y gastos. Permite agregar cuentas con su clasificación.
- **Períodos:** cierre mensual independiente por sucursal y reapertura con motivo. Un cierre bloquea nuevos asientos de ese mes; queda un registro de operaciones administrativas.

### Primeros registros y correcciones

Al comenzar, los saldos son cero. Registra la apertura con un asiento manual utilizando tus saldos reales. Por ejemplo, un aporte de S/ 1,000 a caja se registra con Debe `1000 Caja` por 1,000 y Haber `3000 Capital` por 1,000. No se crean saldos ni ventas ficticias.

Registrar un documento reconoce el ingreso, gasto o activo en su fecha de emisión. Sus cobros/pagos posteriores sólo cancelan la deuda. **No vuelvas a registrar el mismo documento con Ingreso / gasto**: utiliza Cobrar o Pagar desde su fila para evitar duplicaciones. Las cuentas de control de clientes/proveedores se gestionan desde Documentos; los asientos manuales en esas cuentas requieren conciliar también los documentos.

Los asientos guardados no se editan ni se eliminan desde la web. Abre el detalle y usa **Registrar reversión**, indicando motivo y fecha. Se guarda el asiento contrario y ambos permanecen en los reportes. Para anular el origen de un documento con abonos, revierte primero sus cobros/pagos; revertir un abono restaura su saldo pendiente. Un documento sin abonos queda anulado al revertir su origen. Los números de asiento pueden tener saltos por operaciones rechazadas.

Las operaciones se validan en PostgreSQL: permisos de administrador, importes finitos, partida doble, fechas, saldo disponible, período abierto y claves de operación para evitar duplicaciones al reintentar un registro financiero. Las fichas de empleados comprueban su versión al editar para evitar sobrescribir cambios de otra sesión.

### Alcance

Es contabilidad de gestión basada en las operaciones que registres. Los pedidos y pagos actuales de la tienda son simulados; **no generan automáticamente cobros, ingresos ni asientos**. El inventario del catálogo está valorado a precio de venta para el dashboard; la contabilidad sólo incorpora inventario y costos que registres a su costo real.

No emite boletas/facturas SUNAT, no realiza conciliación bancaria automática y no calcula impuestos o planillas. Los documentos usan su importe total; para separar IGV u otros conceptos, utiliza asientos manuales con los importes contables correspondientes, sin duplicar operaciones. El cierre mensual bloquea el período; no genera automáticamente asientos de cierre anual o distribución del resultado.

## Verificación de desarrollo

`npm test` cubre cálculos exactos, saldo versus resultado, reversiones, filtros, vencimientos y CSV. Las comprobaciones de SQL y navegador son opcionales y usan PostgreSQL local mediante PGlite; no escriben en Supabase remoto.

```bash
# PGlite, Playwright y Chromium deben estar disponibles para estas pruebas opcionales.
SERVICOM_PGLITE_PATH=/ruta/a/@electric-sql/pglite node scripts/probar-gestion-sql.cjs
# Con npm run dev en otra terminal:
SERVICOM_PGLITE_PATH=/ruta/a/@electric-sql/pglite node scripts/probar-gestion-navegador.cjs
```

El script de navegador acepta `SERVICOM_PLAYWRIGHT_PATH` y `SERVICOM_CHROMIUM_PATH`; por defecto utiliza `playwright` y `/usr/bin/chromium`.
