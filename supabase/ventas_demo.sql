-- Servicom Group · Ventas ficticias para la exposición universitaria.
-- Ejecutar COMPLETO en Supabase → SQL Editor → New query → Run.
-- Requiere los módulos existentes, incluido ventas_contabilidad.sql.
-- Añade hasta 120 pedidos DEMO-VENTA-0001…0120 con clientes ficticios.
-- Conserva productos, stock, usuarios y pedidos existentes. No descuenta
-- existencias: son ejemplos históricos, no compras nuevas en la tienda.
-- Los triggers habituales registran los ingresos en Contabilidad (General).
-- Repetir este archivo no duplica los pedidos ni cambia sus fechas/importes.

begin;

do $ventas_demo$
declare
  v_today date := (now() at time zone 'America/Lima')::date;
  v_catalog jsonb;
  v_count integer;
  v_n integer;
  v_j integer;
  v_days integer;
  v_lines integer;
  v_qty integer;
  v_id text;
  v_status text;
  v_product jsonb;
  v_items jsonb;
  v_total numeric(10,2);
  v_date timestamptz;
  v_added integer := 0;
  v_rows integer;
begin
  if to_regclass('public.orders') is null or to_regclass('public.products') is null then
    raise exception 'Instala primero supabase/schema.sql y los módulos del proyecto.';
  end if;
  if to_regclass('public.finance_order_sales') is null or not exists (
    select 1 from pg_trigger
    where tgrelid='public.orders'::regclass and tgname='finance_capture_order'
      and tgenabled in ('O','A') and not tgisinternal
  ) then
    raise exception 'Ejecuta primero supabase/ventas_contabilidad.sql para integrar los ingresos de demostración.';
  end if;

  -- Impide que dos ejecuciones simultáneas carguen el mismo lote.
  perform pg_advisory_xact_lock(hashtext('servicom_demo_ventas_v1')::bigint);
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'price',price) order by id),'[]'::jsonb)
    into v_catalog from public.products where active and price>0;
  v_count := jsonb_array_length(v_catalog);
  if v_count=0 then
    raise exception 'Registra al menos un producto activo con precio mayor que cero antes de cargar las ventas demo.';
  end if;

  for v_n in 1..120 loop
    v_id := 'DEMO-VENTA-'||lpad(v_n::text,4,'0');
    if exists(select 1 from public.orders where id=v_id) then continue;end if;

    -- 90 pedidos en los últimos 90 días; otros 30 en el período anterior.
    -- Hay días con más de un pedido, días sin ventas e importes distintos.
    v_days := case when v_n<=90
      then floor(89*power((v_n-1)::numeric/89,1.2))::integer
      else 90+(v_n-91)*3 end;
    v_date := least(
      ((v_today-v_days)+make_time(9+mod(v_n,8),mod(v_n*13,60),0)) at time zone 'America/Lima',
      now()
    );
    v_status := case when v_days>=10 then 'Entregado'
      when v_days>=3 then (array['Enviando','Entregado'])[1+mod(v_n,2)]
      else (array['Confirmado','Despachando','Enviando','Entregado'])[1+mod(v_n,4)] end;

    v_items := '[]'::jsonb;
    v_total := 0;
    v_lines := least(1+mod(v_n,3),v_count);
    for v_j in 0..v_lines-1 loop
      v_product := v_catalog->mod(v_n*7+v_n/5+v_j,v_count);
      v_qty := case when mod(v_n+v_j*2,5)=0 then 2 else 1 end;
      v_items := v_items||jsonb_build_object(
        'id',v_product->'id','name',v_product->>'name',
        'price',(v_product->>'price')::numeric,'qty',v_qty
      );
      v_total := v_total+(v_product->>'price')::numeric*v_qty;
    end loop;

    insert into public.orders(id,created_at,customer,items,total,status)
    values(v_id,v_date,jsonb_build_object(
      'name','Cliente de demostración '||lpad((1+mod(v_n,18))::text,2,'0'),
      'dni','00000000','phone','000000000',
      'email','cliente-demo-'||(1+mod(v_n,18))||'@example.invalid',
      'address','Datos ficticios para exposición universitaria'
    ),v_items,v_total,v_status)
    on conflict(id) do nothing;
    get diagnostics v_rows=row_count;
    v_added := v_added+v_rows;
  end loop;
  raise notice 'Se añadieron % ventas de demostración. Las ya existentes se conservaron.',v_added;
end;
$ventas_demo$;

commit;

-- Resultado de la carga; no devuelve llaves privadas de pedidos.
select count(*) as pedidos_demo,
  min((o.created_at at time zone 'America/Lima')::date) as primera_fecha,
  max((o.created_at at time zone 'America/Lima')::date) as ultima_fecha,
  sum(o.total) as importe_demo,
  count(*) filter(where s.status='posted') as ingresos_contabilizados,
  count(*) filter(where s.status='pending') as ingresos_pendientes
from public.orders o
left join public.finance_order_sales s on s.order_id=o.id
where o.id ~ '^DEMO-VENTA-[0-9]{4}$';
