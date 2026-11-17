-- Usuarios del panel e historial de acciones. Ejecutar DESPUÉS de ventas_contabilidad.sql.
begin;
do $$ begin
 if to_regclass('public.finance_order_sales') is null then raise exception 'Ejecuta primero ventas_contabilidad.sql y sus requisitos.';end if;
end $$;
create table if not exists public.staff_profiles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '' check(char_length(full_name)<=120),
 version integer not null default 1,
 updated_at timestamptz not null default now()
);
insert into public.staff_profiles(user_id,full_name)
 select id,left(trim(coalesce(raw_user_meta_data->>'full_name','')),120) from auth.users on conflict do nothing;
create table if not exists public.staff_activity_log(
 id bigint generated always as identity primary key,
 actor_id uuid,actor_email text not null default '',actor_name text not null default '',actor_role text,
 module text not null,action text not null,entity_type text not null,target_id text,
 details jsonb not null default '{}',created_at timestamptz not null default now()
);
create index if not exists staff_activity_actor_idx on public.staff_activity_log(actor_id,id desc);
create index if not exists staff_activity_created_idx on public.staff_activity_log(created_at desc);
create index if not exists staff_activity_subject_idx on public.staff_activity_log(entity_type,target_id,id desc);
create table if not exists public.staff_auth_operations(
 request_id uuid primary key,actor_id uuid not null,action text not null check(action in ('create','reset_password')),
 email text not null,full_name text not null,role text,target_id uuid,
 status text not null default 'pending' check(status in ('pending','done','failed')),
 created_at timestamptz not null default now(),finished_at timestamptz
);
do $$ declare t text;begin
 foreach t in array array['staff_profiles','staff_activity_log','staff_auth_operations'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
-- No DML ni consultas directas desde el navegador. Las lecturas pasan por RPC de dueño.
create or replace function public.staff_append_activity(p_actor uuid,p_module text,p_action text,p_type text,p_target text,p_details jsonb default '{}')
returns void language plpgsql security definer set search_path='' as $$
declare v_email text='';v_name text='';v_role text;
begin
 if p_actor is not null then
  select u.email,coalesce(p.full_name,''),r.role into v_email,v_name,v_role from auth.users u
   left join public.staff_profiles p on p.user_id=u.id left join public.user_roles r on r.user_id=u.id where u.id=p_actor;
 end if;
 insert into public.staff_activity_log(actor_id,actor_email,actor_name,actor_role,module,action,entity_type,target_id,details)
 values(p_actor,coalesce(v_email,''),coalesce(v_name,''),v_role,p_module,p_action,p_type,p_target,coalesce(p_details,'{}'));
end $$;
revoke all on function public.staff_append_activity(uuid,text,text,text,text,jsonb) from public,anon,authenticated;

create or replace function public.staff_can(p_section text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(case public.get_my_staff_role()
 when 'admin' then p_section in ('dashboard','productos','pedidos','atencion','empleados','contabilidad','usuarios')
 when 'employee' then p_section in ('pedidos','atencion')
 when 'accountant' then p_section in ('dashboard','contabilidad') else false end,false);
$$;

-- Un bloqueo común protege al último dueño incluso ante dos cambios simultáneos.
create or replace function public.staff_guard_owner()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(7813926001::bigint);
 if old.role='admin' and old.active and (tg_op='DELETE' or new.role<>'admin' or not new.active) then
  if old.user_id=auth.uid() then raise exception 'No puedes quitar tu propio acceso de administrador.';end if;
  if not exists(select 1 from public.user_roles where user_id<>old.user_id and role='admin' and active) then
   raise exception 'Debe conservarse al menos un administrador activo.';
  end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.staff_guard_owner() from public,anon,authenticated;
drop trigger if exists staff_guard_owner on public.user_roles;
create trigger staff_guard_owner before update or delete on public.user_roles for each row execute function public.staff_guard_owner();

create or replace function public.staff_audit_row()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid=auth.uid();data jsonb='{}';target text;act text;kind text;area text;changed jsonb;oldrow jsonb;newrow jsonb;
begin
 oldrow=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 newrow=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 if tg_table_name='user_roles' then
  target=coalesce(newrow->>'user_id',oldrow->>'user_id');area='usuarios';kind='staff_user';act='role_changed';
  if oldrow->>'role' is not distinct from newrow->>'role' and oldrow->>'active' is not distinct from newrow->>'active' then return null;end if;
  data=jsonb_build_object('previous_role',oldrow->>'role','role',newrow->>'role','previous_active',oldrow->'active','active',newrow->'active');
  update public.staff_profiles set version=version+1,updated_at=now() where user_id=target::uuid;
 elsif tg_table_name='products' then
  -- Los descuentos automáticos de stock sin una cuenta del equipo no son acciones de un empleado.
  if actor is null or public.get_my_staff_role() is null then return null;end if;
  target=coalesce(newrow->>'id',oldrow->>'id');area='productos';kind='product';
  act=case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end;
  select coalesce(jsonb_agg(k),'[]') into changed from jsonb_object_keys(newrow||oldrow) k
   where k in ('name','category','price','stock','active','description','icon_image','image','detail_images') and oldrow->k is distinct from newrow->k;
  if tg_op='UPDATE' and changed='[]' then return null;end if;
  data=jsonb_build_object('name',coalesce(newrow->>'name',oldrow->>'name'),'fields',changed,
   'previous_stock',oldrow->'stock','stock',newrow->'stock','previous_price',oldrow->'price','price',newrow->'price');
 elsif tg_table_name='orders' then
  if old.status is not distinct from new.status then return null;end if;
  area='pedidos';kind='order';target=new.id;act='status_changed';data=jsonb_build_object('previous_status',old.status,'status',new.status);
 elsif tg_table_name='support_messages' then
  if new.sender<>'admin' then return null;end if;
  area='atencion';kind='conversation';target=new.conversation_id::text;act='replied';
  data=jsonb_build_object('message_id',new.id,'characters',char_length(new.body));
 elsif tg_table_name='support_conversations' then
  if old.status is not distinct from new.status then return null;end if;
  area='atencion';kind='conversation';target=new.id::text;act='status_changed';data=jsonb_build_object('previous_status',old.status,'status',new.status);
 elsif tg_table_name='employee_history' then
  actor=new.actor_id;area='empleados';kind='employee';target=new.employee_id::text;act=new.action;
  data=jsonb_build_object('employee_code',new.after_data->>'employee_code','job_title',new.after_data->>'job_title',
   'previous_branch',new.before_data->>'branch_id','branch',new.after_data->>'branch_id','previous_status',new.before_data->>'status','status',new.after_data->>'status');
 elsif tg_table_name='finance_audit' then
  actor=new.actor_id;area='contabilidad';kind='journal';target=new.entity_id::text;act=new.action;
  -- Lista permitida: nunca copiar payloads, mensajes, clientes o credenciales completos.
  select coalesce(jsonb_object_agg(k,v),'{}') into data from jsonb_each(new.details) x(k,v)
   where k in ('total','branch_id','month','reason','code','reversal','scope','cash');
 else return null;
 end if;
 perform public.staff_append_activity(actor,area,act,kind,target,data);return null;
end $$;
revoke all on function public.staff_audit_row() from public,anon,authenticated;
do $$ declare row record;begin
 for row in select * from (values
 ('user_roles','insert or update or delete'),('products','insert or update or delete'),('orders','update'),
 ('support_messages','insert'),('support_conversations','update'),('employee_history','insert'),('finance_audit','insert')) as x(t,events) loop
  execute format('drop trigger if exists staff_activity on public.%I',row.t);
  execute format('create trigger staff_activity after %s on public.%I for each row execute function public.staff_audit_row()',row.events,row.t);
 end loop;
end $$;

create or replace function public.staff_list_users(p_search text default '',p_role text default '',p_status text default '',p_limit integer default 25,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;total bigint;summary jsonb;
begin
 if not public.is_admin() then raise exception 'Sólo el administrador puede gestionar usuarios.';end if;
 if p_limit not between 1 and 100 or p_offset<0 or p_limit is null or p_offset is null or length(coalesce(p_search,''))>150 then raise exception 'Filtros inválidos.';end if;
 if coalesce(p_role,'') not in ('','admin','employee','accountant','unassigned') or coalesce(p_status,'') not in ('','active','inactive','unassigned') then raise exception 'Filtros inválidos.';end if;
 with users as (
  select u.id,u.email,coalesce(p.full_name,u.raw_user_meta_data->>'full_name','') full_name,r.role,coalesce(r.active,false) active,
   coalesce(p.version,0) version,u.created_at,u.last_sign_in_at
  from auth.users u left join public.staff_profiles p on p.user_id=u.id left join public.user_roles r on r.user_id=u.id
  where u.email is not null
 ),filtered as (
  select * from users where (coalesce(p_role,'')='' or coalesce(role,'unassigned')=p_role)
   and (coalesce(p_status,'')='' or (p_status='active' and role is not null and active) or (p_status='inactive' and role is not null and not active) or (p_status='unassigned' and role is null))
   and strpos(translate(lower(full_name||' '||email||' '||id::text),'áéíóúüñ','aeiouun'),translate(lower(trim(coalesce(p_search,''))),'áéíóúüñ','aeiouun'))>0
 ) select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(to_jsonb(q)) from (select * from filtered order by lower(full_name),email,id limit p_limit offset p_offset) q),'[]'),
  'summary',jsonb_build_object('total',(select count(*) from users),'active',(select count(*) from users where active and role is not null),'employee',(select count(*) from users where active and role='employee'),'accountant',(select count(*) from users where active and role='accountant')))
 into result;
 return result;
end $$;

create or replace function public.staff_update_user(p_user uuid,p_name text,p_role text,p_active boolean,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare actual integer;old_name text;
begin
 perform pg_advisory_xact_lock(7813926001::bigint);
 if not public.is_admin() then raise exception 'Sólo el administrador puede gestionar usuarios.';end if;
 if char_length(trim(coalesce(p_name,''))) not between 2 and 120 or p_role is null or p_role not in ('admin','employee','accountant') or p_active is null then raise exception 'Revisa el nombre, rol y estado.';end if;
 if p_user=auth.uid() and (p_role<>'admin' or not p_active) then raise exception 'No puedes quitar tu propio acceso de administrador.';end if;
 if not exists(select 1 from auth.users where id=p_user and email is not null) then raise exception 'La cuenta ya no existe.';end if;
 select version,full_name into actual,old_name from public.staff_profiles where user_id=p_user for update;
 if p_version is null or p_version<>coalesce(actual,0) then raise exception 'Otro administrador modificó esta cuenta. Actualiza antes de guardar.';end if;
 insert into public.staff_profiles(user_id,full_name) values(p_user,trim(p_name)) on conflict(user_id) do update set full_name=excluded.full_name,version=public.staff_profiles.version+1,updated_at=now();
 insert into public.user_roles(user_id,role,active) values(p_user,p_role,p_active) on conflict(user_id) do update set role=excluded.role,active=excluded.active,updated_at=now();
 if old_name is distinct from trim(p_name) then perform public.staff_append_activity(auth.uid(),'usuarios','profile_updated','staff_user',p_user::text,jsonb_build_object('full_name',trim(p_name)));end if;
end $$;

create or replace function public.staff_list_activity(p_actor uuid default null,p_subject uuid default null,p_role text default '',p_module text default '',p_from date default null,p_to date default null,p_limit integer default 30,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_admin() then raise exception 'Sólo el administrador puede consultar el historial del equipo.';end if;
 if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 or p_from>p_to then raise exception 'Filtros inválidos.';end if;
 if coalesce(p_role,'') not in ('','admin','employee','accountant','system') or coalesce(p_module,'') not in ('','usuarios','sesion','productos','pedidos','atencion','empleados','contabilidad') then raise exception 'Filtros inválidos.';end if;
 with filtered as (
  select * from public.staff_activity_log where (p_actor is null or actor_id=p_actor)
   and (p_subject is null or (entity_type='staff_user' and target_id=p_subject::text))
   and (coalesce(p_role,'')='' or actor_role=p_role or (p_role='system' and actor_id is null))
   and (coalesce(p_module,'')='' or module=p_module)
   and (p_from is null or created_at>=(p_from::timestamp at time zone 'America/Lima'))
   and (p_to is null or created_at<((p_to+1)::timestamp at time zone 'America/Lima'))
 ) select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(to_jsonb(q)) from (select * from filtered order by id desc limit p_limit offset p_offset) q),'[]')) into result;
 return result;
end $$;

create or replace function public.staff_record_session(p_action text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if public.get_my_staff_role() is null then raise exception 'La cuenta no tiene acceso al panel.';end if;
 if p_action is null or p_action not in ('opened','closed') then raise exception 'Acción inválida.';end if;
 if exists(select 1 from public.staff_activity_log where actor_id=auth.uid() and module='sesion' and action=p_action and created_at>now()-interval '30 seconds') then return;end if;
 perform public.staff_append_activity(auth.uid(),'sesion',p_action,'staff_user',auth.uid()::text);
end $$;

-- Estas RPC sólo las utiliza la función privada de Vercel. Nunca reciben contraseñas.
create or replace function public.staff_begin_auth_operation(p_actor uuid,p_action text,p_user uuid,p_email text,p_name text,p_role text,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare op public.staff_auth_operations;v_email text=lower(trim(coalesce(p_email,'')));
begin
 perform pg_advisory_xact_lock(7813926001::bigint);
 if not exists(select 1 from public.user_roles where user_id=p_actor and role='admin' and active) then raise exception 'El administrador ya no tiene acceso.';end if;
 if p_request is null or p_action is null or p_action not in ('create','reset_password') then raise exception 'Operación inválida.';end if;
 if p_action='create' then
  if char_length(trim(coalesce(p_name,''))) not between 2 and 120 or p_role is null or p_role not in ('admin','employee','accountant') or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email)>254 then raise exception 'Datos de cuenta inválidos.';end if;
 else
  select email into v_email from auth.users where id=p_user and email is not null;
  if not found then raise exception 'La cuenta ya no existe.';end if;
 end if;
 select * into op from public.staff_auth_operations where request_id=p_request;
 if found then
  if op.actor_id<>p_actor or op.action<>p_action or op.email<>v_email or op.full_name<>coalesce(p_name,'') or op.role is distinct from p_role or (p_action='reset_password' and op.target_id<>p_user) then raise exception 'La operación ya se solicitó con otros datos.';end if;
  return jsonb_build_object('fresh',false,'status',op.status,'user_id',op.target_id);
 end if;
 if (select count(*) from public.staff_auth_operations where actor_id=p_actor and created_at>now()-interval '1 minute')>=10 then raise exception 'Espera un minuto antes de gestionar más cuentas.';end if;
 insert into public.staff_auth_operations(request_id,actor_id,action,email,full_name,role,target_id)
  values(p_request,p_actor,p_action,v_email,coalesce(p_name,''),p_role,p_user);
 perform public.staff_append_activity(p_actor,'usuarios',p_action||'_requested','staff_user',p_user::text,jsonb_build_object('email',v_email,'request_id',p_request));
 return jsonb_build_object('fresh',true,'status','pending');
end $$;

create or replace function public.staff_finish_auth_operation(p_actor uuid,p_request uuid,p_success boolean,p_user uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare op public.staff_auth_operations;
begin
 perform pg_advisory_xact_lock(7813926001::bigint);
 select * into op from public.staff_auth_operations where request_id=p_request for update;
 if not found or op.actor_id<>p_actor then raise exception 'Operación no encontrada.';end if;
 if op.status<>'pending' then return;end if;
 if p_success is null then raise exception 'Resultado inválido.';end if;
 if p_success then
  if not exists(select 1 from public.user_roles where user_id=p_actor and role='admin' and active) then raise exception 'El administrador ya no tiene acceso.';end if;
  if op.action='create' then
   if not exists(select 1 from auth.users where id=p_user and lower(email)=op.email) then raise exception 'La cuenta creada no coincide con la solicitud.';end if;
   -- Contexto de identidad para los triggers: sólo esta RPC privada puede establecerlo.
   perform set_config('request.jwt.claim.sub',p_actor::text,true);
   insert into public.staff_profiles(user_id,full_name) values(p_user,trim(op.full_name)) on conflict(user_id) do update set full_name=excluded.full_name,version=public.staff_profiles.version+1,updated_at=now();
   insert into public.user_roles(user_id,role,active) values(p_user,op.role,true);
  else p_user=op.target_id;end if;
  perform public.staff_append_activity(p_actor,'usuarios',case when op.action='create' then 'created' else 'password_reset' end,'staff_user',p_user::text,jsonb_build_object('email',op.email,'role',op.role,'request_id',p_request));
 else
  perform public.staff_append_activity(p_actor,'usuarios',op.action||'_failed','staff_user',op.target_id::text,jsonb_build_object('email',op.email,'request_id',p_request));
 end if;
 update public.staff_auth_operations set status=case when p_success then 'done' else 'failed' end,target_id=coalesce(p_user,target_id),finished_at=now() where request_id=p_request;
end $$;

do $$ declare r record;begin
 for r in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('staff_list_users','staff_update_user','staff_list_activity','staff_record_session','staff_begin_auth_operation','staff_finish_auth_operation') loop
  execute format('revoke all on function %s from public,anon,authenticated',r.signature);
  execute format('grant execute on function %s to %I',r.signature,case when r.proname in ('staff_begin_auth_operation','staff_finish_auth_operation') then 'service_role' else 'authenticated' end);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
