(async()=>{
  const client=window.knaSupabase;
  const form=document.querySelector('#contentEditorForm');
  const body=document.querySelector('#richBody');
  const toolbar=document.querySelector('#richToolbar');
  const message=document.querySelector('#editorMessage');
  const status=document.querySelector('#editorStatus');
  const saveButton=document.querySelector('#saveDraftButton');
  const submitButton=document.querySelector('#submitReviewButton');
  const publishButton=document.querySelector('#publishButton');
  const back=document.querySelector('#editorBack');
  const params=new URLSearchParams(location.search);
  const id=params.get('id');
  const requestedCategory=params.get('category');
  const returnUrl=params.get('return')||'content-manager.html';
  let access=null,currentStatus='draft';
  const managerRoles=['policy_director','director','policy_general_manager','general_manager','senior_manager_div1','senior_manager_div2','senior_manager'];
  const activityCategories=['activity_report','business_plan','project_plan'];
  const show=(text,type='info')=>{message.className=`auth-message show ${type}`;message.textContent=text;};
  const canApprove=()=>managerRoles.includes(access?.system_role)||access?.permissions?.includes('content_approve');
  const canWriteActivity=()=>managerRoles.includes(access?.system_role);
  const isActivity=()=>activityCategories.includes(form.elements.category.value);
  back.href=returnUrl;
  if(!window.SUPABASE_CONFIG_READY||!client)return show('리더 서비스 연결 설정을 확인해 주세요.','error');
  try{const{data:s}=await client.auth.getSession();if(!s.session)return location.replace('login.html');const{data,error}=await client.rpc('get_my_access');if(error)throw error;access=data;if(access?.approval_status!=='approved'||access?.system_role==='external_admin')return location.replace('dashboard.html');if(!canWriteActivity())activityCategories.forEach(value=>{const option=form.elements.category.querySelector(`option[value="${value}"]`);if(option)option.disabled=true;});if(requestedCategory)form.elements.category.value=requestedCategory;configureCategory(false);if(id)await loadPost(id);publishButton.hidden=!canApprove();}catch(e){show(e.message||'글쓰기 화면을 불러오지 못했습니다.','error');disableAll();}
  form.elements.category.addEventListener('change',()=>configureCategory(false));
  toolbar.addEventListener('click',e=>{const btn=e.target.closest('button');if(!btn)return;e.preventDefault();body.focus();if(btn.dataset.command){document.execCommand(btn.dataset.command,false,null);return;}if(btn.dataset.special==='link'){const url=prompt('연결할 주소를 입력해 주세요.','https://');if(url)document.execCommand('createLink',false,url);}if(btn.dataset.special==='image'){const url=prompt('이미지 주소를 입력해 주세요.','https://');if(url)document.execCommand('insertImage',false,url);}if(btn.dataset.special==='table'){insertTable();}});
  toolbar.querySelector('select[data-command="formatBlock"]')?.addEventListener('change',e=>{body.focus();document.execCommand('formatBlock',false,e.target.value);e.target.value='p';});
  saveButton.addEventListener('click',()=>save('draft'));
  submitButton.addEventListener('click',async()=>{const saved=await save('draft',false);if(!saved)return;const{error}=await client.rpc('submit_content',{p_post_id:form.elements.id.value});if(error)return show(error.message,'error');location.href=`${returnUrl}${returnUrl.includes('?')?'&':'?'}submitted=1`;});
  publishButton.addEventListener('click',async()=>{const saved=await save('draft',false);if(!saved)return;const{error}=await client.rpc('publish_content',{p_post_id:form.elements.id.value});if(error)return show(error.message,'error');location.href=`${returnUrl}${returnUrl.includes('?')?'&':'?'}published=1`;});
  function configureCategory(preserveVisibility=false){const activity=isActivity();document.querySelector('#scopeField').hidden=!activity;if(!preserveVisibility)form.elements.visibility.value=activity?'leaders':'public';form.elements.visibility.querySelector('option[value="public"]').disabled=activity;if(activity&&!canWriteActivity()){show('활동보고서와 사업계획 자료는 수석부장·정책총괄부장·정책국장만 작성할 수 있습니다.','warning');saveButton.disabled=true;submitButton.disabled=true;}else{saveButton.disabled=false;submitButton.disabled=false;}if(activity){if(access?.system_role==='senior_manager_div1')form.elements.scope.value='div1';if(access?.system_role==='senior_manager_div2')form.elements.scope.value='div2';}}
  async function loadPost(postId){const{data,error}=await client.rpc('get_content_for_edit',{p_post_id:postId});if(error)throw error;if(!data)throw new Error('콘텐츠를 찾을 수 없습니다.');form.elements.id.value=data.id;form.elements.category.value=data.category;form.elements.scope.value=data.scope||'policy_office';form.elements.visibility.value=data.visibility||'public';form.elements.title.value=data.title||'';form.elements.summary.value=data.summary||'';form.elements.cover_url.value=data.cover_url||'';body.innerHTML=data.body_format==='html'?sanitize(data.body||''):plainToHtml(data.body||'');currentStatus=data.status||'draft';status.textContent=`${data.title||'콘텐츠'} · ${labelStatus(currentStatus)}`;configureCategory(true);}
  async function save(mode='draft',redirect=true){const title=form.elements.title.value.trim();const html=sanitize(body.innerHTML);if(!title)return show('제목을 입력해 주세요.','error'),false;if(!html.replace(/<[^>]+>/g,'').trim()&&!html.includes('<img'))return show('본문을 입력해 주세요.','error'),false;if(isActivity()&&!canWriteActivity())return show('사업자료 작성 권한이 없습니다.','error'),false;toggleBusy(true);const payload={id:form.elements.id.value||'',category:form.elements.category.value,title,summary:form.elements.summary.value.trim(),body:html,body_format:'html',cover_url:form.elements.cover_url.value.trim(),scope:isActivity()?form.elements.scope.value:'policy_office',visibility:form.elements.visibility.value};const{data,error}=await client.rpc('save_content_draft',{p_payload:payload});toggleBusy(false);if(error)return show(error.message,'error'),false;form.elements.id.value=data;show('초안을 저장했습니다.','success');if(redirect)location.href=`${returnUrl}${returnUrl.includes('?')?'&':'?'}saved=1`;return true;}
  function sanitize(html){const doc=new DOMParser().parseFromString(`<div>${html}</div>`,'text/html');const allowed=new Set(['DIV','P','BR','H2','H3','STRONG','B','EM','I','U','S','UL','OL','LI','BLOCKQUOTE','A','IMG','HR','TABLE','THEAD','TBODY','TR','TH','TD','SPAN']);[...doc.body.querySelectorAll('*')].forEach(el=>{if(!allowed.has(el.tagName)){el.replaceWith(...el.childNodes);return;}[...el.attributes].forEach(a=>{const n=a.name.toLowerCase();if(el.tagName==='A'&&n==='href'){if(!/^(https?:|mailto:|#)/i.test(a.value))el.removeAttribute(a.name);else el.setAttribute('target','_blank');return;}if(el.tagName==='IMG'&&['src','alt'].includes(n)){if(n==='src'&&!/^https?:/i.test(a.value))el.removeAttribute(a.name);return;}if(n==='style'){const align=(a.value.match(/text-align\s*:\s*(left|center|right)/i)||[])[1];if(align)el.setAttribute('style',`text-align:${align}`);else el.removeAttribute('style');return;}el.removeAttribute(a.name);});});return doc.body.firstElementChild.innerHTML.trim();}
  function plainToHtml(value){const normalized=String(value||'').replace(/\\n/g,'\n').replace(/\r/g,'');return normalized.split('\n').map(line=>line.trim()?`<p>${escapeHtml(line)}</p>`:'<p><br></p>').join('');}
  function insertTable(){const rows=Math.min(Math.max(Number(prompt('행 개수','3'))||3,1),10);const cols=Math.min(Math.max(Number(prompt('열 개수','3'))||3,1),8);let html='<table><tbody>';for(let r=0;r<rows;r++){html+='<tr>';for(let c=0;c<cols;c++)html+=r===0?'<th>제목</th>':'<td>내용</td>';html+='</tr>';}html+='</tbody></table><p><br></p>';document.execCommand('insertHTML',false,html);}
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));}
  function labelStatus(v){return({draft:'작성 중',review:'승인 요청',published:'게시 완료',rejected:'반려',hidden:'숨김'}[v]||v);}
  function toggleBusy(b){saveButton.disabled=b;submitButton.disabled=b;publishButton.disabled=b;}
  function disableAll(){[saveButton,submitButton,publishButton].forEach(b=>b.disabled=true);}
})();
