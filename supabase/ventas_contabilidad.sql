-- Ventas → Ingreso general automático (sin sucursal); compras manuales.
-- Ejecutar completo DESPUÉS de roles.sql. Conserva los asientos existentes.
begin;
do $$ begin
  if to_regprocedure('public.staff_can(text)') is null then raise exception 'Ejecuta primero roles.sql.';end if;
end $$;
alter table public.finance_journals add column if not exists source text not null default 'manual' check(source in ('manual','order','purchase'));
alter table public.finance_journals add column if not exists order_id text unique;
alter table public.finance_journals alter column created_by drop not null;
alter table public.finance_journals alter column branch_id drop not null;
alter table public.finance_documents alter column branch_id drop not null;
alter table public.finance_audit alter column actor_id drop not null;

create table if not exists public.finance_sales_settings (
  id boolean primary key default true check(id),
  enabled boolean not null default true,
  cash_account text not null default '1000' references public.finance_accounts(code),
  updated_at timestamptz not null default now()
);
insert into public.finance_sales_settings(id) values(true) on conflict do nothing;
create table if not exists public.finance_order_sales (
  order_id text primary key,
  order_date date not null,
  amount numeric(14,2) not null check(amount>=0 and amount::text not in ('NaN','Infinity','-Infinity')),
  historical boolean not null default false,
  approved boolean not null default true,
  journal_id uuid unique references public.finance_journals(id),
  status text not null default 'pending' check(status in ('pending','posted','zero')),
  error_message text not null default '',
  created_at timestamptz not null default now(),
  posted_at timestamptz,
  check((status in ('posted') and journal_id is not null) or (status in ('pending','zero') and journal_id is null))
);
create table if not exists public.finance_general_period_locks (
 month date primary key check(extract(day from month)=1),closed_by uuid not null,closed_at timestamptz not null default now()
);
create index if not exists finance_order_sales_pending_idx on public.finance_order_sales(status,approved,order_date);
do $$ declare t text;begin
 foreach t in array array['finance_sales_settings','finance_order_sales','finance_general_period_locks'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('drop policy if exists finance_sales_read on public.%I',t);
  execute format('create policy finance_sales_read on public.%I for select to authenticated using(public.staff_can(''contabilidad''))',t);
 end loop;
end $$;

-- Motor privado compartido. Nunca es ejecutable desde el navegador, ni por empleados.
create or replace function public.finance_write_entry(p_branch uuid,p_date date,p_description text,p_reference text,p_lines jsonb,p_request uuid,p_actor uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.finance_journals;v_id uuid;line jsonb;d numeric;c numeric;td numeric=0;tc numeric=0;payload jsonb;v_month date;
begin
 if p_request is null then raise exception 'Falta la clave de la operación.';end if;
 payload=jsonb_build_object('branch',p_branch,'date',p_date,'description',trim(p_description),'reference',coalesce(p_reference,''),'lines',p_lines);
 perform pg_advisory_xact_lock(hashtext(p_request::text)::bigint);
 select * into existing from public.finance_journals where request_key=p_request;
 if found then
  if existing.request_payload<>payload then raise exception 'La operación ya se registró con otros datos. Actualiza antes de volver a guardar.';end if;
  return existing.id;
 end if;
 if p_date is null or p_date>(now() at time zone 'America/Lima')::date then raise exception 'Indica una fecha contable válida, sin fechas futuras.';end if;
 if char_length(trim(coalesce(p_description,''))) not between 2 and 240 then raise exception 'Completa el concepto del asiento.';end if;
 if p_branch is not null and not exists(select 1 from public.branches where id=p_branch and active) then raise exception 'Selecciona una sucursal activa.';end if;
 v_month=date_trunc('month',p_date)::date;
 perform pg_advisory_xact_lock(hashtext(coalesce(p_branch::text,'general')),hashtext(v_month::text));
 if exists(select 1 from public.finance_period_locks where branch_id=p_branch and month=v_month) or (p_branch is null and exists(select 1 from public.finance_general_period_locks where month=v_month)) then raise exception 'El período está cerrado para este ámbito.';end if;
 if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 2 and 50 then raise exception 'El asiento admite de 2 a 50 líneas.';end if;
 for line in select * from jsonb_array_elements(p_lines) loop
  d=coalesce(nullif(line->>'debit','')::numeric,0);c=coalesce(nullif(line->>'credit','')::numeric,0);
  if d::text in ('NaN','Infinity','-Infinity') or c::text in ('NaN','Infinity','-Infinity') or not ((d>0 and c=0) or (c>0 and d=0)) or d<>round(d,2) or c<>round(c,2) then raise exception 'Cada línea necesita un Debe o un Haber positivo, con hasta dos decimales.';end if;
  if not exists(select 1 from public.finance_accounts where code=line->>'account_code' and active) then raise exception 'Selecciona cuentas contables activas.';end if;
  td=td+d;tc=tc+c;
 end loop;
 if td<>tc then raise exception 'El Debe y el Haber no cuadran.';end if;
 insert into public.finance_journals(request_key,request_payload,branch_id,entry_date,description,reference,created_by)
  values(p_request,payload,p_branch,p_date,trim(p_description),coalesce(p_reference,''),p_actor) returning id into v_id;
 insert into public.finance_lines(journal_id,account_code,debit,credit)
  select v_id,x->>'account_code',coalesce(nullif(x->>'debit','')::numeric,0),coalesce(nullif(x->>'credit','')::numeric,0) from jsonb_array_elements(p_lines) x;
 insert into public.finance_audit(action,entity_id,details,actor_id) values('posted',v_id,jsonb_build_object('total',td,'branch_id',p_branch),p_actor);
 return v_id;
end $$;
revoke all on function public.finance_write_entry(uuid,date,text,text,jsonb,uuid,uuid) from public,anon,authenticated;

create or replace function public.finance_post_entry(p_branch uuid,p_date date,p_description text,p_reference text,p_lines jsonb,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not public.staff_can('contabilidad') then raise exception 'Tu rol no tiene permiso para este apartado.';end if;
 if exists(select 1 from public.orders where id=trim(p_reference)) and exists(select 1 from jsonb_array_elements(p_lines) x join public.finance_accounts a on a.code=x->>'account_code' where a.kind='income' and coalesce(nullif(x->>'credit','')::numeric,0)>0) then
  raise exception 'Ese pedido ya genera su ingreso automáticamente. Revisa los ingresos automáticos desde Ventas.';
 end if;
 return public.finance_write_entry(p_branch,p_date,p_description,p_reference,p_lines,p_request,auth.uid());
end $$;

create or replace function public.finance_try_order(p_order text)
returns boolean language plpgsql security definer set search_path='' as $$
declare sale public.finance_order_sales;settings public.finance_sales_settings;v_journal uuid;lines jsonb;
begin
 select * into sale from public.finance_order_sales where order_id=p_order for update;
 if not found then return false;end if;
 if sale.status<>'pending' then return true;end if;
 if not sale.approved then return false;end if;
 select * into settings from public.finance_sales_settings where id;
 if not settings.enabled then return false;end if;
 if sale.amount=0 then update public.finance_order_sales set status='zero',posted_at=now(),error_message='' where order_id=p_order;return true;end if;
 begin
  if not exists(select 1 from public.orders where id=p_order) then raise exception 'El pedido ya no existe; revisa su importación.';end if;
  if not exists(select 1 from public.finance_accounts where code=settings.cash_account and is_cash and active) then raise exception 'Revisa la cuenta de destino de ventas.';end if;
  lines=jsonb_build_array(jsonb_build_object('account_code',settings.cash_account,'debit',sale.amount,'credit',0),jsonb_build_object('account_code','4000','debit',0,'credit',sale.amount));
  v_journal=public.finance_write_entry(null,sale.order_date,'Venta web · '||sale.order_id,sale.order_id,lines,gen_random_uuid(),null);
  update public.finance_journals set source='order',order_id=p_order where id=v_journal;
  update public.finance_order_sales set status='posted',journal_id=v_journal,error_message='',posted_at=now() where order_id=p_order;
  return true;
 exception when others then
  -- La venta se conserva y la incidencia queda en una cola durable para reintentar.
  update public.finance_order_sales set error_message=left(sqlerrm,300) where order_id=p_order;
  return false;
 end;
end $$;
revoke all on function public.finance_try_order(text) from public,anon,authenticated;

create or replace function public.finance_capture_order()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.finance_order_sales(order_id,order_date,amount)
  values(new.id,(new.created_at at time zone 'America/Lima')::date,new.total) on conflict do nothing;
 perform public.finance_try_order(new.id);return null;
end $$;
revoke all on function public.finance_capture_order() from public,anon,authenticated;
drop trigger if exists finance_capture_order on public.orders;
create trigger finance_capture_order after insert on public.orders for each row execute function public.finance_capture_order();

create or replace function public.finance_protect_order()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.finance_order_sales where order_id=old.id) then
  if tg_op='DELETE' then raise exception 'El pedido tiene un registro contable. Se conserva para mantener el historial de ventas.';end if;
  if new.id<>old.id or new.total<>old.total or new.created_at<>old.created_at then raise exception 'No se puede alterar el importe o fecha de una venta registrada. Usa un asiento de ajuste.';end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.finance_protect_order() from public,anon,authenticated;
drop trigger if exists finance_protect_order on public.orders;
create trigger finance_protect_order before update or delete on public.orders for each row execute function public.finance_protect_order();

-- El usuario confirmó importar todas las ventas existentes; todas pertenecen a Ingreso general.
insert into public.finance_order_sales(order_id,order_date,amount,historical,approved)
 select id,(created_at at time zone 'America/Lima')::date,total,true,true from public.orders on conflict do nothing;

create or replace function public.finance_configure_sales(p_cash text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Sólo el dueño puede configurar los ingresos automáticos.';end if;
 if not exists(select 1 from public.finance_accounts where code=p_cash and is_cash and active) then raise exception 'Selecciona una cuenta de caja o bancos.';end if;
 update public.finance_sales_settings set cash_account=p_cash,enabled=true,updated_at=now() where id;
 insert into public.finance_audit(action,details,actor_id) values('sales_configured',jsonb_build_object('scope','general','cash',p_cash),auth.uid());
end $$;

create or replace function public.finance_sync_sales(p_history boolean default false,p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row record;done integer=0;failed integer=0;
begin
 if not public.staff_can('contabilidad') then raise exception 'Tu rol no tiene permiso para este apartado.';end if;
 if p_limit is null or p_limit not between 1 and 500 then raise exception 'Límite inválido.';end if;
 if not (select enabled from public.finance_sales_settings where id) then raise exception 'El dueño debe configurar primero los ingresos de ventas.';end if;
 if coalesce(p_history,false) then
  update public.finance_order_sales set approved=true where status='pending' and not approved;
  insert into public.finance_audit(action,details,actor_id) values('sales_history_approved','{}',auth.uid());
 end if;
 for row in select order_id from public.finance_order_sales where status='pending' and approved order by order_date,order_id limit p_limit for update skip locked loop
  if public.finance_try_order(row.order_id) then done=done+1;else failed=failed+1;end if;
 end loop;
 return jsonb_build_object('posted',done,'failed',failed,'remaining',(select count(*) from public.finance_order_sales where status='pending'));
end $$;

create or replace function public.finance_sales_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.staff_can('contabilidad') then raise exception 'Tu rol no tiene permiso para este apartado.';end if;
 return jsonb_build_object('installed',true,'settings',(select to_jsonb(s) from public.finance_sales_settings s where id),
  'pending',(select count(*) from public.finance_order_sales where status='pending'),
  'review',(select count(*) from public.finance_order_sales where status='pending' and not approved),
  'posted',(select count(*) from public.finance_order_sales where status in ('posted','zero')),
  'unlinked_manual',(select count(distinct j.id) from public.finance_journals j join public.finance_lines l on l.journal_id=j.id join public.finance_accounts a on a.code=l.account_code where j.source='manual' and j.reversed_by is null and j.reverse_of is null and a.kind='income' and l.credit>0));
end $$;

create or replace function public.finance_record_purchase(p_branch uuid,p_date date,p_supplier text,p_description text,p_reference text,p_amount numeric,p_cash text,p_account text,p_request uuid,p_due date default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_journal uuid;lines jsonb;
begin
 if not public.staff_can('contabilidad') then raise exception 'Tu rol no tiene permiso para este apartado.';end if;
 if char_length(trim(coalesce(p_supplier,''))) not between 2 and 120 then raise exception 'Indica el proveedor.';end if;
 if not exists(select 1 from public.finance_accounts where code=p_account and active and (kind='expense' or kind='asset' and not is_cash and code not in ('1200','1300'))) then raise exception 'Selecciona una cuenta de compra, gasto o inventario.';end if;
 if p_due is null and not exists(select 1 from public.finance_accounts where code=p_cash and active and is_cash) then raise exception 'Selecciona caja o bancos.';end if;
 if p_due is not null and p_due<p_date then raise exception 'El vencimiento no puede ser anterior a la compra.';end if;
 if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Indica un importe positivo con hasta dos decimales.';end if;
 lines=jsonb_build_array(jsonb_build_object('account_code',p_account,'debit',p_amount,'credit',0),jsonb_build_object('account_code',case when p_due is null then p_cash else '2000' end,'debit',0,'credit',p_amount));
 v_journal=public.finance_post_entry(p_branch,p_date,left('Compra · '||trim(p_supplier)||' · '||trim(coalesce(p_description,'')),240),p_reference,lines,p_request);
 update public.finance_journals set source='purchase' where id=v_journal;
 if p_due is not null then
  insert into public.finance_documents(id,request_payload,branch_id,direction,counterparty,reference,issue_date,due_date,amount,account_code,journal_id)
   values(p_request,jsonb_build_array(p_branch,'payable',p_supplier,p_reference,p_date,p_due,p_amount,p_account),p_branch,'payable',trim(p_supplier),coalesce(p_reference,''),p_date,p_due,p_amount,p_account,v_journal) on conflict(id) do nothing;
 end if;
 return v_journal;
end $$;

create or replace function public.finance_mark_purchase()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.direction='payable' then update public.finance_journals set source='purchase' where id=new.journal_id;end if;
 return null;
end $$;
revoke all on function public.finance_mark_purchase() from public,anon,authenticated;
drop trigger if exists finance_mark_purchase on public.finance_documents;
create trigger finance_mark_purchase after insert on public.finance_documents for each row execute function public.finance_mark_purchase();
update public.finance_journals j set source='purchase' where source='manual' and exists(select 1 from public.finance_documents d where d.journal_id=j.id and d.direction='payable');

create or replace view public.finance_journal_totals with(security_invoker=true) as
 select j.id,j.entry_no,j.branch_id,j.entry_date,j.description,j.reference,j.reverse_of,j.reversed_by,j.created_by,j.created_at,j.source,j.order_id,coalesce(sum(l.debit),0) as total
 from public.finance_journals j left join public.finance_lines l on l.journal_id=j.id group by j.id;
revoke all on public.finance_journal_totals from anon,authenticated;
grant select on public.finance_journal_totals to authenticated;

-- Conserva el cuerpo de reversión y añade protección a los ingresos vinculados a pedidos.
do $$ declare definition text;begin
 definition=pg_get_functiondef('public.finance_reverse_entry(uuid,date,text,uuid)'::regprocedure);
 if position('La venta se conserva automáticamente' in definition)=0 then
  definition=replace(definition,'select * into original from public.finance_journals where id=p_id for update;',
   'select * into original from public.finance_journals where id=p_id for update; if original.source=''order'' then raise exception ''La venta se conserva automáticamente. Para corregirla registra un asiento de ajuste, sin volver a importar el pedido.'';end if;');
  execute definition;
 end if;
end $$;

-- Reportes: consolidado, sucursal o únicamente Ingreso general.
create or replace function public.finance_report_scope(p_branch uuid,p_from date,p_to date,p_general boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare balances jsonb;monthly jsonb;by_branch jsonb;
begin
 if not public.staff_can('contabilidad') then raise exception 'Tu rol no tiene permiso para este apartado.';end if;
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>3660 then raise exception 'Selecciona un rango válido de hasta diez años.';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.code),'[]'::jsonb) into balances from (
  select a.code,a.name,a.kind,a.is_cash,
   coalesce(sum(l.debit-l.credit) filter(where j.entry_date<p_from),0) as opening,
   coalesce(sum(l.debit) filter(where j.entry_date between p_from and p_to),0) as debit,
   coalesce(sum(l.credit) filter(where j.entry_date between p_from and p_to),0) as credit,
   coalesce(sum(l.debit-l.credit),0) as closing
  from public.finance_accounts a left join (public.finance_lines l join public.finance_journals j on j.id=l.journal_id and j.entry_date<=p_to and (p_branch is null or j.branch_id=p_branch) and (not p_general or j.branch_id is null)) on l.account_code=a.code group by a.code
 ) q;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.month),'[]'::jsonb) into monthly from (
  select date_trunc('month',j.entry_date)::date as month,
   coalesce(sum(l.credit-l.debit) filter(where a.kind='income'),0) as income,
   coalesce(sum(l.debit-l.credit) filter(where a.kind='expense'),0) as expense
  from public.finance_journals j join public.finance_lines l on l.journal_id=j.id join public.finance_accounts a on a.code=l.account_code
  where j.entry_date between p_from and p_to and (p_branch is null or j.branch_id=p_branch) and (not p_general or j.branch_id is null) group by 1
 ) q;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.name),'[]'::jsonb) into by_branch from (
  select b.id,b.name,coalesce(sum(l.credit-l.debit) filter(where a.kind='income'),0) as income,coalesce(sum(l.debit-l.credit) filter(where a.kind='expense'),0) as expense
  from public.branches b left join public.finance_journals j on j.branch_id=b.id and j.entry_date between p_from and p_to
  left join public.finance_lines l on l.journal_id=j.id left join public.finance_accounts a on a.code=l.account_code
  where not p_general and (p_branch is null or b.id=p_branch) group by b.id
  union all
  select null::uuid,'Ingreso general',coalesce(sum(l.credit-l.debit) filter(where a.kind='income'),0),coalesce(sum(l.debit-l.credit) filter(where a.kind='expense'),0)
  from public.finance_journals j join public.finance_lines l on l.journal_id=j.id join public.finance_accounts a on a.code=l.account_code
  where p_branch is null and j.branch_id is null and j.entry_date between p_from and p_to
  having p_branch is null
 ) q;
 return jsonb_build_object('accounts',balances,'monthly',monthly,'branches',by_branch,'from',p_from,'to',p_to);
end $$;
revoke all on function public.finance_report_scope(uuid,date,date,boolean) from public,anon,authenticated;
create or replace function public.finance_report(p_branch uuid,p_from date,p_to date)
returns jsonb language sql stable security definer set search_path='' as $$
 select public.finance_report_scope(p_branch,p_from,p_to,false);
$$;
create or replace function public.finance_report_general(p_from date,p_to date)
returns jsonb language sql stable security definer set search_path='' as $$
 select public.finance_report_scope(null,p_from,p_to,true);
$$;

create or replace function public.finance_set_period(p_branch uuid,p_month date,p_close boolean,p_reason text default '')
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.staff_can('contabilidad') then raise exception 'Tu rol no tiene permiso para este apartado.';end if;
 if p_month is null or extract(day from p_month)<>1 or p_month>date_trunc('month',now() at time zone 'America/Lima')::date or p_close is null then raise exception 'Selecciona un mes válido.';end if;
 if p_branch is not null and not exists(select 1 from public.branches where id=p_branch and active) then raise exception 'Selecciona una sucursal.';end if;
 if not p_close and char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'Indica el motivo de reapertura.';end if;
 perform pg_advisory_xact_lock(hashtext(coalesce(p_branch::text,'general')),hashtext(p_month::text));
 if p_branch is null then
  if p_close then insert into public.finance_general_period_locks(month,closed_by) values(p_month,auth.uid()) on conflict do nothing;
  else delete from public.finance_general_period_locks where month=p_month;end if;
 else
  if p_close then insert into public.finance_period_locks(branch_id,month,closed_by) values(p_branch,p_month,auth.uid()) on conflict do nothing;
  else delete from public.finance_period_locks where branch_id=p_branch and month=p_month;end if;
 end if;
 insert into public.finance_audit(action,details,actor_id) values(case when p_close then 'period_closed' else 'period_reopened' end,jsonb_build_object('branch_id',p_branch,'month',p_month,'reason',p_reason),auth.uid());
end $$;
-- El libro diario también debe exportar las ventas sin sucursal.
do $$ declare definition text;begin
 definition=pg_get_functiondef('public.finance_ledger_rows(uuid[])'::regprocedure);
 if position('coalesce(b.name' in definition)=0 then
  definition=replace(definition,'b.name as branch','coalesce(b.name,''Ingreso general'') as branch');
  definition=replace(definition,'join public.branches b on','left join public.branches b on');
  execute definition;
 end if;
end $$;

do $$ declare r record;begin
 for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('finance_configure_sales','finance_sync_sales','finance_sales_status','finance_record_purchase','finance_report_general') loop
  execute format('revoke all on function %s from public,anon',r.signature);
  execute format('grant execute on function %s to authenticated',r.signature);
 end loop;
end $$;
do $$ declare row record;begin
 for row in select order_id from public.finance_order_sales where status='pending' and approved order by order_date,order_id loop
  perform public.finance_try_order(row.order_id);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
