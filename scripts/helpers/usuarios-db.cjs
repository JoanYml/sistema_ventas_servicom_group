const {createRolesDB}=require('./roles-db.cjs');
async function createUsersDB(){
 const setup=await createRolesDB();
 await setup.db.exec('alter table auth.users add column created_at timestamptz default now(),add column last_sign_in_at timestamptz');
 await setup.db.exec(setup.readSQL('ventas_contabilidad.sql'));
 await setup.db.exec(setup.readSQL('usuarios_auditoria.sql'));
 return setup;
}
module.exports={createUsersDB};
