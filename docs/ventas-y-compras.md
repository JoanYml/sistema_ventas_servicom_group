# Ingreso general automático y compras manuales

## Activación

Como ya están instalados los módulos anteriores y los roles, ejecuta completo **[supabase/ventas_contabilidad.sql](../supabase/ventas_contabilidad.sql)** en Supabase → SQL Editor. Es el único archivo nuevo que necesitas aplicar para este cambio. Después actualiza `/admin/` y abre Contabilidad.

El script importa **todos los pedidos existentes** con su fecha peruana y total originales, y activa el registro de pedidos nuevos. Esto sigue la confirmación de que esos pedidos no se habían registrado manualmente en Contabilidad. Los asientos manuales anteriores se conservan.

Para una instalación nueva, el orden completo es `schema.sql` → `soporte.sql` → `gestion_empresarial.sql` → `roles.sql` → **`ventas_contabilidad.sql` al final**. Si vuelves a ejecutar un esquema anterior, aplica de nuevo los posteriores en ese orden.

## Cómo se registran las ventas

Cada pedido se reconoce como ingreso cuando se crea, independientemente de si su seguimiento está Confirmado, Despachando, Enviando o Entregado. Cambiar el seguimiento no genera otro asiento.

- Todas las ventas se registran en **Ingreso general**, con `branch_id = NULL`. No se crea una tercera sucursal y no se asignan ventas a Chimbote o Nuevo Chimbote.
- El asiento automático carga el total a `1000 Caja` y lo abona a `4000 Venta de productos`.
- El dueño puede cambiar la cuenta de destino a otra caja/banco desde **Cuenta de destino**. Se aplica a las ventas que todavía no tienen asiento; los registros anteriores conservan su cuenta.
- La identificación única del pedido impide que actualizar, reintentar o volver a ejecutar la migración cree un segundo ingreso para la misma venta.
- Los pedidos con total cero se marcan Sin importe; no se inventa un asiento con líneas cero.

El checkout sigue siendo una simulación y no se ha integrado una pasarela. Por decisión de gestión se reconocen sus ventas como ingresos; el saldo contable resultante no acredita un cargo o abono bancario real.

## Qué aparece en Contabilidad

**Ingreso general** muestra los pedidos, fecha, total, estado contable y acceso a su asiento. Incluye búsqueda, paginación y CSV. Las fechas del filtro se aplican también al listado y sus indicadores.

El filtro **Ámbito** permite consultar el consolidado (General y sucursales), sólo Ingreso general o una sucursal. Elegir Chimbote o Nuevo Chimbote excluye los ingresos web, porque esas ventas no pertenecen a ninguna sucursal. Los indicadores, balance, estado de resultados y libro diario incluyen los ingresos automáticos según el ámbito y las fechas elegidas.

Los movimientos del diario identifican su origen: Venta automática, Compra manual u Otro movimiento. Los asientos automáticos muestran su pedido de origen y no ofrecen la reversión directa que dejaría la venta sin contabilizar. Para una corrección autorizada se registra un asiento de ajuste, sin borrar o volver a importar el pedido.

## Registrar una compra

Pulsa **Registrar compra**, indica ámbito, fecha, concepto, proveedor, comprobante e importe, y selecciona una cuenta:

1. **Compra pagada:** elige caja/banco. Se registra el gasto o activo y la salida de dinero.
2. **Compra a crédito:** indica vencimiento. Se registra la compra y una cuenta por pagar; después usa Pagar en **Por cobrar / pagar** para registrar abonos parciales o el pago completo. El pago cancela deuda y no vuelve a generar el gasto.

La pestaña **Compras** reúne los registros manuales, incluido su detalle e historial de reversión. Por defecto se propone `5900 Otros gastos`; puedes elegir otra cuenta de gasto o `1400 Inventario al costo`. Una compra registrada como inventario incrementa el activo contable; su costo de venta se reconoce después mediante un asiento de costo, no al precio del catálogo. El stock físico de Productos se gestiona por separado.

**Otros movimientos** queda para gastos, transferencias, otros ingresos y ajustes ajenos a los pedidos. La cuenta de ventas `4000` no se propone como ingreso manual ni como cuenta por cobrar para evitar repetir ventas web. No vuelvas a registrar manualmente una venta de Pedidos; las referencias a esos pedidos también se comprueban en el servidor.

## Períodos cerrados e incidencias

Ingreso general puede cerrarse y reabrirse por mes, de forma independiente a las dos sucursales. Si llega un pedido durante un mes cerrado, el pedido y su stock se conservan; el asiento queda **Pendiente** con la incidencia indicada. Después de reabrir el período, Actualizar o **Reintentar pendientes** completa el registro una sola vez. El módulo también reintenta hasta 100 pendientes al cargar los datos, cada 15 segundos mientras está abierto. El botón procesa hasta 500 por vez.

Los errores al generar un asiento quedan registrados de forma duradera; no se muestran como ventas contabilizadas. El historial de pedidos con registro contable se protege contra cambios de fecha/importe o eliminación, incluida la restauración destructiva de datos demo.

## Permisos y pruebas

El dueño y el contable pueden consultar ingresos, registrar compras y gestionar los períodos. Sólo el dueño cambia la cuenta de destino automática. El empleado conserva únicamente Pedidos y Atención. La creación anónima de un pedido puede generar su asiento mediante un trigger privado, sin conceder acceso público a Contabilidad.

Las pruebas opcionales usan PostgreSQL local, sin escrituras remotas:

```bash
SERVICOM_PGLITE_PATH=/ruta/a/@electric-sql/pglite node scripts/probar-ventas-contabilidad-sql.cjs
# Con npm run dev, Playwright y Chromium disponibles:
SERVICOM_PGLITE_PATH=/ruta/a/@electric-sql/pglite node scripts/probar-ventas-contabilidad-navegador.cjs
```
