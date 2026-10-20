function supportErrorText(error,admin=false){
  if(["PGRST202","PGRST205","42P01","42883"].includes(error?.code))return admin?
    "Falta activar la bandeja de atención. Ejecuta supabase/soporte.sql en el SQL Editor de Supabase.":
    "La atención del equipo aún no está disponible. Puedes seguir usando las preguntas frecuentes e intentarlo más tarde.";
  if(error?.code==="P0001")return error.message;
  return "No se pudo conectar con atención. Comprueba tu conexión e inténtalo de nuevo.";
}
async function supportRPC(name,args){
  const result=await requireClient().rpc(name,args);
  if(result.error)throw result.error;
  return result.data;
}
const supportCreateRequest=(token,name,message)=>supportRPC("support_create_request",{p_token:token,p_name:name,p_message:message});
const supportLoadConversation=token=>supportRPC("support_get_conversation",{p_token:token});
const supportSendCustomer=(token,message)=>supportRPC("support_send_message",{p_token:token,p_message:message});
const supportAdminConversation=id=>supportRPC("support_admin_get",{p_id:id});
const supportAdminReply=(id,message)=>supportRPC("support_admin_reply",{p_id:id,p_message:message});
const supportAdminStatus=(id,status)=>supportRPC("support_admin_set_status",{p_id:id,p_status:status});
async function supportAdminList(){
  const rows=[];
  for(let offset=0;;offset+=200){
    const {data,error}=await requireClient().from("support_conversations")
      .select("id,customer_name,status,last_sender,last_message,created_at,updated_at")
      .order("updated_at",{ascending:false}).order("id").range(offset,offset+199);
    if(error)throw error;
    rows.push(...data);if(data.length<200)return rows;
  }
}
