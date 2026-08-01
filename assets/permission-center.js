(async()=>{
  const client=window.knaSupabase;
  const root=document.querySelector('#permissionCenterRoot');
  const roleCards=document.querySelector('#rolePermissionCards');
  const memberList=document.querySelector('#memberPermissionList');
  const message=document.querySelector('#permissionCenterMessage');
  const identity=document.querySelector('#permissionIdentity');
  const search=document.querySelector('#permissionSearch');
  let access=null,rows=[];

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const show=(text,type='info')=>{message.className=`auth-message show ${type}`;message.textContent=text;};
  const codes=[...window.KNA_ACCESS.allPermissionCodes];
  const coreSecurity=new Set(window.KNA_ACCESS.coreSecurityPermissions);
  const base=window.KNA_ACCESS.defaultPermissions;
  const common=['리더 홈과 내부 콘텐츠 열람','정책국 공식 일정 열람·신규 등록','본인의 참여 불가일·사유 등록과 추가','공지·카드뉴스·정책 콘텐츠 초안 작성','익명 소통방과 정책 퀴즈·정책단어 이용'];
  const roleOrder=['president','political_vice_president','policy_director','senior_manager_div1','senior_manager_div2','policy_general_manager','department_manager','deputy_manager','section_manager','team_leader','leader','external_admin'];
  const roleDescriptions={
    president:'회장 업무에 필요한 공지·콘텐츠·일정 운영 권한을 사용합니다.',
    political_vice_president:'정무부회장 업무에 필요한 공지·콘텐츠·일정 운영 권한을 사용합니다.',
    policy_director:'전체 회원·콘텐츠·일정·홈페이지 운영 권한을 관리합니다.',
    senior_manager_div1:'정책1부 회원·콘텐츠·일정과 불가일을 관리합니다.',
    senior_manager_div2:'정책2부 회원·콘텐츠·일정과 불가일을 관리합니다.',
    policy_general_manager:'정책국 공통 콘텐츠·뉴스·일정과 부서 자료를 종합 관리합니다.',
    department_manager:'실무 콘텐츠를 작성하고 승인 요청하며 일정과 불가일을 등록합니다.',
    deputy_manager:'리더 기본 권한으로 내부 자료를 열람하고 초안·일정·불가일을 등록합니다.',
    section_manager:'실무 콘텐츠를 작성하고 승인 요청하며 일정과 불가일을 등록합니다.',
    team_leader:'리더 기본 권한으로 내부 자료를 열람하고 초안·일정·불가일을 등록합니다.',
    leader:'내부 자료를 열람하고 콘텐츠 초안·일정·불가일을 등록합니다.',
    external_admin:'기술·시스템 유지보수를 담당하며 조직 운영 권한은 기본으로 갖지 않습니다.'
  };
  const capabilities={
    president:['공지사항·카드뉴스·정책 콘텐츠 작성과 게시','정책국·정책1부·정책2부 공식 일정 수정·삭제','외부 뉴스와 익명 소통방 운영','사업자료 작성·수정·게시'],
    political_vice_president:['공지사항·카드뉴스·정책 콘텐츠 작성과 게시','정책국·정책1부·정책2부 공식 일정 수정·삭제','외부 뉴스와 익명 소통방 운영','사업자료 작성·수정·게시'],
    policy_director:['모든 가입 신청 승인·반려와 직책·소속 변경','모든 페이지 문구·디자인·메뉴·팝업·블록 관리','전체 공지·카드뉴스·정책 콘텐츠 승인·수정·삭제','정책국·정책1부·정책2부 공식 일정 수정·삭제','모든 리더의 불가일·직책·사유 확인과 잘못된 기록 삭제','전체 활동보고서·사업계획서·사업계획 작성·수정·게시','파일 저장공간 사용량·다운로드 설정·삭제·자동 정리 관리','익명 소통방 신고 처리와 운영 기록 확인'],
    senior_manager_div1:['정책1부 가입 신청 승인·반려와 부서 직책 관리','정책1부 콘텐츠 승인·반려·수정·삭제','정책1부 공식 일정 수정·삭제','정책1부 리더의 불가일·사유 확인과 삭제','정책1부 활동보고서·사업계획 자료 작성·수정·게시'],
    senior_manager_div2:['정책2부 가입 신청 승인·반려와 부서 직책 관리','정책2부 콘텐츠 승인·반려·수정·삭제','정책2부 공식 일정 수정·삭제','정책2부 리더의 불가일·사유 확인과 삭제','정책2부 활동보고서·사업계획 자료 작성·수정·게시'],
    policy_general_manager:['정책국 공통 공지·카드뉴스·정책 콘텐츠 승인·관리','정책단어와 외부 뉴스 등록·수정·숨김','정책국 공통 공식 일정 수정·삭제','정책국 소속 리더의 불가일·사유 확인과 삭제','정책1부·정책2부 사업자료 종합 수정·게시'],
    department_manager:['공지·카드뉴스·정책 콘텐츠 초안 작성과 승인 요청','공식 일정 신규 등록','본인의 참여 불가일 등록과 추가','게시된 사업자료와 내부 콘텐츠 열람'],
    section_manager:['공지·카드뉴스·정책 콘텐츠 초안 작성과 승인 요청','공식 일정 신규 등록','본인의 참여 불가일 등록과 추가','게시된 사업자료와 내부 콘텐츠 열람'],
    deputy_manager:['내부 공지·사업자료·정책단어·정책 퀴즈 열람','공지·카드뉴스·정책 콘텐츠 초안 작성과 승인 요청','공식 일정 신규 등록','본인의 참여 불가일 등록과 추가','익명 글과 댓글 작성'],
    team_leader:['내부 공지·사업자료·정책단어·정책 퀴즈 열람','공지·카드뉴스·정책 콘텐츠 초안 작성과 승인 요청','공식 일정 신규 등록','본인의 참여 불가일 등록과 추가','익명 글과 댓글 작성'],
    leader:['내부 공지·사업자료·정책단어·정책 퀴즈 열람','공지·카드뉴스·정책 콘텐츠 초안 작성과 승인 요청','공식 일정 신규 등록','본인의 참여 불가일 등록과 추가','익명 글과 댓글 작성'],
    external_admin:['시스템 오류·배포·뉴스 자동 수집·보안 설정 유지보수','조직 운영 권한과 파일 관리는 정책국장이 별도로 추가한 경우에만 사용']
  };
  const limitations={
    president:['가입 승인·직책 관리·권한 부여·익명 작성자 확인·파일 관리·시스템 관리 권한은 기본 제공하지 않음','홈페이지 전체 설정 변경 불가'],
    political_vice_president:['가입 승인·직책 관리·권한 부여·익명 작성자 확인·파일 관리·시스템 관리 권한은 기본 제공하지 않음','홈페이지 전체 설정 변경 불가'],
    policy_director:['보안키·RLS·SMTP·도메인 등 기술 보안 영역은 페이지 편집기에서 제외'],
    senior_manager_div1:['정책2부 회원·일정 관리 불가','홈페이지 전체 페이지 편집 불가'],
    senior_manager_div2:['정책1부 회원·일정 관리 불가','홈페이지 전체 페이지 편집 불가'],
    policy_general_manager:['홈페이지 전체 페이지 편집 불가','정책국장 직책·전체 권한 변경 불가'],
    department_manager:['가입 승인·게시 최종 승인·삭제 불가','다른 리더의 불가 사유 열람 불가'],
    section_manager:['가입 승인·게시 최종 승인·삭제 불가','다른 리더의 불가 사유 열람 불가'],
    deputy_manager:['가입 승인·게시 최종 승인·삭제 불가','다른 리더의 불가 사유 열람 불가'],
    team_leader:['가입 승인·게시 최종 승인·삭제 불가','다른 리더의 불가 사유 열람 불가'],
    leader:['가입 승인·게시 최종 승인·삭제 불가','다른 리더의 불가 사유 열람 불가'],
    external_admin:['가입·콘텐츠 승인과 조직 일정 운영 불가','리더 불가 사유 열람 불가']
  };

  if(!window.SUPABASE_CONFIG_READY||!client){root.innerHTML='<div class="access-denied"><h2>연결 설정이 필요합니다</h2><p>리더 서비스 연결 설정을 확인해 주세요.</p></div>';return;}
  try{
    const{data:s,error:se}=await client.auth.getSession();if(se)throw se;if(!s.session)return location.replace('login.html');
    const{data:a,error:ae}=await client.rpc('get_my_access');if(ae)throw ae;access=a;
    if(access?.approval_status!=='approved')return location.replace('dashboard.html');
    if(!['policy_director','director'].includes(access.system_role)){
      root.innerHTML='<div class="access-denied"><h2>정책국장 전용 메뉴입니다</h2><p>직책별 권한 안내와 개인별 권한 변경은 정책국장만 이용할 수 있습니다.</p><a class="btn btn-primary" href="dashboard.html">리더 홈으로</a></div>';return;
    }
    identity.textContent=`${access.name} 리더 · ${access.position||'정책국장'}`;
    renderRoleCards();
    await loadMembers();
  }catch(e){console.error(e);show(e.message||'권한센터를 불러오지 못했습니다.','error');}

  document.querySelector('#permissionRefreshButton')?.addEventListener('click',loadMembers);
  search?.addEventListener('input',renderMembers);

  function permissionLabel(code){return window.KNA_ACCESS.labels.permission(code)||code;}
  function renderRoleCards(){
    roleCards.innerHTML=roleOrder.map(role=>{
      const defaults=[...(base[role]||new Set())];
      return `<details class="role-permission-card" ${role==='policy_director'?'open':''}><summary><span><strong>${esc(window.KNA_ACCESS.labels.role(role))}</strong><small>${esc(roleDescriptions[role])}</small></span><span class="role-count">기본 ${defaults.length}개</span></summary><div class="role-card-body"><h3>모든 승인 리더 공통</h3><div class="permission-chip-list">${common.map(x=>`<span class="permission-chip common">${esc(x)}</span>`).join('')}</div><h3>직책 업무 범위</h3><ul class="permission-capability-list">${(capabilities[role]||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h3>직책 기본 기능 권한</h3><div class="permission-chip-list">${defaults.length?defaults.map(code=>`<span class="permission-chip base">${esc(permissionLabel(code))}${coreSecurity.has(code)?' · 핵심 보안':''}</span>`).join(''):'<span class="permission-empty">별도 관리 기능 없음</span>'}</div><h3>제한되는 기능</h3><ul class="permission-limit-list">${(limitations[role]||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></details>`;
    }).join('');
  }

  async function loadMembers(){
    memberList.innerHTML='<div class="loading-state">리더 권한을 불러오는 중입니다.</div>';
    const{data,error}=await client.rpc('list_manageable_leaders');
    if(error){show(error.message,'error');return;}
    rows=(data||[]).filter(r=>r.approval_status!=='pending');
    renderMembers();
  }

  function renderMembers(){
    const q=String(search?.value||'').trim().toLowerCase();
    const view=rows.filter(r=>!q||[r.name,r.school,r.position_title,r.department,r.login_email].some(v=>String(v||'').toLowerCase().includes(q)));
    if(!view.length){memberList.innerHTML='<div class="empty-state">조건에 맞는 리더가 없습니다.</div>';return;}
    memberList.innerHTML=view.map(r=>{
      const role=r.system_role||'leader';
      const defaults=base[role]||new Set();
      const overrides=new Map((r.permissions||[]).map(x=>[x.code,x.allowed!==false]));
      const effective=new Set(codes.filter(code=>overrides.has(code)?overrides.get(code):defaults.has(code)));
      const self=r.id===access.id;
      return `<article class="member-permission-card" data-id="${r.id}"><header><div><strong>${esc(r.name)}${role==='external_admin'?'':' 리더'}</strong><span>${esc(r.department||'정책국')} · ${esc(r.position_title||window.KNA_ACCESS.labels.role(role))}</span><small>${esc(r.school||'')} ${r.cohort?`· ${esc(r.cohort)}`:''}</small></div><span class="status-pill ${r.approval_status}">${r.approval_status==='approved'?'승인 완료':'이용 중지'}</span></header><div class="member-permission-columns"><section><h3>직책 기본 권한 <small>기본값 안내</small></h3><div class="permission-option-grid">${codes.map(code=>`<label class="permission-option ${defaults.has(code)?'is-base':'is-off'}"><input type="checkbox" ${defaults.has(code)?'checked':''} disabled><span>${esc(permissionLabel(code))}</span>${defaults.has(code)?'<em>기본</em>':''}${coreSecurity.has(code)?'<em class="security">보안</em>':''}</label>`).join('')}</div></section><section><h3>개인별 실제 적용 권한 <small>기본 권한도 해제 가능</small></h3><div class="permission-option-grid">${codes.map(code=>{const hasOverride=overrides.has(code);const enabled=effective.has(code);const badge=hasOverride?(enabled?'개별 허용':'개별 해제'):(defaults.has(code)?'직책 기본':'기본 없음');return `<label class="permission-option ${defaults.has(code)?'is-base':''} ${enabled?'is-effective':'is-disabled'}"><input type="checkbox" data-effective="${code}" ${enabled?'checked':''} ${self?'disabled':''}><span>${esc(permissionLabel(code))}</span><em>${badge}</em>${coreSecurity.has(code)?'<em class="security">보안</em>':''}</label>`;}).join('')}</div>${self?'<p class="permission-self-note">현재 정책국장 본인 계정은 핵심 운영 보호를 위해 이 화면에서 변경하지 않습니다.</p>':'<p class="permission-self-note">체크를 해제하면 직책에 포함된 기본 권한도 이 사용자에게만 중지됩니다.</p><button type="button" class="btn btn-primary permission-save" data-save>실제 권한 저장</button>'}</section></div><footer><strong>현재 최종 적용 권한</strong><div class="permission-chip-list">${effective.size?[...effective].map(code=>`<span class="permission-chip effective">${esc(permissionLabel(code))}</span>`).join(''):'<span class="permission-empty">공통 리더 기능만 적용</span>'}</div></footer></article>`;
    }).join('');
    memberList.querySelectorAll('[data-save]').forEach(btn=>btn.addEventListener('click',()=>savePermissions(btn.closest('article'))));
  }

  async function savePermissions(card){
    const button=card.querySelector('[data-save]');
    const items=[...card.querySelectorAll('[data-effective]:checked')].map(input=>({code:input.dataset.effective,scope:'*'}));
    if(!confirm('선택한 실제 적용 권한을 저장하시겠습니까?\n직책 기본 권한도 체크 해제한 항목은 이 사용자에게 적용되지 않습니다.'))return;
    button.disabled=true;
    const{error}=await client.rpc('set_member_permissions',{p_target_user_id:card.dataset.id,p_permission_items:items});
    button.disabled=false;
    if(error){show(error.message,'error');return;}
    show('개인별 실제 적용 권한을 저장했습니다.','success');
    await loadMembers();
  }
})();
