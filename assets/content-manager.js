(async () => {
  const client=window.knaSupabase;
  const form=document.querySelector('#contentForm');
  const list=document.querySelector('#contentManagementList');
  const message=document.querySelector('#contentMessage');
  const title=document.querySelector('#contentFormTitle');
  let access, rows=[];
  const show=(text,type='info')=>{message.className=`auth-message show ${type}`;message.textContent=text;};
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const labels={notice:'공지사항',card:'카드뉴스',policy:'정책 콘텐츠'};
  const statusLabels={draft:'작성 중',review:'승인 요청',published:'게시 완료',rejected:'반려',hidden:'숨김'};
  const has=code=>window.KNA_ACCESS.has(access,code);
  const canApprove=()=>has('content_approve')||['policy_director','director','policy_general_manager','general_manager','senior_manager_div1','senior_manager_div2','senior_manager'].includes(access?.system_role);
  const canWrite=()=>access?.approval_status==='approved'&&access?.system_role!=='external_admin';

  if(!window.SUPABASE_CONFIG_READY||!client)return show('리더 서비스 연결 설정을 확인해 주세요.','error');
  try{const{data:s}=await client.auth.getSession();if(!s.session)return location.replace('login.html');const{data,error}=await client.rpc('get_my_access');if(error)throw error;access=data;if(!canWrite())return location.replace('dashboard.html');applyCategoryPermissions();await load();}catch(error){show(error.message||'콘텐츠 관리 화면을 불러오지 못했습니다.','error');}

  function applyCategoryPermissions(){[...form.category.options].forEach(opt=>{opt.disabled=false;});if(!form.category.value)form.category.value='notice';}
  form.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(form);const payload={id:String(fd.get('id')||''),category:String(fd.get('category')),title:String(fd.get('title')||''),summary:String(fd.get('summary')||''),body:String(fd.get('body')||''),cover_url:String(fd.get('cover_url')||'')};const submit=form.querySelector('button[type="submit"]');submit.disabled=true;const{data,error}=await client.rpc('save_content_draft',{p_payload:payload});submit.disabled=false;if(error)return show(error.message,'error');form.id.value=data;show('초안을 저장했습니다.','success');await load();});
  document.querySelector('#newContentButton')?.addEventListener('click',resetForm);

  async function load(){list.innerHTML='<div class="loading-state">콘텐츠를 불러오는 중입니다.</div>';const{data,error}=await client.rpc('list_content_management');if(error)return show(error.message,'error');rows=data||[];render();}
  function render(){if(!rows.length){list.innerHTML='<div class="empty-state">작성한 콘텐츠가 없습니다.</div>';return;}list.innerHTML=rows.map(r=>`<article class="manage-content-card" data-id="${r.id}"><div><span class="badge">${labels[r.category]}</span><span class="status-pill ${r.status==='published'?'approved':r.status==='rejected'?'rejected':'pending'}">${statusLabels[r.status]}</span></div><h3>${escapeHtml(r.title)}</h3><p>${escapeHtml(r.summary||'요약 없음')}</p><small>작성: ${escapeHtml(r.author_name)} 리더 · ${new Date(r.updated_at).toLocaleString('ko-KR')}</small>${r.review_note?`<div class="review-note">반려 사유: ${escapeHtml(r.review_note)}</div>`:''}<div class="action-group"><button class="action-btn" data-edit>열기</button>${['draft','rejected'].includes(r.status)?'<button class="action-btn save" data-submit>승인 요청</button>':''}${canApprove()&&r.status!=='published'?'<button class="action-btn approve" data-publish>게시 승인</button>':''}${canApprove()&&r.status==='review'?'<button class="action-btn reject" data-reject>반려</button>':''}${canApprove()&&r.status==='published'?'<button class="action-btn reject" data-hide>숨김</button>':''}</div></article>`).join('');
    list.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>edit(rows.find(r=>r.id===b.closest('article').dataset.id))));
    list.querySelectorAll('[data-submit]').forEach(b=>b.addEventListener('click',()=>call('submit_content',{p_post_id:b.closest('article').dataset.id},'승인 요청을 보냈습니다.')));
    list.querySelectorAll('[data-publish]').forEach(b=>b.addEventListener('click',()=>call('publish_content',{p_post_id:b.closest('article').dataset.id},'게시를 승인했습니다.')));
    list.querySelectorAll('[data-reject]').forEach(b=>b.addEventListener('click',async()=>{const reason=prompt('반려 사유를 입력해 주세요.','');if(reason===null)return;await call('reject_content',{p_post_id:b.closest('article').dataset.id,p_reason:reason},'콘텐츠를 반려했습니다.');}));
    list.querySelectorAll('[data-hide]').forEach(b=>b.addEventListener('click',()=>call('hide_content',{p_post_id:b.closest('article').dataset.id},'게시물을 숨겼습니다.')));
  }
  async function call(fn,args,success){const{error}=await client.rpc(fn,args);if(error)return show(error.message,'error');show(success,'success');await load();}
  function edit(r){form.id.value=r.id;form.category.value=r.category;form.title.value=r.title;form.summary.value=r.summary||'';form.body.value=r.body||'';form.cover_url.value=r.cover_url||'';title.textContent='콘텐츠 수정';form.scrollIntoView({behavior:'smooth'});}
  function resetForm(){form.reset();form.id.value='';applyCategoryPermissions();title.textContent='새 콘텐츠 작성';}
})();
