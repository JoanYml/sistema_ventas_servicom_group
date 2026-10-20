const {PGlite}=require(process.env.SERVICOM_PGLITE_PATH||'@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const readSQL=name=>fs.readFileSync(path.join(__dirname,'../../supabase',name),'utf8');
async function createRolesDB(){
 const db=new PGlite();await db.waitReady;
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
 grant usage on schema public,auth,storage to anon,authenticated;
 `);
 await db.exec(readSQL('schema.sql'));
 // Privilegios iniciales de tablas que Supabase normalmente crea por defecto.
 await db.exec('grant all on all tables in schema public,storage to anon,authenticated;grant usage on all sequences in schema public to anon,authenticated;');
 await db.exec(readSQL('soporte.sql'));await db.exec(readSQL('gestion_empresarial.sql'));
 const users={};for(const role of ['admin','employee','accountant','unassigned']){users[role]=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[users[role],role+'@example.com'])}
 await db.query('insert into public.admins(user_id) values($1)',[users.admin]);
 await db.exec(readSQL('roles.sql'));
 await db.query("select public.assign_staff_role('employee@example.com','employee'),public.assign_staff_role('accountant@example.com','accountant')");
 const branch=(await db.query("select id from public.branches where code='CHIMBOTE'")).rows[0].id;
 await db.query('insert into public.employees(full_name,document_number,job_title,branch_id) values($1,$2,$3,$4)',['Empleado Privado','12345678','Ventas',branch]);
 await db.exec(`insert into public.orders(id,customer,items,total,created_at) values
 ('PRIVATE-ORDER-1','{"name":"Cliente Privado","dni":"12345678","email":"privado@example.com","phone":"999111222","address":"Dirección privada"}','[{"id":1,"name":"Laptop histórica","price":100,"qty":1}]',100,now()-interval '1 minute'),
 ('PRIVATE-ORDER-2','{"name":"Otro Cliente"}','[{"id":1,"name":"Nombre anterior de laptop","price":50,"qty":1}]',50,now()-interval '2 minutes'),
 ('PRIVATE-ORDER-OLD','{"name":"Cliente anterior"}','[{"id":99,"name":"Producto retirado","price":25,"qty":2}]',50,((now() at time zone 'America/Lima')::date-7+time '00:00') at time zone 'America/Lima');`);
 return {db,users,branch,readSQL};
}
module.exports={createRolesDB,readSQL};
