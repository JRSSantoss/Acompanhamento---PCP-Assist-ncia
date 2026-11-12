// Acompanhamento de Pedidos | PCP & Assistência · Firebase Auth / Firestore (anexos em blocos no Spark)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  signOut, setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import {
  getFirestore, collection, doc, addDoc, getDoc, getDocs, setDoc, writeBatch, onSnapshot,
  runTransaction, serverTimestamp, orderBy, query
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';
import {
  getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-storage.js';
import { firebaseConfig } from './firebase-config.js';

// App nomeado e isolado do painel SAT, em projeto Firebase exclusivo.
const app=initializeApp(firebaseConfig,'pedidosPCPASS'),auth=getAuth(app),db=getFirestore(app),storage=getStorage(app);
const $=id=>document.getElementById(id);
const label={pendente:'Pendente',confirmado:'Confirmado',recusado:'Recusado'};
const states=['pendente','confirmado','recusado'];
const fieldNames={pv:'PV',client:'Cliente',salesperson:'Vendedor',equipment:'Equipamento',agreedDate:'Prazo combinado'};
const fileTypes=new Set(['application/pdf','image/jpeg','image/png','image/webp']);
const MAX_SIZE=2*1024*1024,MAX_FILES=3,CHUNK_SIZE=96*1024; // Spark: aprox. 128 KiB base64 por documento
let currentUser=null,profile=null,records=[],activeId=null,historyComments=[],historyEvents=[];
let unsubscribeRecords=null,unsubscribeComments=null,unsubscribeEvents=null;
let nextMessageTimer=null;

function escapeHTML(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function clean(v){return String(v??'').trim();}
function nowISO(){return new Date().toISOString();}
function localDay(value){const d=new Date(value);if(Number.isNaN(d.valueOf()))return '';return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function dateValue(v){if(!v)return '';if(typeof v?.toDate==='function')return v.toDate().toISOString();return String(v);}
function prettyTime(v){const d=new Date(dateValue(v));return Number.isNaN(d.valueOf())?'—':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});}
function displayDate(v){if(!v||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v))return 'Não definida';const [year,month,day]=v.split('-');return day+'/'+month+'/'+year;}
function activeOrders(){return records.filter(r=>r.deleted!==true);}
function isDeleted(r){return r?.deleted===true;}

function errors(e){if(e?.code==='auth/invalid-credential')return 'E-mail ou senha incorretos.';if(e?.code==='auth/too-many-requests')return 'Muitas tentativas. Tente novamente mais tarde.';if(e?.code==='permission-denied'||e?.code==='storage/unauthorized')return 'Permissão negada. Verifique seu perfil de acesso e as regras no Firebase.';if(e?.code==='storage/bucket-not-found'||e?.code==='storage/unauthenticated')return 'Cloud Storage indisponível. Verifique o bucket, o plano Blaze e o login.';return e?.message||String(e);}
function notice(message,type='info'){$('systemNoticeText').textContent=message;$('systemNotice').className='banner'+(type==='error'?' error':type==='ready'?' ready':'');}
function toast(message,isError=false){const n=$('toast');n.textContent=message;n.className='toast'+(isError?' error':'');clearTimeout(nextMessageTimer);nextMessageTimer=setTimeout(()=>n.classList.add('hidden'),5500);}
function showLogin(message='Entre para acessar os pedidos.'){clearSubscriptions();profile=null;currentUser=null;$('appView').classList.add('hidden');$('userChip').classList.add('hidden');$('loginView').classList.remove('hidden');notice(message);}
function clearSubscriptions(){if(unsubscribeRecords){unsubscribeRecords();unsubscribeRecords=null;}stopHistory();if($('detailsDialog').open)$('detailsDialog').close();records=[];activeId=null;}
function stopHistory(){if(unsubscribeComments){unsubscribeComments();unsubscribeComments=null;}if(unsubscribeEvents){unsubscribeEvents();unsubscribeEvents=null;}historyComments=[];historyEvents=[];}
function isEnabledProfile(d){return !!d&&d.ativo===true&&typeof d.nome==='string'&&d.nome.trim().length>0;}
// Perfil é definido pelo administrador no documento /usuarios/{uid}, nunca escolhido pelo usuário.
// Valores aceitos para o campo papel: 'PCP', 'Assistência' ou 'Assistência Técnica'.
function sector(){
  const role=clean(profile?.role);
  if(role==='PCP')return 'PCP';
  if(role==='Assistência'||role==='Assistência Técnica')return 'Assistência';
  return '';
}
function canEditStatus(field){
  return (field==='pcpStatus'&&sector()==='PCP') ||
         (field==='assistStatus'&&sector()==='Assistência');
}
function sectorNotice(){
  const s=sector();
  return s==='PCP'?'Seu perfil pode alterar somente o status PCP.':
    s==='Assistência'?'Seu perfil pode alterar somente o status Assistência.':
    'Seu perfil não tem autorização para alterar os status PCP e Assistência. Confira o campo papel no Firebase.';
}

// Credenciais são geridas exclusivamente no console Firebase. O usuário nunca escolhe
// o próprio nome no cliente: ele é lido de /usuarios/{uid}, protegido por rules.
setPersistence(auth,browserLocalPersistence).catch(e=>notice('Falha ao configurar persistência: '+errors(e),'error'));
onAuthStateChanged(auth,async user=>{
  clearSubscriptions();
  if(!user){showLogin();return;}
  try{
    const profileSnap=await getDoc(doc(db,'usuarios',user.uid));
    if(!profileSnap.exists()||!isEnabledProfile(profileSnap.data())){
      await signOut(auth);showLogin('Sua conta ainda não foi autorizada. Peça ao administrador para criar /usuarios/'+user.uid+' com nome e ativo=true.');return;
    }
    currentUser=user;profile={nome:clean(profileSnap.data().nome),role:clean(profileSnap.data().papel)};
    $('userName').textContent=profile.nome;$('userEmail').textContent=user.email||'';$('userSector').textContent=sector()||'Sem setor definido';
    $('userInitial').textContent=profile.nome.trim().charAt(0).toUpperCase();$('userChip').classList.remove('hidden');
    $('loginView').classList.add('hidden');$('appView').classList.remove('hidden');notice('Conectado. Os pedidos estão sincronizados com o Firestore.','ready');
    subscribeOrders();
  }catch(e){showLogin('Não foi possível validar o perfil: '+errors(e));}
});
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();const email=clean($('loginEmail').value),password=$('loginPassword').value;
  $('loginBtn').disabled=true;try{await signInWithEmailAndPassword(auth,email,password);$('loginPassword').value='';}
  catch(error){toast(errors(error),true);notice(errors(error),'error');}
  finally{$('loginBtn').disabled=false;}
});
$('logoutBtn').addEventListener('click',async()=>{try{await signOut(auth);}catch(e){toast(errors(e),true);}});

function subscribeOrders(){
  if(unsubscribeRecords)unsubscribeRecords();
  unsubscribeRecords=onSnapshot(collection(db,'pedidos'),snap=>{
    records=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(dateValue(b.createdAt)||'').localeCompare(dateValue(a.createdAt)||''));
    renderTable();renderDashboard();renderLogs();
    if(activeId){const r=records.find(x=>x.id===activeId);if(r)updateModalData(r);else closeDetails();}
    notice('Firebase conectado · '+activeOrders().length+' pedido(s) ativo(s).','ready');
  },e=>{notice('Erro de sincronização: '+errors(e),'error');toast(errors(e),true);});
}
function statusHTML(s){return `<span class="pill ${states.includes(s)?s:'pendente'}">${label[s]||'Pendente'}</span>`;}
function selectHTML(id,field,value){
  if(!canEditStatus(field)){
    // Outro setor pode visualizar normalmente, mas não vê um editor de status.
    return `<span class="pill ${states.includes(value)?value:'pendente'}" title="Somente o setor ${field==='pcpStatus'?'PCP':'Assistência'} pode alterar este status">${label[value]||'Pendente'}</span>`;
  }
  return `<select class="status" aria-label="Alterar ${field==='pcpStatus'?'status PCP':'status Assistência'}" data-id="${escapeHTML(id)}" data-field="${field}" data-value="${escapeHTML(value)}">${states.map(s=>`<option value="${s}" ${value===s?'selected':''}>${label[s]}</option>`).join('')}</select>`;
}
function filteredOrders(){const search=clean($('search').value).toLowerCase(),pcp=$('pcpFilter').value,ass=$('assistFilter').value;return activeOrders().filter(r=>(pcp==='todos'||pcp===r.pcpStatus)&&(ass==='todos'||ass===r.assistStatus)&&[r.pv,r.client,r.salesperson,r.equipment].some(v=>String(v||'').toLowerCase().includes(search)));}
function renderTable(){
 const r=filteredOrders();$('recordCount').textContent=r.length+' de '+activeOrders().length;
 $('recordsBody').innerHTML=r.length?r.map(v=>`<tr tabindex="0" data-open="${escapeHTML(v.id)}">
 <td>${escapeHTML(prettyTime(v.createdAt))}</td><td><span class="pv">${escapeHTML(v.pv||'Não informado')}</span></td><td><span class="client">${escapeHTML(v.client)}</span></td>
 <td>${escapeHTML(v.salesperson)}</td><td>${escapeHTML(v.equipment)}</td><td><span class="deadline ${v.agreedDate?'':'not-set'}">${escapeHTML(displayDate(v.agreedDate))}</span></td>
 <td>${selectHTML(v.id,'pcpStatus',v.pcpStatus)}</td><td>${selectHTML(v.id,'assistStatus',v.assistStatus)}</td>
 <td class="actions-cell"><div class="button-row"><button class="btn btn-sm detail-btn" type="button" data-id="${escapeHTML(v.id)}">Detalhes</button><button class="btn btn-sm btn-outline-danger" type="button" data-delete="${escapeHTML(v.id)}" aria-label="Excluir pedido ${escapeHTML(v.pv||v.client)} da lista">Excluir</button></div></td></tr>`).join(''):'<tr><td colspan="9" class="empty">Nenhum pedido corresponde aos filtros selecionados.</td></tr>';
}
$('search').addEventListener('input',renderTable);$('pcpFilter').addEventListener('change',renderTable);$('assistFilter').addEventListener('change',renderTable);
$('recordsBody').addEventListener('click',e=>{
 const del=e.target.closest('button[data-delete]');if(del){e.stopPropagation();confirmDelete(del.dataset.delete);return;}
 if(e.target.closest('select'))return;
 const tr=e.target.closest('tr[data-open]');if(tr)openDetails(tr.dataset.open);
});
$('recordsBody').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.tagName==='TR'){e.preventDefault();openDetails(e.target.dataset.open);}});
$('recordsBody').addEventListener('change',async e=>{
  const select=e.target.closest('select[data-field]');if(!select)return;
  const old=records.find(r=>r.id===select.dataset.id)?.[select.dataset.field];if(!old)return;
  if(!canEditStatus(select.dataset.field)){select.value=old;toast('Você não tem permissão para alterar o status deste setor.',true);return;}
  select.disabled=true;try{await updateOrder(select.dataset.id,{[select.dataset.field]:select.value});toast('Alteração de status registrada no histórico.');}
  catch(err){select.value=old;toast(errors(err),true);}finally{select.disabled=false;}
});

async function confirmDelete(orderId){
 const order=records.find(r=>r.id===orderId);if(!order||isDeleted(order))return;
 if(!window.confirm(`Excluir o pedido ${order.pv||'sem PV'} (${order.client}) da lista ativa?\n\nEle ficará preservado na aba Registros, com nome e horário da exclusão. Essa ação não poderá ser desfeita pela interface.`))return;
 const btn=document.querySelector(`button[data-delete="${CSS.escape(orderId)}"]`);if(btn)btn.disabled=true;
 try{
  const orderRef=doc(db,'pedidos',orderId),eventRef=doc(collection(db,'pedidos',orderId,'eventos'));
  await runTransaction(db,async tx=>{
   const snap=await tx.get(orderRef);if(!snap.exists()||snap.data().deleted===true)throw Error('O pedido já foi excluído.');
   const before=snap.data(),rev=Number(before.revision||0)+1;
   tx.update(orderRef,{deleted:true,deletedAt:serverTimestamp(),deletedByUid:currentUser.uid,deletedByName:profile.nome,updatedAt:nowISO(),updatedAtServer:serverTimestamp(),updatedByUid:currentUser.uid,updatedByName:profile.nome,revision:rev,lastEventId:eventRef.id});
   tx.set(eventRef,{tipo:'exclusao',authorUid:currentUser.uid,authorName:profile.nome,createdAt:serverTimestamp(),revision:rev,
    beforePcp:before.pcpStatus,afterPcp:before.pcpStatus,beforeAssist:before.assistStatus,afterAssist:before.assistStatus,
    beforePv:before.pv,afterPv:before.pv,beforeClient:before.client,afterClient:before.client,
    beforeSalesperson:before.salesperson,afterSalesperson:before.salesperson,beforeEquipment:before.equipment,afterEquipment:before.equipment,
    beforeAgreedDate:before.agreedDate||'',afterAgreedDate:before.agreedDate||''});
  });
  toast(`Pedido ${order.pv||'sem PV'} retirado da lista. Registro preservado.`);
 }catch(err){toast('Não foi possível excluir: '+errors(err),true);}finally{if(btn)btn.disabled=false;}
}

function orderFieldsFromForm(prefix){return {pv:clean($(prefix+'PV').value),client:clean($(prefix+'Client').value),salesperson:clean($(prefix+'Sales').value),equipment:clean($(prefix+'Equipment').value)};}
function duplicatePV(pv,exceptId){const value=clean(pv).toLocaleLowerCase('pt-BR');if(!value)return false;return records.some(r=>r.id!==exceptId&&clean(r.pv).toLocaleLowerCase('pt-BR')===value);}
$('newOrderForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!profile)return;
  const r={pv:clean($('pv').value),client:clean($('client').value),salesperson:clean($('salesperson').value),equipment:clean($('equipment').value),agreedDate:$('agreedDate').value};
  if([r.client,r.salesperson,r.equipment].some(x=>!x))return toast('Preencha cliente, vendedor e equipamento.',true);
  if(duplicatePV(r.pv))return toast('Este número PV já existe.',true);
  $('createBtn').disabled=true;
  try{
    const orderRef=doc(collection(db,'pedidos'));
    const t=nowISO();await runTransaction(db,async tx=>{
      tx.set(orderRef,{id:orderRef.id,...r,deleted:false,pcpStatus:'pendente',assistStatus:'pendente',observations:'',createdAt:t,updatedAt:t,updatedAtServer:serverTimestamp(),createdByUid:currentUser.uid,createdByName:profile.nome,updatedByUid:currentUser.uid,updatedByName:profile.nome,revision:0,lastEventId:''});
    });
    $('newOrderForm').reset();toast('Pedido registrado com sucesso.');
  }catch(err){toast(errors(err),true);}finally{$('createBtn').disabled=false;}
});

const auditFields=['pv','client','salesperson','equipment','agreedDate','pcpStatus','assistStatus'];
async function updateOrder(orderId,patch){
  if(!currentUser||!profile)throw Error('Faça login para atualizar.');
  const orderRef=doc(db,'pedidos',orderId),eventRef=doc(collection(db,'pedidos',orderId,'eventos'));
  return await runTransaction(db,async tx=>{
    const snap=await tx.get(orderRef);if(!snap.exists())throw Error('Pedido não encontrado.');
    if(snap.data().deleted===true)throw Error('Pedido excluído: disponível somente para consulta.');
    const before=snap.data(),after={...before,...patch};
    const changed=auditFields.filter(f=>String(before[f]??'')!==String(after[f]??''));
    // Verificação no aplicativo; as mesmas restrições são obrigatórias nas regras do Firestore.
    if(changed.includes('pcpStatus')&&!canEditStatus('pcpStatus'))throw Error('Somente o PCP pode alterar o status PCP.');
    if(changed.includes('assistStatus')&&!canEditStatus('assistStatus'))throw Error('Somente a Assistência pode alterar o status Assistência.');
    if(!changed.length)return false;
    const revision=Number(before.revision||0)+1;
    tx.update(orderRef,{...patch,updatedAt:nowISO(),updatedAtServer:serverTimestamp(),updatedByUid:currentUser.uid,updatedByName:profile.nome,revision,lastEventId:eventRef.id});
    tx.set(eventRef,{
      tipo:'alteracao',authorUid:currentUser.uid,authorName:profile.nome,createdAt:serverTimestamp(),revision,
      beforePcp:before.pcpStatus,afterPcp:after.pcpStatus,beforeAssist:before.assistStatus,afterAssist:after.assistStatus,
      beforePv:before.pv,afterPv:after.pv,beforeClient:before.client,afterClient:after.client,
      beforeSalesperson:before.salesperson,afterSalesperson:after.salesperson,
      beforeEquipment:before.equipment,afterEquipment:after.equipment,beforeAgreedDate:before.agreedDate||'',afterAgreedDate:after.agreedDate||''
    });
    return true;
  });
}

function openDetails(id){const r=records.find(x=>x.id===id);if(!r)return;activeId=id;updateModalData(r);$('commentAuthor').textContent=profile?.nome||'—';$('commentText').value='';$('fileInput').value='';$('selectedFiles').textContent='Nenhum arquivo selecionado.';historyComments=[];historyEvents=[];renderTimeline();$('detailsDialog').showModal();subscribeHistory(id);}
function updateModalData(r){$('modalPV').textContent=r.pv||'sem PV';$('createdTime').textContent=prettyTime(r.createdAt);$('updatedTime').textContent=prettyTime(r.updatedAtServer||r.updatedAt);$('updatedBy').textContent=r.updatedByName||r.createdByName||'Registro anterior';
 const values={editPV:r.pv,editClient:r.client,editSales:r.salesperson,editEquipment:r.equipment,editAgreedDate:r.agreedDate||'',editPCP:r.pcpStatus,editAssist:r.assistStatus};
 // Não sobrescreve alterações ainda não salvas quando o usuário está digitando.
 if(!document.activeElement?.closest('#editForm'))for(const [id,val]of Object.entries(values))$(id).value=val;
 // Enquanto o usuário edita, a sincronização não substitui os campos do formulário.
 const archived=isDeleted(r);
 document.querySelectorAll('#editForm input, #editForm select').forEach(el=>{el.disabled=archived;});
 if(!archived){$('editPCP').disabled=!canEditStatus('pcpStatus');$('editAssist').disabled=!canEditStatus('assistStatus');}
 $('saveOrderBtn').classList.toggle('hidden',archived);$('commentForm').classList.toggle('hidden',archived);
 $('modalArchivedNotice').classList.toggle('hidden',!archived);
 $('statusAccessNote').textContent=archived?'Pedido excluído por '+(r.deletedByName||'Usuário')+' em '+prettyTime(r.deletedAt)+'. Apenas leitura.':sectorNotice();
 $('legacyNote').textContent=r.observations?'Observações herdadas da versão anterior: '+r.observations:'';$('legacyNote').classList.toggle('hidden',!r.observations);
}
function closeDetails(){if($('detailsDialog').open)$('detailsDialog').close();stopHistory();activeId=null;}
$('closeDialog').addEventListener('click',closeDetails);$('closeDialogTop').addEventListener('click',closeDetails);$('detailsDialog').addEventListener('close',()=>{stopHistory();activeId=null;});
$('editForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!activeId)return;
 const r={pv:clean($('editPV').value),client:clean($('editClient').value),salesperson:clean($('editSales').value),equipment:clean($('editEquipment').value),agreedDate:$('editAgreedDate').value};
 // Não incluir o status do outro setor nem reenviar valor antigo em uma edição concorrente.
 if(canEditStatus('pcpStatus'))r.pcpStatus=$('editPCP').value;
 if(canEditStatus('assistStatus'))r.assistStatus=$('editAssist').value;
 if([r.client,r.salesperson,r.equipment].some(x=>!x))return toast('Preencha cliente, vendedor e equipamento.',true);
 if(duplicatePV(r.pv,activeId))return toast('Este PV já pertence a outro pedido.',true);
 $('saveOrderBtn').disabled=true;try{const changed=await updateOrder(activeId,r);toast(changed?'Alterações registradas com autor e horário.':'Nenhuma alteração realizada.');}
 catch(err){toast(errors(err),true);}finally{$('saveOrderBtn').disabled=false;}
});

function subscribeHistory(id){stopHistory();const sub=collection(db,'pedidos',id,'interacoes'),events=collection(db,'pedidos',id,'eventos');
  unsubscribeComments=onSnapshot(query(sub,orderBy('createdAt','asc')),snap=>{if(activeId!==id)return;historyComments=snap.docs.map(d=>({id:d.id,...d.data()}));renderTimeline();},e=>{toast('Erro no histórico de interações: '+errors(e),true);});
  unsubscribeEvents=onSnapshot(query(events,orderBy('createdAt','asc')),snap=>{if(activeId!==id)return;historyEvents=snap.docs.map(d=>({id:d.id,...d.data()}));renderTimeline();},e=>{toast('Erro no histórico de alterações: '+errors(e),true);});
}
function eventsDiff(v){const pairs=[['Status PCP',v.beforePcp,v.afterPcp],['Status Assistência',v.beforeAssist,v.afterAssist],['PV',v.beforePv,v.afterPv],['Cliente',v.beforeClient,v.afterClient],['Vendedor',v.beforeSalesperson,v.afterSalesperson],['Equipamento',v.beforeEquipment,v.afterEquipment],['Prazo combinado',v.beforeAgreedDate,v.afterAgreedDate]];
 return pairs.filter(([_,a,b])=>String(a??'')!==String(b??''));}
function renderTimeline(){
 const order=records.find(r=>r.id===activeId);
 const entries=[...historyComments.map(r=>({...r,kind:'comment'})),...historyEvents.map(r=>({...r,kind:'audit'}))].sort((a,b)=>dateValue(a.createdAt).localeCompare(dateValue(b.createdAt)));
 $('historyCount').textContent=String(entries.length);
 const html=entries.map(v=>{
   const author=v.authorName||v.author||'Autor desconhecido',date=prettyTime(v.createdAt||v.clientCreatedAt);
   if(v.kind==='audit'){
     const diffs=eventsDiff(v);return `<article class="entry audit"><div class="byline"><strong>✦ ${escapeHTML(author)} · ${v.tipo==='exclusao'?'exclusão do pedido':'alteração de pedido'}</strong><time>${escapeHTML(date)}</time></div>${v.tipo==='exclusao'?'<p>Pedido retirado da lista ativa e preservado nos Registros.</p>':''}${diffs.map(([field,from,to])=>`<div class="change-line"><span class="change-label">${escapeHTML(field)}:</span><span class="change-before">${escapeHTML(label[from]||from||'—')}</span><span>→</span><span class="change-after">${escapeHTML(label[to]||to||'—')}</span></div>`).join('')||'<p>Atualização registrada.</p>'}</article>`;
   }
   const att=Array.isArray(v.attachments)?v.attachments:[];
   return `<article class="entry ${v.authorUid?'':'legacy'}"><div class="byline"><strong>◉ ${escapeHTML(author)}${v.authorUid?'':' · registro anterior'}</strong><time>${escapeHTML(date)}</time></div>${v.message?`<p>${escapeHTML(v.message)}</p>`:''}${att.length?`<div class="attachment-list">${att.map((a,i)=>`<span class="attachment-actions"><span>📎 ${escapeHTML(a.name||'Anexo')}</span><button class="attachment" type="button" data-attachment-action="open" data-attach-event="${escapeHTML(v.id)}" data-attach-index="${i}">Abrir</button><button class="attachment" type="button" data-attachment-action="download" data-attach-event="${escapeHTML(v.id)}" data-attach-index="${i}">Baixar</button></span>`).join('')}</div>`:''}</article>`;
 }).join('');
 const legacy=order?.observations?`<article class="entry legacy"><div class="byline"><strong>Observações anteriores</strong><time>Sem autor e horário original</time></div><p>${escapeHTML(order.observations)}</p></article>`:'';
 const created=order?`<article class="entry legacy"><div class="byline"><strong>Pedido criado${order.createdByName?' por '+escapeHTML(order.createdByName):''}</strong><time>${escapeHTML(prettyTime(order.createdAt))}</time></div><p>PCP e Assistência: Pendente.</p></article>`:'';
 $('timeline').innerHTML=created+legacy+html||'<div class="empty-history">Nenhuma interação registrada.</div>';
}
// Abrir ou baixar arquivos salvos no Firestore (sem Cloud Storage / plano Blaze).
// Os anexos Storage da versão anterior ainda podem ser abertos, se o bucket existir.
function downloadBlob(blob,filename,mode='download'){
 const url=URL.createObjectURL(blob);
 if(mode==='open'){
   const tab=window.open('about:blank','_blank');
   if(tab){tab.opener=null;tab.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),120000);return;}
 }
 const link=document.createElement('a');link.href=url;link.download=filename||'anexo';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),120000);
}
function base64Chunk(bytes){
 let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(s);
}
async function loadFirestoreAttachment(orderId,attachment){
 const id=attachment.id;
 if(!id||!(/^[A-Za-z0-9_-]{8,80}$/).test(id))throw Error('Identificador de anexo inválido.');
 const metaRef=doc(db,'pedidos',orderId,'arquivos',id);
 const snap=await getDoc(metaRef);
 if(!snap.exists())throw Error('Anexo não encontrado no banco de dados.');
 const meta=snap.data();
 if(!Number.isInteger(meta.chunks)||meta.chunks<1||meta.chunks>24||meta.size>MAX_SIZE)throw Error('Anexo fora dos limites permitidos.');
 const parts=await getDocs(query(collection(metaRef,'partes'),orderBy('index','asc')));
 if(parts.size!==meta.chunks)throw Error('O arquivo ainda não está completo (faltam blocos).');
 const bytes=[];let total=0;
 for(let i=0;i<meta.chunks;i++){
  const p=parts.docs[i].data();if(p.index!==i)throw Error('Sequência inválida dos blocos.');
  const binary=atob(p.data);const chunk=Uint8Array.from(binary,c=>c.charCodeAt(0));bytes.push(chunk);total+=chunk.length;
 }
 if(total!==meta.size)throw Error('O tamanho do anexo não corresponde ao arquivo original.');
 return new Blob(bytes,{type:meta.type});
}
$('timeline').addEventListener('click',async e=>{
 const b=e.target.closest('button[data-attach-event]');if(!b||!activeId)return;
 const r=historyComments.find(x=>x.id===b.dataset.attachEvent),a=r?.attachments?.[Number(b.dataset.attachIndex)];if(!a)return;
 const orderId=activeId, mode=b.dataset.attachmentAction||'open';
 // A janela é aberta dentro do clique: navegadores bloqueiam popups abertos depois de await.
 const popup=mode==='open'?window.open('about:blank','_blank'):null;
 if(popup){popup.opener=null;popup.document.title='Carregando anexo';popup.document.body.textContent='Carregando anexo...';}
 b.disabled=true;
 try{
  if(a.source==='firestore'){
   const blob=await loadFirestoreAttachment(orderId,a),url=URL.createObjectURL(blob);
   if(mode==='open'&&popup){popup.location.href=url;}
   else{if(popup)popup.close();const link=document.createElement('a');link.href=url;link.download=a.name||'anexo';document.body.appendChild(link);link.click();link.remove();}
   setTimeout(()=>URL.revokeObjectURL(url),120000);
  }else if(a.path){
   // Compatibilidade com anexos previamente armazenados no Cloud Storage.
   const url=await getDownloadURL(storageRef(storage,a.path));
   if(mode==='open'&&popup){popup.location.href=url;}
   else{if(popup)popup.close();const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';if(mode==='download')link.download=a.name||'anexo';link.click();}
  }else throw Error('Anexo sem localização válida.');
 }catch(err){if(popup&&!popup.closed)popup.close();toast('Não foi possível abrir o anexo: '+errors(err),true);}
 finally{b.disabled=false;}
});
$('fileInput').addEventListener('change',()=>{
 const files=Array.from($('fileInput').files||[]);
 $('selectedFiles').textContent=files.length?files.map(f=>f.name+' ('+(f.size/1024/1024).toFixed(2)+' MB)').join(' · '):'Nenhum arquivo selecionado.';
});
function newFileId(){if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();const bytes=new Uint8Array(16);globalThis.crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
function checkFiles(files){
 if(files.length>MAX_FILES)throw Error('Selecione no máximo 3 arquivos por interação.');
 for(const f of files){if(!fileTypes.has(f.type))throw Error('Formato não permitido: '+f.name+'. Use JPG, PNG, WEBP ou PDF.');if(f.size<=0||f.size>MAX_SIZE)throw Error('O arquivo '+f.name+' está vazio ou ultrapassa 2 MB. Comprima-o antes de anexar.');}
}
async function saveFileInFirestore(orderId,interactionId,file,onProgress){
 const fileId=newFileId(),data= new Uint8Array(await file.arrayBuffer()),n=Math.ceil(data.length/CHUNK_SIZE);
 if(n<1||n>24)throw Error('Arquivo fora do limite de blocos.');
 const metaRef=doc(db,'pedidos',orderId,'arquivos',fileId);
 await setDoc(metaRef,{
  authorUid:currentUser.uid,interactionId,name:file.name.slice(0,140),type:file.type,size:file.size,chunks:n,createdAt:serverTimestamp()
 });
 // Escreve em pequenos lotes para não ultrapassar limites de operações nas regras.
 for(let i=0;i<n;i+=6){
  const batch=writeBatch(db);
  for(let j=i;j<Math.min(i+6,n);j++){
   const piece=data.subarray(j*CHUNK_SIZE,(j+1)*CHUNK_SIZE);
   batch.set(doc(collection(metaRef,'partes'),String(j).padStart(4,'0')),{authorUid:currentUser.uid,index:j,data:base64Chunk(piece)});
  }
  await batch.commit();onProgress(Math.min(i+6,n)/n);
 }
 return {source:'firestore',id:fileId,name:file.name.slice(0,140),type:file.type,size:file.size};
}
$('commentForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!activeId||!currentUser||!profile)return;
 const message=clean($('commentText').value),files=Array.from($('fileInput').files||[]);
 if(!message&&!files.length)return toast('Adicione um comentário ou pelo menos um anexo.',true);
 try{checkFiles(files);}catch(err){return toast(errors(err),true);}
 $('sendCommentBtn').disabled=true;const id=activeId;
 $('uploadProgress').classList.toggle('hidden',!files.length);$('uploadProgressBar').style.width='0%';
 try{
  const commentRef=doc(collection(db,'pedidos',id,'interacoes')),attachments=[];
  for(let i=0;i<files.length;i++){
   const f=files[i];const attachment=await saveFileInFirestore(id,commentRef.id,f,fraction=>{
    $('uploadProgressBar').style.width=(((i+fraction)/files.length)*100).toFixed(1)+'%';
   });attachments.push(attachment);
  }
  // O histórico é publicado somente após a conclusão de todos os blocos dos anexos.
  await runTransaction(db,async tx=>{
   const snap=await tx.get(doc(db,'pedidos',id));if(!snap.exists()||snap.data().deleted===true)throw Error('Pedido excluído ou indisponível.');
   tx.set(commentRef,{tipo:'comentario',authorUid:currentUser.uid,authorName:profile.nome,message,attachments,createdAt:serverTimestamp()});
  });
  if(activeId===id){$('commentText').value='';$('fileInput').value='';$('selectedFiles').textContent='Nenhum arquivo selecionado.';}
  toast('Interação e anexos registrados no Firestore com autoria automática.');
 }catch(err){toast('Falha ao registrar: '+errors(err)+'. Arquivos parcialmente enviados podem precisar de limpeza pelo administrador.',true);}
 finally{$('sendCommentBtn').disabled=false;$('uploadProgress').classList.add('hidden');}
});

function logEntries(){
 const result=[];
 for(const r of records){
  result.push({key:r.id+':created',id:r.id,tipo:'criado',pv:r.pv,client:r.client,author:r.createdByName||'Autor não registrado',date:r.createdAt,deleted:isDeleted(r)});
  if(isDeleted(r))result.push({key:r.id+':deleted',id:r.id,tipo:'excluido',pv:r.pv,client:r.client,author:r.deletedByName||'Autor não registrado',date:r.deletedAt,deleted:true});
 }
 return result.sort((a,b)=>dateValue(b.date).localeCompare(dateValue(a.date)));
}
function renderLogs(){
 const term=clean($('logSearch').value).toLowerCase(),kind=$('logTypeFilter').value;
 const all=logEntries(),rows=all.filter(r=>(kind==='todos'||kind===r.tipo)&&[r.pv,r.client,r.author].some(v=>String(v||'').toLowerCase().includes(term)));
 $('registrosBadge').textContent=String(all.length);
 $('registrosCount').textContent=rows.length+' de '+all.length+' registros';
 $('logsBody').innerHTML=rows.length?rows.map(r=>`<tr><td>${escapeHTML(prettyTime(r.date))}</td><td><span class="register-pill ${r.tipo==='excluido'?'deleted':''}">${r.tipo==='criado'?'Criado':'Excluído'}</span></td><td><span class="pv">${escapeHTML(r.pv||'Não informado')}</span></td><td>${escapeHTML(r.client)}</td><td>${escapeHTML(r.author)}</td><td><span class="state-pill ${r.deleted?'deleted':''}">${r.deleted?'Excluído da lista':'Ativo'}</span></td><td><button class="btn btn-sm" type="button" data-log-detail="${escapeHTML(r.id)}">Detalhes</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Nenhum registro encontrado.</td></tr>';
}
$('logSearch').addEventListener('input',renderLogs);$('logTypeFilter').addEventListener('change',renderLogs);
$('logsBody').addEventListener('click',e=>{const b=e.target.closest('button[data-log-detail]');if(b)openDetails(b.dataset.logDetail);});

document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{
 document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('selected',x===b));
 document.querySelectorAll('.page').forEach(x=>x.classList.toggle('hidden',x.id!==b.dataset.page));
 if(b.dataset.page==='dashboardPage')renderDashboard();
}));
function statsFor(rows){
 const pcp={pendente:0,confirmado:0,recusado:0},assist={...pcp};let both=0;
 rows.forEach(r=>{if(pcp[r.pcpStatus]!==undefined)pcp[r.pcpStatus]++;if(assist[r.assistStatus]!==undefined)assist[r.assistStatus]++;if(r.pcpStatus==='confirmado'&&r.assistStatus==='confirmado')both++;});
 return {total:rows.length,pcp,assist,both};}
function inRange(){const start=$('dateFrom').value,end=$('dateTo').value;if(start&&end&&start>end)throw Error('A data inicial deve ser anterior à data final.');return activeOrders().filter(r=>{const day=localDay(r.createdAt);return (!start||day>=start)&&(!end||day<=end);});}
function percent(n,total){return total?Math.round(n*100/total):0;}
function barsHtml(counts,total){return states.map(s=>`<div class="bar"><div class="bar-head"><span>${label[s]}</span><strong>${counts[s]} (${percent(counts[s],total)}%)</strong></div><div class="track"><span class="fill ${s}" style="width:${percent(counts[s],total)}%"></span></div></div>`).join('');}
function renderDashboard(){try{const s=statsFor(inRange());$('totalStat').textContent=s.total;$('pcpStat').textContent=s.pcp.confirmado;$('assistStat').textContent=s.assist.confirmado;$('bothStat').textContent=s.both;$('pcpRate').textContent=percent(s.pcp.confirmado,s.total)+'% dos pedidos';$('assistRate').textContent=percent(s.assist.confirmado,s.total)+'% dos pedidos';$('bothRate').textContent=percent(s.both,s.total)+'% dos pedidos';$('pcpBars').innerHTML=barsHtml(s.pcp,s.total);$('assistBars').innerHTML=barsHtml(s.assist,s.total);$('periodLabel').textContent='Período: '+($('dateFrom').value||'início')+' até '+($('dateTo').value||'hoje');}
 catch(err){toast(errors(err),true);}}
['dateFrom','dateTo'].forEach(id=>$(id).addEventListener('change',renderDashboard));$('clearDates').addEventListener('click',()=>{$('dateFrom').value='';$('dateTo').value='';renderDashboard();});
function download(name,blob){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),40000);}
function csvCell(v){let s=String(v??'');if(/^[\s\t\r\n]*[=+@\-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
$('csvBtn').addEventListener('click',()=>{const cols=[['PV','pv'],['Cliente','client'],['Vendedor','salesperson'],['Equipamento','equipment'],['Prazo combinado','agreedDate'],['PCP','pcpStatus'],['Assistência','assistStatus'],['Criado em','createdAt'],['Atualizado em','updatedAt']];const lines=[cols.map(c=>csvCell(c[0])).join(';'),...activeOrders().map(r=>cols.map(([_,k])=>csvCell(r[k])).join(';'))];download('pedidos_'+localDay(new Date())+'.csv',new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}));toast('CSV exportado.');});
// PDF A4 com gráficos, gerado no navegador, sem serviço externo.
function canvasPdf(canvas){const data=canvas.toDataURL('image/jpeg',.9);const raw=atob(data.slice(data.indexOf(',')+1));const jpg=Uint8Array.from(raw,c=>c.charCodeAt(0)),enc=new TextEncoder();const parts=[];let pos=0;const offsets=[0];const push=x=>{const b=typeof x==='string'?enc.encode(x):x;parts.push(b);pos+=b.length;};const obj=(n,s)=>{offsets[n]=pos;push(`${n} 0 obj\n${s}\nendobj\n`);};push('%PDF-1.4\n%PDF-Generated\n');obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');obj(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>');offsets[4]=pos;push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);push(jpg);push('\nendstream\nendobj\n');const c='q\n595.28 0 0 841.89 0 0 cm\n/Im1 Do\nQ\n';obj(5,`<< /Length ${enc.encode(c).length} >>\nstream\n${c}endstream`);const xref=pos;push('xref\n0 6\n0000000000 65535 f \n');for(let i=1;i<=5;i++)push(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);return new Blob(parts,{type:'application/pdf'});}
function exportPdf(){let s;try{s=statsFor(inRange());}catch(e){return toast(errors(e),true);}const c=document.createElement('canvas');c.width=1240;c.height=1754;const x=c.getContext('2d');if(!x)return toast('Seu navegador não oferece suporte ao relatório.',true);
 const ink='#18364f',muted='#718497',bg='#f2f6fa',orange='#f28c39';function rect(px,py,w,h,color){x.fillStyle=color;x.fillRect(px,py,w,h);}function txt(str,px,py,size=22,color=ink,bold=false){x.fillStyle=color;x.font=(bold?'700':'400')+` ${size}px Arial`;x.fillText(String(str),px,py);}function card(px,py,w,h){rect(px,py,w,h,'white');x.strokeStyle='#dce5ed';x.lineWidth=2;x.strokeRect(px,py,w,h);}function bar(px,py,lbl,n,total,color){txt(lbl,px,py,21);txt(n+' / '+total,px+925,py,21,ink,true);rect(px,py+12,1000,14,'#e6edf2');if(n)rect(px,py+12,n/Math.max(1,total)*1000,14,color);}
 rect(0,0,1240,1754,bg);rect(0,0,1240,180,ink);rect(64,36,8,110,orange);txt('CONTROLE INTERNO · PCP & ASSISTÊNCIA',98,70,18,'#ffbe83',true);txt('Indicadores de Pedidos',98,126,51,'white',true);txt('Relatório de acompanhamento',99,160,23,'#dbe6ed');card(65,210,1110,110);txt('PERÍODO',93,249,18,muted,true);txt(($('dateFrom').value||'início')+' até '+($('dateTo').value||'hoje'),93,290,27,ink,true);
 const metrics=[['PEDIDOS',s.total,ink],['PCP CONFIRMADOS',s.pcp.confirmado,'#197f61'],['ASSISTÊNCIA',s.assist.confirmado,'#197f61'],['AMBOS',s.both,orange]];metrics.forEach(([name,n,color],i)=>{const px=65+i*282;card(px,350,264,167);rect(px+20,372,8,122,color);txt(name,px+40,392,16,muted,true);txt(n,px+42,471,68,color,true);});
 [['PCP',s.pcp,557],['ASSISTÊNCIA TÉCNICA',s.assist,982]].forEach(([name,v,py])=>{card(65,py,1110,372);txt('STATUS '+name,94,py+50,31,ink,true);bar(94,py+125,'Confirmado',v.confirmado,s.total,'#197f61');bar(94,py+207,'Recusado',v.recusado,s.total,'#aa4350');bar(94,py+289,'Pendente',v.pendente,s.total,orange);});
 card(65,1400,1110,165);txt('CONFIRMADOS PELOS DOIS SETORES',94,1456,28,ink,true);txt(s.both+' pedidos ('+percent(s.both,s.total)+'%)',94,1518,38,'#197f61',true);txt('Gerado em '+prettyTime(new Date()),66,1658,19,muted);txt('Acompanhamento de Pedidos | PCP e Assistência',66,1690,18,muted);
 download('indicadores_pedidos_'+($('dateFrom').value||'inicio')+'_'+($('dateTo').value||'fim')+'.pdf',canvasPdf(c));toast('PDF exportado com os indicadores do período.');}
$('pdfBtn').addEventListener('click',exportPdf);
