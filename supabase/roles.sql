-- Ejecutar DESPUÉS de schema.sql, soporte.sql y gestion_empresarial.sql.
-- Roles de aplicación: admin (dueño), employee (empleado), accountant (contable).
begin;
do $$ begin
  if to_regclass('public.employees') is null or to_regclass('public.support_conversations') is null then
    raise exception 'Instala primero soporte.sql y gestion_empresarial.sql; ejecuta roles.sql al final.';
  end if;
end $$;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check(role in ('admin','employee','accountant')),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
-- Conserva a los dueños existentes sin promover a los demás usuarios de Auth.
insert into public.user_roles(user_id,role)
select user_id,'admin' from public.admins on conflict(user_id) do nothing;

create or replace function public.get_my_staff_role()
returns text language sql stable security definer set search_path='' as $$
  select role from public.user_roles where user_id=auth.uid() and active;
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(public.get_my_staff_role()='admin',false);
$$;
create or replace function public.staff_can(p_section text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(case public.get_my_staff_role()
    when 'admin' then p_section in ('dashboard','productos','pedidos','atencion','empleados','contabilidad')
    when 'employee' then p_section in ('pedidos','atencion')
    when 'accountant' then p_section in ('dashboard','contabilidad')
    else false end,false);
$$;
revoke all on function public.get_my_staff_role(),public.staff_can(text),public.is_admin() from public,anon,authenticated;
grant execute on function public.get_my_staff_role(),public.staff_can(text) to authenticated;
-- Las políticas del catálogo público llaman a is_admin(); siempre es false para visitantes.
grant execute on function public.is_admin() to anon,authenticated;

alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon,authenticated;
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
drop policy if exists staff_role_read on public.user_roles;
create policy staff_role_read on public.user_roles for select to authenticated
  using(user_id=auth.uid() or public.is_admin());
-- Las asignaciones se hacen en SQL Editor, nunca con metadatos editables del usuario.
revoke all on public.admins from anon,authenticated;

create table if not exists public.staff_role_history (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  before_data jsonb,
  after_data jsonb,
  actor_id uuid,
  created_at timestamptz not null default now()
);
alter table public.staff_role_history enable row level security;
revoke all on public.staff_role_history from anon,authenticated;
grant select on public.staff_role_history to authenticated;
grant all on public.staff_role_history to service_role;
drop policy if exists staff_role_history_owner on public.staff_role_history;
create policy staff_role_history_owner on public.staff_role_history for select to authenticated using(public.is_admin());
create or replace function public.staff_sync_role()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.user_id<>old.user_id then raise exception 'El usuario de una asignación no se puede cambiar; asigna el rol a la otra cuenta.';end if;
  if tg_op<>'DELETE' and new.role='admin' and new.active then
    insert into public.admins(user_id) values(new.user_id) on conflict do nothing;
  else
    delete from public.admins where user_id=case when tg_op='DELETE' then old.user_id else new.user_id end;
  end if;
  insert into public.staff_role_history(user_id,before_data,after_data,actor_id)
  values(case when tg_op='DELETE' then old.user_id else new.user_id end,
    case when tg_op='INSERT' then null else to_jsonb(old) end,
    case when tg_op='DELETE' then null else to_jsonb(new) end,auth.uid());
  return null;
end $$;
revoke all on function public.staff_sync_role() from public,anon,authenticated;
drop trigger if exists staff_sync_role on public.user_roles;
create trigger staff_sync_role after insert or update or delete on public.user_roles for each row execute function public.staff_sync_role();
delete from public.admins a using public.user_roles r where a.user_id=r.user_id and (r.role<>'admin' or not r.active);

-- Vínculo opcional; una ficha laboral sigue sin conceder acceso por sí sola.
alter table public.employees add column if not exists user_id uuid unique references auth.users(id) on delete set null;

create or replace function public.assign_staff_role(p_email text,p_role text,p_active boolean default true)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid;
begin
  if p_role is null or p_role not in ('admin','employee','accountant') or p_active is null then raise exception 'Rol inválido.';end if;
  select id into v_user from auth.users where lower(email)=lower(trim(p_email));
  if not found then raise exception 'Primero crea ese correo en Authentication → Users.';end if;
  insert into public.user_roles(user_id,role,active) values(v_user,p_role,p_active)
    on conflict(user_id) do update set role=excluded.role,active=excluded.active,updated_at=now();
  return v_user;
end $$;
revoke all on function public.assign_staff_role(text,text,boolean) from public,anon,authenticated;
grant execute on function public.assign_staff_role(text,text,boolean) to service_role;

-- Pedidos: el empleado sólo puede modificar status, nunca importes, clientes o llaves.
drop policy if exists orders_admin_all on public.orders;
drop policy if exists orders_staff_read on public.orders;
drop policy if exists orders_staff_status on public.orders;
drop policy if exists orders_owner_delete on public.orders;
revoke all on public.orders from anon,authenticated;
grant select(id,created_at,customer,items,total,status),update(status),delete on public.orders to authenticated;
create policy orders_staff_read on public.orders for select to authenticated using(public.staff_can('pedidos'));
create policy orders_staff_status on public.orders for update to authenticated using(public.staff_can('pedidos')) with check(public.staff_can('pedidos'));
create policy orders_owner_delete on public.orders for delete to authenticated using(public.is_admin());

drop policy if exists support_conversations_admin_read on public.support_conversations;
drop policy if exists support_messages_admin_read on public.support_messages;
create policy support_conversations_admin_read on public.support_conversations for select to authenticated using(public.staff_can('atencion'));
create policy support_messages_admin_read on public.support_messages for select to authenticated using(public.staff_can('atencion'));
-- La lista y las respuestas no necesitan exponer llaves privadas de clientes.
revoke select on public.support_conversations from authenticated;
grant select(id,customer_name,status,last_sender,last_message,created_at,updated_at) on public.support_conversations to authenticated;

do $$ declare t text;r record;section text;definition text;begin
  foreach t in array array['branches','finance_accounts','finance_journals','finance_lines','finance_period_locks','finance_audit','finance_documents','finance_payments'] loop
    execute format('drop policy if exists management_admin_read on public.%I',t);
    execute format('create policy management_admin_read on public.%I for select to authenticated using(public.staff_can(''contabilidad''))',t);
  end loop;
  -- Cambia exclusivamente el control de acceso de estas RPC existentes; conserva su validación y transacción.
  -- is_admin() conserva su significado de dueño para productos, empleados e imágenes.
  for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'support_admin_get','support_admin_reply','support_admin_set_status',
      'finance_post_entry','finance_record_cash','finance_create_document','finance_settle_document','finance_reverse_entry',
      'finance_set_period','finance_add_account','finance_get_entry','finance_report','finance_ledger_rows') loop
    section=case when r.proname like 'support_%' then 'atencion' else 'contabilidad' end;
    definition=pg_get_functiondef(r.oid);
    definition=replace(definition,'if not public.is_admin() then raise exception ''Necesitas permisos de administrador.'';',
      'if not public.staff_can('''||section||''') then raise exception ''Tu rol no tiene permiso para este apartado.'';');
    execute definition;
  end loop;
end $$;

-- Dashboard contable: sólo datos agregados; no devuelve clientes, direcciones, IDs ni tokens de pedidos.
create or replace function public.get_staff_dashboard(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_today date=(now() at time zone 'America/Lima')::date;v_start date;v_previous date;
  v_count bigint;v_prev_count bigint;v_revenue numeric;v_prev_revenue numeric;v_ticket numeric;v_prev_ticket numeric;
  v_series jsonb;v_statuses jsonb;v_low jsonb;v_categories jsonb;v_top jsonb;v_inventory jsonb;
begin
  if not public.staff_can('dashboard') then raise exception 'Tu rol no tiene permiso para este apartado.';end if;
  if p_days is null or p_days not in (7,30,90) then raise exception 'Período inválido.';end if;
  v_start=v_today-(p_days-1);v_previous=v_start-p_days;
  select count(*) filter(where (created_at at time zone 'America/Lima')::date>=v_start),
    count(*) filter(where (created_at at time zone 'America/Lima')::date<v_start),
    coalesce(sum(total) filter(where (created_at at time zone 'America/Lima')::date>=v_start),0),
    coalesce(sum(total) filter(where (created_at at time zone 'America/Lima')::date<v_start),0)
    into v_count,v_prev_count,v_revenue,v_prev_revenue from public.orders
    where created_at<=now() and (created_at at time zone 'America/Lima')::date>=v_previous;
  v_ticket=case when v_count>0 then v_revenue/v_count else 0 end;
  v_prev_ticket=case when v_prev_count>0 then v_prev_revenue/v_prev_count else 0 end;
  select jsonb_agg(to_jsonb(q) order by q.day) into v_series from (
    select d.day::date as day,count(o.id) as count,coalesce(sum(o.total),0) as total
    from generate_series(v_start::timestamp,v_today::timestamp,interval '1 day') d(day)
    left join public.orders o on (o.created_at at time zone 'America/Lima')::date=d.day::date and o.created_at<=now()
    group by d.day
  ) q;
  select jsonb_agg(to_jsonb(q) order by q.position) into v_statuses from (
    select s.name,count(o.id) as count,s.position from (values('Confirmado',1),('Despachando',2),('Enviando',3),('Entregado',4)) s(name,position)
    left join public.orders o on o.status=s.name and o.created_at<=now() and (o.created_at at time zone 'America/Lima')::date between v_start and v_today group by s.name,s.position
  ) q;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.stock,q.name),'[]'::jsonb) into v_low from (
    select name,category,stock,active from public.products where stock<=10
  ) q;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.stock desc,q.name),'[]'::jsonb) into v_categories from (
    select coalesce(nullif(category,''),'Sin categoría') as name,count(*) as count,sum(stock) as stock from public.products group by 1
  ) q;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.qty desc,q.revenue desc,q.name),'[]'::jsonb) into v_top from (
    select coalesce((array_agg(item->>'name' order by o.created_at desc,o.id desc))[1],'Producto sin nombre') as name,sum((item->>'qty')::numeric) as qty,
      sum((item->>'qty')::numeric*(item->>'price')::numeric) as revenue
    from public.orders o cross join lateral jsonb_array_elements(o.items) item
    where o.created_at<=now() and (o.created_at at time zone 'America/Lima')::date between v_start and v_today
    group by coalesce(item->>'id',item->>'name')
    order by qty desc,revenue desc,name limit 5
  ) q;
  select jsonb_build_object('productCount',count(*),'active',count(*) filter(where active),'units',coalesce(sum(stock),0),'inventoryValue',coalesce(sum(stock*price),0)) into v_inventory from public.products;
  return v_inventory||jsonb_build_object('aggregated',true,'days',p_days,'today',v_today,'start',v_start,
    'orderCount',v_count,'revenue',v_revenue,'ticket',v_ticket,
    'revenueChange',case when v_prev_revenue=0 then case when v_revenue=0 then 0 else null end else (v_revenue-v_prev_revenue)/v_prev_revenue*100 end,
    'ordersChange',case when v_prev_count=0 then case when v_count=0 then 0 else null end else (v_count-v_prev_count)::numeric/v_prev_count*100 end,
    'ticketChange',case when v_prev_ticket=0 then case when v_ticket=0 then 0 else null end else (v_ticket-v_prev_ticket)/v_prev_ticket*100 end,
    'pending',(select count(*) from public.orders where status<>'Entregado'),
    'series',v_series,'statuses',v_statuses,'lowStock',v_low,'categories',v_categories,'topProducts',v_top);
end $$;
revoke all on function public.get_staff_dashboard(integer) from public,anon,authenticated;
grant execute on function public.get_staff_dashboard(integer) to authenticated;
notify pgrst,'reload schema';
commit;
