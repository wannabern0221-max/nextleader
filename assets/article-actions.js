(async()=>{
  const params=new URLSearchParams(location.search);
  const id=params.get('id');
  const client=window.knaSupabase;
  const actions=document.querySelector('#articleManagementActions');
  const edit=document.querySelector('#articleEditButton');
  const remove=document.querySelector('#articleDeleteButton');
  const message=document.querySelector('#articleActionMessage');
  if(!id||!client||!window.SUPABASE_CONFIG_READY||!actions)return;
  const show=(text,type='info')=>{message.className=`auth-message show ${type}`;message.textContent=text;};
  const listUrl=category=>({notice:'notice.html',card:'cards.html',policy:'policy.html',activity_report:'activity-documents.html',business_plan:'activity-documents.html',project_plan:'activity-documents.html'}[category]||'content-manager.html');
  try{
    const{data:s}=await client.auth.getSession();
    if(!s.session)return;
    const{data,error}=await client.rpc('get_content_action_access_v1',{p_post_id:id});
    if(error)throw error;
    if(!data?.found||(!data.can_edit&&!data.can_delete))return;
    edit.hidden=!data.can_edit;
    remove.hidden=!data.can_delete;
    edit.href=`content-editor.html?id=${encodeURIComponent(id)}&return=${encodeURIComponent(location.pathname.split('/').pop()+location.search)}`;
    actions.hidden=false;
    remove.addEventListener('click',async()=>{
      if(!confirm('이 게시물을 삭제하시겠습니까?\n삭제 후 일반 화면에서는 표시되지 않으며 관리 화면에서 복원할 수 있습니다.'))return;
      remove.disabled=true;
      const{error:deleteError}=await client.rpc('soft_delete_content_v1',{p_post_id:id});
      remove.disabled=false;
      if(deleteError){show(deleteError.message,'error');return;}
      show('게시물을 삭제했습니다.','success');
      setTimeout(()=>location.href=`${listUrl(data.category)}?deleted=1`,650);
    });
  }catch(error){console.warn('게시물 관리 권한을 확인하지 못했습니다.',error);}
})();
