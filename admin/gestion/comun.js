let businessManagementActive=false,businessManagementTimer=null,managementSubmitting=false,managementTrigger=null,managementModalVersion=0;
let businessBranches=[];
const businessBranchName=id=>businessBranches.find(b=>b.id===id)?.name||'Sucursal no disponible';
function businessBranchOptions(selected='',all=false){return (all?'<option value="">Todas las sucursales</option>':'<option value="">Seleccionar sucursal</option>')+businessBranches.filter(b=>b.active).map(b=>`<option value="${b.id}" ${b.id===selected?'selected':''}>${escapeHTML(b.name)}</option>`).join('')}
function businessFillBranchSelect(id){const select=document.getElementById(id),value=select.value;select.innerHTML=businessBranchOptions(value,true);if(!businessBranches.some(b=>b.id===value))select.value=''}
function managementField(label,name,type='text',value='',extra=''){return `<label>${label}<input name="${name}" type="${type}" value="${escapeHTML(value)}" ${extra}></label>`}
function managementOpenModal(title,body,onSubmit=null,submitLabel='Guardar'){
 managementModalVersion++;managementTrigger=document.activeElement;$('#managementModalTitle').textContent=title;$('#managementModalBody').innerHTML=body;$('#managementModalFeedback').textContent='';$('#managementSubmit').disabled=false;$('#managementSubmit').hidden=!onSubmit;$('#managementSubmit').textContent=submitLabel;
 const request=crypto.randomUUID();$('#managementForm').onsubmit=async event=>{
  event.preventDefault();if(!onSubmit||managementSubmitting)return;managementSubmitting=true;$('#managementSubmit').disabled=true;$('#managementSubmit').textContent='Guardando…';$('#managementModalFeedback').textContent='';
  try{await onSubmit(new FormData(event.target),request);managementSubmitting=false;managementCloseModal();const ok=await reloadBusinessView(true);toast(ok?'Operación guardada correctamente':'Operación guardada. Actualiza el listado para ver los cambios.')}
  catch(error){$('#managementModalFeedback').textContent=managementError(error)}
  finally{managementSubmitting=false;$('#managementSubmit').disabled=false;$('#managementSubmit').textContent=submitLabel}
 };
 $('#managementModal').classList.remove('hidden');document.body.classList.add('management-dialog-open');
 const first=$('#managementModalBody').querySelector('input:not([type=hidden]),select,textarea,button');(first||$('#managementClose')).focus();
}
function managementCloseModal(){if(managementSubmitting)return;managementModalVersion++;$('#managementModal').classList.add('hidden');document.body.classList.remove('management-dialog-open');if(managementTrigger?.isConnected)managementTrigger.focus()}
$('#managementClose').onclick=managementCloseModal;$('#managementCancel').onclick=managementCloseModal;
$('#managementModal').onclick=event=>{if(event.target===$('#managementModal'))managementCloseModal()};
document.addEventListener('keydown',event=>{
 if($('#managementModal').classList.contains('hidden'))return;
 if(event.key==='Escape'){event.preventDefault();managementCloseModal()}
 if(event.key==='Tab'){const controls=[...$('#managementModal').querySelectorAll('button:not(:disabled),input:not([type=hidden]):not(:disabled),select:not(:disabled),textarea:not(:disabled)')].filter(e=>!e.hidden&&e.getClientRects().length),first=controls[0],last=controls.at(-1);if(!first){event.preventDefault();return}if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
});
function businessViewName(){return location.hash.slice(1)}
async function reloadBusinessView(force=false){if(!businessManagementActive)return false;const view=businessViewName();if(view==='empleados')return loadEmployees(force);if(view==='contabilidad')return loadFinance(force);return true}
function businessNavigate(view){if(businessManagementActive&&['empleados','contabilidad'].includes(view))reloadBusinessView(true)}
function startBusinessManagement(){businessManagementActive=true;reloadBusinessView();clearInterval(businessManagementTimer);businessManagementTimer=setInterval(()=>{if(!document.hidden&&!managementSubmitting&&$('#managementModal').classList.contains('hidden'))reloadBusinessView()},15000)}
function stopBusinessManagement(){businessManagementActive=false;clearInterval(businessManagementTimer);employeeLoadVersion++;financeLoadVersion++;employeeRows=[];employeesReady=false;employeeLoading=false;financeLoading=false;financeData=null;businessBranches=[];$('#employeeTable').replaceChildren();$('#financeJournalsBody').replaceChildren();$('#financeDocumentsBody').replaceChildren();managementCloseModal()}
