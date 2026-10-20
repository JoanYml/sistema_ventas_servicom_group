-- Ejecutar una vez en Supabase → SQL Editor, después de schema.sql.
-- Migración aditiva e idempotente: no modifica productos, pedidos ni administradores.
begin;

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  access_token uuid not null unique,
  customer_name text not null check (char_length(customer_name) between 1 and 80),
  status text not null default 'open' check (status in ('open','closed')),
  last_sender text not null default 'customer' check (last_sender in ('customer','admin')),
  last_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.support_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender text not null check (sender in ('customer','admin')),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists support_messages_conversation_idx on public.support_messages(conversation_id,id);
create index if not exists support_conversations_updated_idx on public.support_conversations(updated_at desc);

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
revoke all on public.support_conversations,public.support_messages from anon,authenticated;
grant select on public.support_conversations,public.support_messages to authenticated;
grant all on public.support_conversations,public.support_messages to service_role;
drop policy if exists support_conversations_admin_read on public.support_conversations;
drop policy if exists support_messages_admin_read on public.support_messages;
create policy support_conversations_admin_read on public.support_conversations
  for select to authenticated using (public.is_admin());
create policy support_messages_admin_read on public.support_messages
  for select to authenticated using (public.is_admin());

-- El cliente sólo lee su conversación mediante una llave aleatoria privada.
-- Nunca se permite buscar por nombre, número de pedido o ID público.
create or replace function public.support_get_conversation(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_conversation public.support_conversations;
begin
  select * into v_conversation from public.support_conversations where access_token=p_token;
  if not found then return null; end if;
  return jsonb_build_object(
    'id',v_conversation.id,'customer_name',v_conversation.customer_name,
    'status',v_conversation.status,'updated_at',v_conversation.updated_at,
    'messages',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'sender',m.sender,'body',m.body,'created_at',m.created_at
    ) order by m.id) from public.support_messages m where m.conversation_id=v_conversation.id),'[]'::jsonb)
  );
end;
$$;

-- El token se genera con crypto.randomUUID() en el navegador.
-- Reintentar con la misma llave no crea dos consultas si se perdió una respuesta.
create or replace function public.support_create_request(p_token uuid,p_name text,p_message text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_token is null or char_length(trim(coalesce(p_name,''))) not between 1 and 80
     or char_length(trim(coalesce(p_message,''))) not between 1 and 1000 then
    raise exception 'Completa tu nombre y una consulta de hasta 1000 caracteres.';
  end if;
  insert into public.support_conversations(access_token,customer_name,last_message)
    values(p_token,trim(p_name),left(trim(p_message),180))
    on conflict(access_token) do nothing returning id into v_id;
  if v_id is not null then
    insert into public.support_messages(conversation_id,sender,body) values(v_id,'customer',trim(p_message));
  end if;
  return public.support_get_conversation(p_token);
end;
$$;

create or replace function public.support_send_message(p_token uuid,p_message text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_conversation public.support_conversations;
begin
  if char_length(trim(coalesce(p_message,''))) not between 1 and 1000 then
    raise exception 'Escribe un mensaje de hasta 1000 caracteres.';
  end if;
  select * into v_conversation from public.support_conversations where access_token=p_token for update;
  if not found then raise exception 'Esta conversación no está disponible.'; end if;
  if v_conversation.status<>'open' then raise exception 'La consulta está cerrada. Puedes iniciar una nueva.'; end if;
  if (select count(*) from public.support_messages where conversation_id=v_conversation.id)>=200 then
    raise exception 'Se alcanzó el límite de esta conversación. Solicita al equipo que cierre la consulta.';
  end if;
  insert into public.support_messages(conversation_id,sender,body) values(v_conversation.id,'customer',trim(p_message));
  update public.support_conversations set last_sender='customer',last_message=left(trim(p_message),180),updated_at=now() where id=v_conversation.id;
  return public.support_get_conversation(p_token);
end;
$$;

create or replace function public.support_admin_get(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_token uuid;
begin
  if not public.is_admin() then raise exception 'Necesitas permisos de administrador.'; end if;
  select access_token into v_token from public.support_conversations where id=p_id;
  if not found then raise exception 'La consulta ya no está disponible.'; end if;
  return public.support_get_conversation(v_token);
end;
$$;

create or replace function public.support_admin_reply(p_id uuid,p_message text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_conversation public.support_conversations;
begin
  if not public.is_admin() then raise exception 'Necesitas permisos de administrador.'; end if;
  if char_length(trim(coalesce(p_message,''))) not between 1 and 1000 then raise exception 'Escribe una respuesta de hasta 1000 caracteres.'; end if;
  select * into v_conversation from public.support_conversations where id=p_id for update;
  if not found then raise exception 'La consulta ya no está disponible.'; end if;
  if v_conversation.status<>'open' then raise exception 'Reabre la consulta antes de responder.'; end if;
  if (select count(*) from public.support_messages where conversation_id=p_id)>=200 then raise exception 'La conversación alcanzó su límite de mensajes.'; end if;
  insert into public.support_messages(conversation_id,sender,body) values(p_id,'admin',trim(p_message));
  update public.support_conversations set last_sender='admin',last_message=left(trim(p_message),180),updated_at=now() where id=p_id;
  return public.support_get_conversation(v_conversation.access_token);
end;
$$;

create or replace function public.support_admin_set_status(p_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_token uuid;
begin
  if not public.is_admin() then raise exception 'Necesitas permisos de administrador.'; end if;
  if p_status is null or p_status not in ('open','closed') then raise exception 'Estado de consulta inválido.'; end if;
  update public.support_conversations set status=p_status,updated_at=now() where id=p_id returning access_token into v_token;
  if not found then raise exception 'La consulta ya no está disponible.'; end if;
  return public.support_get_conversation(v_token);
end;
$$;

revoke all on function public.support_get_conversation(uuid),public.support_create_request(uuid,text,text),public.support_send_message(uuid,text) from public;
grant execute on function public.support_get_conversation(uuid),public.support_create_request(uuid,text,text),public.support_send_message(uuid,text) to anon,authenticated;
revoke all on function public.support_admin_get(uuid),public.support_admin_reply(uuid,text),public.support_admin_set_status(uuid,text) from public;
grant execute on function public.support_admin_get(uuid),public.support_admin_reply(uuid,text),public.support_admin_set_status(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
