# Ventas de demostración para la exposición

El archivo [supabase/ventas_demo.sql](../supabase/ventas_demo.sql) añade **120 pedidos ficticios** usando los nombres y precios de los productos activos de tu catálogo: 90 pedidos dentro de los últimos 90 días y otros 30 en el período anterior. Incluye diferentes importes, cantidades, combinaciones de productos y los cuatro estados de entrega.

## Cargarlos en Supabase

1. Ten instalados los módulos del proyecto, incluido `ventas_contabilidad.sql`.
2. Abre `supabase/ventas_demo.sql` en GitHub y copia **todo** su contenido.
3. En el mismo proyecto de Supabase que utiliza la tienda, entra a **SQL Editor → New query**, pega el archivo completo y pulsa **Run**.
4. En el resultado verás cuántos pedidos demo hay, sus fechas, el importe y cuántos ingresos se contabilizaron o quedaron pendientes.
5. En Administración → Dashboard, pulsa **Actualizar** y prueba los períodos de **7, 30 y 90 días**. También puedes consultarlos en Pedidos buscando `DEMO-VENTA`.

Los clientes son ficticios y los pedidos llevan identificadores `DEMO-VENTA-0001` a `DEMO-VENTA-0120`. No se crea personal ni cuentas de acceso. No se modifican productos, stock ni pedidos existentes: la carga representa ventas históricas de ejemplo, no compras nuevas del carrito.

La carga usa la integración normal de pedidos: sus importes también se incluyen como **Ingreso general en Contabilidad**. Si un mes está cerrado o la cuenta de destino no está disponible, el ingreso queda pendiente con su incidencia. Revísalo en Contabilidad → Ventas; el script no reabre períodos ni cambia tu configuración.

Puedes ejecutar el archivo otra vez: los pedidos existentes conservan sus fechas, estados e importes y no se duplican sus asientos. Las fechas se calculan en la primera carga según **America/Lima**; repetirlo semanas después no desplaza el historial. Los pedidos con registro contable tienen la misma protección contra eliminación que los demás. El lote es opcional y no forma parte del despliegue automático.
