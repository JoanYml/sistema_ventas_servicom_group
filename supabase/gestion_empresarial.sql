-- Servicom Group: sucursales, empleados y contabilidad de gestión.
-- Ejecutar completo en Supabase → SQL Editor después de schema.sql.
-- Aditivo e idempotente. No convierte los pedidos simulados en cobros.
begin;

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check(char_length(trim(name)) between 1 and 100),
  address text not null default '',
  phone text not null default '',
  active boolean not null default true
);
insert into public.branches(code,name) values
 ('CHIMBOTE','Chimbote'),('NUEVO_CHIMBOTE','Nuevo Chimbote') on conflict(code) do nothing;

create sequence if not exists public.employee_code_seq;
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null unique default ('EMP-'||lpad(nextval('public.employee_code_seq')::text,5,'0')),
  full_name text not null check(char_length(trim(full_name)) between 2 and 120),
  document_number text not null unique check(document_number ~ '^[A-Za-z0-9-]{6,20}$'),
  job_title text not null check(char_length(trim(job_title)) between 2 and 100),
  branch_id uuid not null references public.branches(id),
  email text not null default '' check(char_length(email)<=160),
  phone text not null default '' check(char_length(phone)<=30),
  hire_date date not null default ((now() at time zone 'America/Lima')::date),
  status text not null default 'active' check(status in ('active','leave','inactive')),
  base_salary numeric(12,2) check(base_salary>=0 and base_salary::text not in ('NaN','Infinity','-Infinity')),
  notes text not null default '' check(char_length(notes)<=1000),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists employees_branch_idx on public.employees(branch_id,status);
create table if not exists public.employee_history (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.employees(id),
  action text not null,
  before_data jsonb,
  after_data jsonb not null,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists employee_history_employee_idx on public.employee_history(employee_id,id);

create or replace function public.employee_prepare_row()
returns trigger language plpgsql set search_path='' as $$
begin
  new.full_name=trim(new.full_name);new.job_title=trim(new.job_title);new.document_number=upper(trim(new.document_number));
  if not exists(select 1 from public.branches where id=new.branch_id and active) then raise exception 'Selecciona una sucursal activa.'; end if;
  if tg_op='UPDATE' then
    if new.id<>old.id or new.employee_code<>old.employee_code then raise exception 'El identificador y código del empleado no se pueden cambiar.'; end if;
    new.version=old.version+1;
  end if;
  new.updated_at=now();return new;
end; $$;
create or replace function public.employee_record_history()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.employee_history(employee_id,action,before_data,after_data,actor_id)
  values(new.id,case when tg_op='INSERT' then 'created' when new.branch_id<>old.branch_id then 'transfer' when new.status<>old.status then 'status' else 'updated' end,
    case when tg_op='INSERT' then null else to_jsonb(old) end,to_jsonb(new),auth.uid());
  return new;
end; $$;
drop trigger if exists employee_prepare on public.employees;
create trigger employee_prepare before insert or update on public.employees for each row execute function public.employee_prepare_row();
drop trigger if exists employee_audit on public.employees;
create trigger employee_audit after insert or update on public.employees for each row execute function public.employee_record_history();

create table if not exists public.finance_accounts (
  code text primary key check(code ~ '^[0-9]{4,8}$'),
  name text not null check(char_length(trim(name)) between 2 and 120),
  kind text not null check(kind in ('asset','liability','equity','income','expense')),
  is_cash boolean not null default false check(not is_cash or kind='asset'),
  active boolean not null default true
);
insert into public.finance_accounts(code,name,kind,is_cash) values
 ('1000','Caja','asset',true),('1100','Bancos','asset',true),('1200','Cuentas por cobrar','asset',false),
 ('1300','Crédito fiscal / tributos a favor','asset',false),('1400','Inventario al costo','asset',false),
 ('2000','Cuentas por pagar','liability',false),('2100','Tributos por pagar','liability',false),('2200','Remuneraciones por pagar','liability',false),
 ('3000','Capital','equity',false),('3100','Resultados acumulados','equity',false),
 ('4000','Venta de productos','income',false),('4100','Otros ingresos','income',false),
 ('5000','Costo de ventas','expense',false),('5100','Personal','expense',false),('5200','Alquiler','expense',false),
 ('5300','Servicios','expense',false),('5900','Otros gastos','expense',false) on conflict(code) do nothing;

create table if not exists public.finance_journals (
  id uuid primary key default gen_random_uuid(),
  entry_no bigint generated always as identity unique,
  request_key uuid not null unique,
  request_payload jsonb not null,
  branch_id uuid not null references public.branches(id),
  entry_date date not null,
  description text not null check(char_length(trim(description)) between 2 and 240),
  reference text not null default '' check(char_length(reference)<=100),
  reverse_of uuid unique references public.finance_journals(id),
  reversed_by uuid unique references public.finance_journals(id),
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists finance_journals_branch_date_idx on public.finance_journals(branch_id,entry_date);
create table if not exists public.finance_lines (
  id bigint generated always as identity primary key,
  journal_id uuid not null references public.finance_journals(id),
  account_code text not null references public.finance_accounts(code),
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  check(((debit>0 and credit=0) or (credit>0 and debit=0)) and debit::text not in ('NaN','Infinity','-Infinity') and credit::text not in ('NaN','Infinity','-Infinity'))
);
create index if not exists finance_lines_journal_idx on public.finance_lines(journal_id);
create table if not exists public.finance_period_locks (
  branch_id uuid not null references public.branches(id),
  month date not null check(extract(day from month)=1),
  closed_by uuid not null,
  closed_at timestamptz not null default now(),
  primary key(branch_id,month)
);
create table if not exists public.finance_audit (
  id bigint generated always as identity primary key,
  action text not null,
  entity_id uuid,
  details jsonb not null default '{}',
  actor_id uuid not null,
  created_at timestamptz not null default now()
);
create table if not exists public.finance_documents (
  id uuid primary key,
  request_payload jsonb not null,
  branch_id uuid not null references public.branches(id),
  direction text not null check(direction in ('receivable','payable')),
  counterparty text not null check(char_length(trim(counterparty)) between 2 and 160),
  reference text not null default '' check(char_length(reference)<=100),
  issue_date date not null,
  due_date date not null check(due_date>=issue_date),
  amount numeric(14,2) not null check(amount>0 and amount::text not in ('NaN','Infinity','-Infinity')),
  account_code text not null references public.finance_accounts(code),
  journal_id uuid not null unique references public.finance_journals(id),
  status text not null default 'active' check(status in ('active','voided')),
  created_at timestamptz not null default now()
);
create table if not exists public.finance_payments (
  id uuid primary key,
  request_payload jsonb not null,
  document_id uuid not null references public.finance_documents(id),
  amount numeric(14,2) not null check(amount>0 and amount::text not in ('NaN','Infinity','-Infinity')),
  payment_date date not null,
  cash_account text not null references public.finance_accounts(code),
  journal_id uuid not null unique references public.finance_journals(id),
  created_at timestamptz not null default now()
);
create index if not exists finance_documents_branch_due_idx on public.finance_documents(branch_id,due_date);
create index if not exists finance_payments_document_idx on public.finance_payments(document_id);

-- Privacidad: sólo administradores; visitantes y empleados sin permiso de admin no leen estos datos.
do $$ declare t text; begin
  foreach t in array array['branches','employees','employee_history','finance_accounts','finance_journals','finance_lines','finance_period_locks','finance_audit','finance_documents','finance_payments'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('drop policy if exists management_admin_read on public.%I',t);
    execute format('create policy management_admin_read on public.%I for select to authenticated using(public.is_admin())',t);
  end loop;
end $$;

create or replace function public.management_save_employee(p_id uuid,p_data jsonb,p_version integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.employees;
begin
  if not public.is_admin() then raise exception 'Necesitas permisos de administrador.'; end if;
  if p_id is null then raise exception 'Falta el identificador de la ficha.'; end if;
  if p_version is null then
    insert into public.employees(id,full_name,document_number,job_title,branch_id,email,phone,hire_date,status,base_salary,notes)
    values(p_id,p_data->>'full_name',p_data->>'document_number',p_data->>'job_title',(p_data->>'branch_id')::uuid,
      coalesce(p_data->>'email',''),coalesce(p_data->>'phone',''),(p_data->>'hire_date')::date,coalesce(p_data->>'status','active'),nullif(p_data->>'base_salary','')::numeric,coalesce(p_data->>'notes','')) returning * into result;
  else
    update public.employees set full_name=p_data->>'full_name',document_number=p_data->>'document_number',job_title=p_data->>'job_title',branch_id=(p_data->>'branch_id')::uuid,
      email=coalesce(p_data->>'email',''),phone=coalesce(p_data->>'phone',''),hire_date=(p_data->>'hire_date')::date,status=p_data->>'status',base_salary=nullif(p_data->>'base_salary','')::numeric,notes=coalesce(p_data->>'notes','')
    where id=p_id and version=p_version returning * into result;
    if not found then raise exception 'La ficha cambió en otra sesión. Actualiza y vuelve a abrirla.'; end if;
  end if;
  return to_jsonb(result);
end; $$;

create or replace function public.finance_check_entry(p_id uuid)
returns void language plpgsql set search_path='' as $$
declare n integer;d numeric;c numeric;
begin
  if not exists(select 1 from public.finance_journals where id=p_id) then return; end if;
  select count(*),coalesce(sum(debit),0),coalesce(sum(credit),0) into n,d,c from public.finance_lines where journal_id=p_id;
  if n<2 or d<>c then raise exception 'El asiento debe tener al menos dos líneas y el Debe debe ser igual al Haber.'; end if;
end; $$;
create or replace function public.finance_check_entry_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='finance_journals' then perform public.finance_check_entry(new.id);
  else
    if tg_op<>'DELETE' then perform public.finance_check_entry(new.journal_id); end if;
    if tg_op<>'INSERT' then perform public.finance_check_entry(old.journal_id); end if;
  end if;
  return null;
end; $$;
drop trigger if exists finance_balanced_header on public.finance_journals;
create constraint trigger finance_balanced_header after insert or update on public.finance_journals deferrable initially deferred for each row execute function public.finance_check_entry_trigger();
drop trigger if exists finance_balanced_lines on public.finance_lines;
create constraint trigger finance_balanced_lines after insert or update or delete on public.finance_lines deferrable initially deferred for each row execute function public.finance_check_entry_trigger();

create or replace function public.finance_post_entry(p_branch uuid,p_date date,p_description text,p_reference text,p_lines jsonb,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.finance_journals;v_id uuid;line jsonb;d numeric;c numeric;td numeric=0;tc numeric=0;payload jsonb;v_month date;
begin
  if not public.is_admin() then raise exception 'Necesitas permisos de administrador.'; end if;
  if p_request is null then raise exception 'Falta la clave de la operación.'; end if;
  payload=jsonb_build_object('branch',p_branch,'date',p_date,'description',trim(p_description),'reference',coalesce(p_reference,''),'lines',p_lines);
  perform pg_advisory_xact_lock(hashtext(p_request::text)::bigint);
  select * into existing from public.finance_journals where request_key=p_request;
  if found then
    if existing.request_payload<>payload then raise exception 'La operación ya se registró con otros datos. Actualiza antes de volver a guardar.'; end if;
    return existing.id;
  end if;
  if p_date is null or p_date>(now() at time zone 'America/Lima')::date then raise exception 'Indica una fecha contable válida, sin fechas futuras.'; end if;
  if char_length(trim(coalesce(p_description,''))) not between 2 and 240 then raise exception 'Completa el concepto del asiento.'; end if;
  if not exists(select 1 from public.branches where id=p_branch and active) then raise exception 'Selecciona una sucursal activa.'; end if;
  v_month=date_trunc('month',p_date)::date;
  perform pg_advisory_xact_lock(hashtext(p_branch::text),hashtext(v_month::text));
  if exists(select 1 from public.finance_period_locks where branch_id=p_branch and month=v_month) then raise exception 'El período está cerrado para esta sucursal.'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 2 and 50 or p_lines is null then raise exception 'El asiento admite de 2 a 50 líneas.'; end if;
  for line in select * from jsonb_array_elements(p_lines) loop
    d=coalesce(nullif(line->>'debit','')::numeric,0);c=coalesce(nullif(line->>'credit','')::numeric,0);
    if d::text in ('NaN','Infinity','-Infinity') or c::text in ('NaN','Infinity','-Infinity') or not ((d>0 and c=0) or (c>0 and d=0)) or d<>round(d,2) or c<>round(c,2) then raise exception 'Cada línea necesita un Debe o un Haber positivo, con hasta dos decimales.'; end if;
    if not exists(select 1 from public.finance_accounts where code=line->>'account_code' and active) then raise exception 'Selecciona cuentas contables activas.'; end if;
    td=td+d;tc=tc+c;
  end loop;
  if td<>tc then raise exception 'El Debe y el Haber no cuadran.'; end if;
  insert into public.finance_journals(request_key,request_payload,branch_id,entry_date,description,reference,created_by)
    values(p_request,payload,p_branch,p_date,trim(p_description),coalesce(p_reference,''),auth.uid()) returning id into v_id;
  insert into public.finance_lines(journal_id,account_code,debit,credit)
    select v_id,x->>'account_code',coalesce(nullif(x->>'debit','')::numeric,0),coalesce(nullif(x->>'credit','')::numeric,0) from jsonb_array_elements(p_lines) x;
  insert into public.finance_audit(action,entity_id,details,actor_id) values('posted',v_id,jsonb_build_object('total',td,'branch_id',p_branch),auth.uid());
  return v_id;
end; $$;

create or replace function public.finance_record_cash(p_branch uuid,p_date date,p_direction text,p_amount numeric,p_cash text,p_counter text,p_description text,p_reference text,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare lines jsonb;
begin
  if not public.is_admin() then raise exception 'Necesitas permisos de administrador.'; end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'El importe debe ser positivo y tener hasta dos decimales.'; end if;
  if not exists(select 1 from public.finance_accounts where code=p_cash and is_cash and active) then raise exception 'Selecciona una cuenta de caja o bancos.'; end if;
  if not exists(select 1 from public.finance_accounts where code=p_counter and active and ((p_direction='income' and kind='income') or (p_direction='expense' and kind='expense') or (p_direction='transfer' and is_cash and code<>p_cash))) then raise exception 'Selecciona una contrapartida compatible con la operación.'; end if;
  lines=jsonb_build_array(jsonb_build_object('account_code',case when p_direction='income' then p_cash else p_counter end,'debit',p_amount,'credit',0),
    jsonb_build_object('account_code',case when p_direction='income' then p_counter else p_cash end,'debit',0,'credit',p_amount));
  return public.finance_post_entry(p_branch,p_date,p_description,p_reference,lines,p_request);
end; $$;

create or replace function public.finance_create_document(p_id uuid,p_branch uuid,p_direction text,p_counterparty text,p_reference text,p_issue date,p_due date,p_amount numeric,p_account text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_journal uuid;payload jsonb;existing public.finance_documents;lines jsonb;
begin
  if not public.is_admin() then raise exception 'Necesitas permisos de administrador.'; end if;
  if p_id is null then raise exception 'Falta la clave de la operación.'; end if;
  payload=jsonb_build_array(p_branch,p_direction,p_counterparty,p_reference,p_issue,p_due,p_amount,p_account);
  perform pg_advisory_xact_lock(hashtext(('document:'||p_id)::text)::bigint);
  select * into existing from public.finance_documents where id=p_id;
  if found then if existing.request_payload<>payload then raise exception 'Este documento ya se registró con otros datos.'; end if;return existing.id;end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount<>round(p_amount,2) or p_due is null or p_due<p_issue then raise exception 'Revisa el importe y la fecha de vencimiento.'; end if;
  if not exists(select 1 from public.finance_accounts where code=p_account and active and ((p_direction='receivable' and kind='income') or (p_direction='payable' and (kind='expense' or (kind='asset' and not is_cash and code not in ('1200','1300')))))) then raise exception 'Selecciona una cuenta compatible con el documento.'; end if;
  lines=jsonb_build_array(jsonb_build_object('account_code',case when p_direction='receivable' then '1200' else p_account end,'debit',p_amount,'credit',0),
    jsonb_build_object('account_code',case when p_direction='receivable' then p_account else '2000' end,'debit',0,'credit',p_amount));
  v_journal=public.finance_post_entry(p_branch,p_issue,case when p_direction='receivable' then 'Por cobrar: ' else 'Por pagar: ' end||p_counterparty,p_reference,lines,p_id);
  insert into public.finance_documents(id,request_payload,branch_id,direction,counterparty,reference,issue_date,due_date,amount,account_code,journal_id)
    values(p_id,payload,p_branch,p_direction,trim(p_counterparty),coalesce(p_reference,''),p_issue,p_due,p_amount,p_account,v_journal);
  return p_id;
end; $$;

create or replace function public.finance_settle_document(p_id uuid,p_amount numeric,p_cash text,p_date date,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare doc public.finance_documents;paid numeric;v_journal uuid;lines jsonb;payload jsonb;existing public.finance_payments;
begin
  if not public.is_admin() then raise exception 'Necesitas permisos de administrador.'; end if;
  if p_request is null then raise exception 'Falta la clave de la operación.'; end if;
  payload=jsonb_build_array(p_id,p_amount,p_cash,p_date);
  perform pg_advisory_xact_lock(hashtext(('payment:'||p_request)::text)::bigint);
  select * into existing from public.finance_payments where id=p_request;
  if found then if existing.request_payload<>payload then raise exception 'Este cobro o pago ya se registró con otros datos.'; end if;return existing.journal_id;end if;
  select * into doc from public.finance_documents where id=p_id for update;
  if not found or doc.status<>'active' then raise exception 'El documento no está disponible.'; end if;
  if p_date<doc.issue_date then raise exception 'El cobro o pago no puede ser anterior al documento.'; end if;
  if not exists(select 1 from public.finance_accounts where code=p_cash and is_cash and active) then raise exception 'Selecciona caja o bancos.'; end if;
  select coalesce(sum(p.amount),0) into paid from public.finance_payments p join public.finance_journals j on j.id=p.journal_id where p.document_id=p_id and j.reversed_by is null;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount<>round(p_amount,2) or p_amount>doc.amount-paid then raise exception 'El importe supera el saldo pendiente o no es válido.'; end if;
  lines=jsonb_build_array(jsonb_build_object('account_code',case when doc.direction='receivable' then p_cash else '2000' end,'debit',p_amount,'credit',0),
    jsonb_build_object('account_code',case when doc.direction='receivable' then '1200' else p_cash end,'debit',0,'credit',p_amount));
  v_journal=public.finance_post_entry(doc.branch_id,p_date,case when doc.direction='receivable' then 'Cobro: ' else 'Pago: ' end||doc.counterparty,doc.reference,lines,p_request);
  insert into public.finance_payments(id,request_payload,document_id,amount,payment_date,cash_account,journal_id) values(p_request,payload,p_id,p_amount,p_date,p_cash,v_journal);
  return v_journal;
end; $$;

create or replace function public.finance_reverse_entry(p_id uuid,p_date date,p_reason text,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare original public.finance_journals;v_new uuid;lines jsonb;doc_id uuid;
begin
  if not public.is_admin() then raise exception 'Necesitas permisos de administrador.'; end if;
  select * into original from public.finance_journals where id=p_id for update;
  if not found or original.reverse_of is not null then raise exception 'No se puede revertir este asiento.'; end if;
  if original.reversed_by is not null then
    if exists(select 1 from public.finance_journals where id=original.reversed_by and request_key=p_request) then
      if not exists(select 1 from public.finance_journals where id=original.reversed_by and entry_date=p_date and description='Reversión # '||original.entry_no||': '||trim(p_reason)) then raise exception 'La reversión ya se registró con otros datos.';end if;
      return original.reversed_by;end if;
    raise exception 'El asiento ya tiene una reversión.';
  end if;
  if p_date<original.entry_date or char_length(trim(coalesce(p_reason,''))) not between 3 and 180 then raise exception 'Indica el motivo y una fecha no anterior al asiento original.'; end if;
  select id into doc_id from public.finance_documents where journal_id=p_id;
  if doc_id is null then select document_id into doc_id from public.finance_payments where journal_id=p_id;end if;
  if doc_id is not null then perform 1 from public.finance_documents where id=doc_id for update;end if;
  if exists(select 1 from public.finance_documents d join public.finance_payments p on p.document_id=d.id join public.finance_journals j on j.id=p.journal_id where d.journal_id=p_id and j.reversed_by is null) then raise exception 'Revierte primero los cobros o pagos asociados al documento.';end if;
  select jsonb_agg(jsonb_build_object('account_code',account_code,'debit',credit,'credit',debit) order by id) into lines from public.finance_lines where journal_id=p_id;
  v_new=public.finance_post_entry(original.branch_id,p_date,'Reversión # '||original.entry_no||': '||trim(p_reason),original.reference,lines,p_request);
  update public.finance_journals set reverse_of=p_id where id=v_new;
  update public.finance_journals set reversed_by=v_new where id=p_id;
  update public.finance_documents set status='voided' where journal_id=p_id;
  insert into public.finance_audit(action,entity_id,details,actor_id) values('reversed',p_id,jsonb_build_object('reversal',v_new,'reason',p_reason),auth.uid());
  return v_new;
end; $$;

create or replace function public.finance_set_period(p_branch uuid,p_month date,p_close boolean,p_reason text default '')
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Necesitas permisos de administrador.'; end if;
  if p_month is null or extract(day from p_month)<>1 or p_month>date_trunc('month',now() at time zone 'America/Lima')::date or p_close is null then raise exception 'Selecciona un mes válido.';end if;
  if not exists(select 1 from public.branches where id=p_branch and active) then raise exception 'Selecciona una sucursal.';end if;
  if not p_close and char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'Indica el motivo de reapertura.';end if;
  perform pg_advisory_xact_lock(hashtext(p_branch::text),hashtext(p_month::text));
  if p_close then insert into public.finance_period_locks(branch_id,month,closed_by) values(p_branch,p_month,auth.uid()) on conflict do nothing;
  else delete from public.finance_period_locks where branch_id=p_branch and month=p_month;end if;
  insert into public.finance_audit(action,details,actor_id) values(case when p_close then 'period_closed' else 'period_reopened' end,jsonb_build_object('branch_id',p_branch,'month',p_month,'reason',p_reason),auth.uid());
end; $$;

create or replace function public.finance_add_account(p_code text,p_name text,p_kind text,p_cash boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Necesitas permisos de administrador.';end if;
  insert into public.finance_accounts(code,name,kind,is_cash) values(trim(p_code),trim(p_name),p_kind,p_cash);
  insert into public.finance_audit(action,details,actor_id) values('account_created',jsonb_build_object('code',p_code),auth.uid());
end; $$;

create or replace view public.finance_document_balances with(security_invoker=true) as
select d.id,d.branch_id,d.direction,d.counterparty,d.reference,d.issue_date,d.due_date,d.amount,d.account_code,d.journal_id,d.status,d.created_at,
  coalesce(sum(p.amount) filter(where j.reversed_by is null),0) as paid_amount,
  case when d.status='voided' then 0 else d.amount-coalesce(sum(p.amount) filter(where j.reversed_by is null),0) end as outstanding
from public.finance_documents d left join public.finance_payments p on p.document_id=d.id left join public.finance_journals j on j.id=p.journal_id group by d.id;
revoke all on public.finance_document_balances from anon,authenticated;
grant select on public.finance_document_balances to authenticated;

create or replace function public.finance_get_entry(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'Necesitas permisos de administrador.';end if;
  select to_jsonb(j)-'request_payload'-'request_key'||jsonb_build_object('lines',(select jsonb_agg(to_jsonb(l)||jsonb_build_object('account_name',a.name) order by l.id) from public.finance_lines l join public.finance_accounts a on a.code=l.account_code where l.journal_id=j.id)) into result from public.finance_journals j where j.id=p_id;
  return result;
end; $$;

create or replace function public.finance_report(p_branch uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare balances jsonb;monthly jsonb;by_branch jsonb;
begin
  if not public.is_admin() then raise exception 'Necesitas permisos de administrador.';end if;
  if p_from is null or p_to is null or p_from>p_to or p_to-p_from>3660 then raise exception 'Selecciona un rango válido de hasta diez años.';end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.code),'[]'::jsonb) into balances from (
    select a.code,a.name,a.kind,a.is_cash,
      coalesce(sum(l.debit-l.credit) filter(where j.entry_date<p_from),0) as opening,
      coalesce(sum(l.debit) filter(where j.entry_date between p_from and p_to),0) as debit,
      coalesce(sum(l.credit) filter(where j.entry_date between p_from and p_to),0) as credit,
      coalesce(sum(l.debit-l.credit),0) as closing
    from public.finance_accounts a left join (public.finance_lines l join public.finance_journals j on j.id=l.journal_id and j.entry_date<=p_to and (p_branch is null or j.branch_id=p_branch)) on l.account_code=a.code
    group by a.code
  ) q;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.month),'[]'::jsonb) into monthly from (
    select date_trunc('month',j.entry_date)::date as month,
      coalesce(sum(l.credit-l.debit) filter(where a.kind='income'),0) as income,
      coalesce(sum(l.debit-l.credit) filter(where a.kind='expense'),0) as expense
    from public.finance_journals j join public.finance_lines l on l.journal_id=j.id join public.finance_accounts a on a.code=l.account_code
    where j.entry_date between p_from and p_to and (p_branch is null or j.branch_id=p_branch) group by 1
  ) q;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.name),'[]'::jsonb) into by_branch from (
    select b.id,b.name,coalesce(sum(l.credit-l.debit) filter(where a.kind='income'),0) as income,coalesce(sum(l.debit-l.credit) filter(where a.kind='expense'),0) as expense
    from public.branches b left join public.finance_journals j on j.branch_id=b.id and j.entry_date between p_from and p_to
    left join public.finance_lines l on l.journal_id=j.id left join public.finance_accounts a on a.code=l.account_code
    where p_branch is null or b.id=p_branch group by b.id
  ) q;
  return jsonb_build_object('accounts',balances,'monthly',monthly,'branches',by_branch,'from',p_from,'to',p_to);
end; $$;

create or replace function public.finance_ledger_rows(p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'Necesitas permisos de administrador.';end if;
  if cardinality(p_ids)>5000 then raise exception 'Exporta hasta 5000 asientos por bloque.';end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.entry_date,q.entry_no,q.line_id),'[]'::jsonb) into result from (
    select l.id as line_id,j.entry_no,j.entry_date,b.name as branch,j.description,j.reference,l.account_code,a.name as account,l.debit,l.credit,
      case when j.reverse_of is not null then 'Reversión' when j.reversed_by is not null then 'Revertido' else 'Registrado' end as status
    from public.finance_lines l join public.finance_journals j on j.id=l.journal_id join public.finance_accounts a on a.code=l.account_code join public.branches b on b.id=j.branch_id where j.id=any(p_ids)
  ) q;
  return result;
end; $$;

-- Ninguna función financiera se ejecuta como visitante.
do $$ declare r record; begin
  for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('management_save_employee','finance_post_entry','finance_record_cash','finance_create_document','finance_settle_document','finance_reverse_entry','finance_set_period','finance_add_account','finance_get_entry','finance_report','finance_ledger_rows') loop
    execute format('revoke all on function %s from public,anon',r.signature);
    execute format('grant execute on function %s to authenticated',r.signature);
  end loop;
end $$;
revoke all on function public.employee_prepare_row(),public.employee_record_history(),public.finance_check_entry(uuid),public.finance_check_entry_trigger() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
