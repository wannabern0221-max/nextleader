(async()=>{
  const root=document.querySelector('#guideRoot');
  const client=window.knaSupabase;
  const deny=text=>root.innerHTML=`<div class="member-panel access-denied"><h2>운영 안내를 볼 수 없습니다</h2><p>${text}</p><a class="btn btn-primary" href="dashboard.html">리더 홈으로</a></div>`;
  if(!window.SUPABASE_CONFIG_READY||!client)return deny('Supabase 연결 설정을 확인해 주세요.');
  try{
    const{data:{session}}=await client.auth.getSession();if(!session)return location.replace('login.html');
    const{data,error}=await client.rpc('get_my_access');if(error)throw error;
    const normalizedPosition=String(data?.position||data?.requested_position||'').replace(/\s+/g,'');
    if(data?.approval_status!=='approved'||!(data?.system_role==='policy_director'||normalizedPosition.includes('정책국장')))return deny('현재 확정 직책이 정책국장인 계정만 확인할 수 있습니다.');
    root.innerHTML=`<div class="managed-card-grid columns-2">
      <article><div><h3>1. 페이지 문구·디자인 수정</h3><p>수정할 페이지에 들어가 오른쪽 아래의 <strong>페이지 수정</strong>을 누릅니다. 페이지 기본·디자인·블록·팝업을 수정하고 미리보기 후 게시합니다.</p><a href="page-editor.html?page=home">페이지 편집기 열기 →</a></div></article>
      <article><div><h3>2. 메뉴와 공통 안내 수정</h3><p>사이트 이름·공개 메뉴 이름·공통 환영 팝업·하단 안내는 홈페이지 관리에서 수정합니다.</p><a href="site-manager.html">홈페이지 관리 열기 →</a></div></article>
      <article><div><h3>3. 공지·카드뉴스·정책 콘텐츠</h3><p>콘텐츠 관리의 글쓰기 버튼에서 전용 편집기를 열어 작성합니다. 저장 후 작성·승인 목록으로 돌아와 상태를 확인합니다.</p><a href="content-manager.html">콘텐츠 관리 열기 →</a></div></article>
      <article><div><h3>4. 사업자료</h3><p>수석부장·정책총괄부장·정책국장은 정책1부·정책2부 활동보고서와 사업계획 자료를 작성하고 게시할 수 있습니다.</p><a href="activity-documents.html">사업자료 열기 →</a></div></article>
      <article><div><h3>5. 정책단어 관리</h3><p>정책단어를 새로 등록하거나 기존 항목을 수정하고 공개·숨김 상태를 관리합니다.</p><a href="glossary-manager.html">정책단어 관리 열기 →</a></div></article>
      <article><div><h3>6. 일정 운영</h3><p>모든 승인 리더는 불가일을 추가 등록할 수 있습니다. 기존 불가일 삭제와 공식 일정 수정·삭제는 관리 권한자가 처리합니다.</p><a href="internal-schedule.html">일정 확인 열기 →</a></div></article>
      <article><div><h3>7. 가입 승인과 직책 인계</h3><p>관리센터에서 가입 신청을 승인하고 실제 직책을 확정합니다. 새 국장을 정책국장으로 확정하면 페이지 관리 권한이 자동으로 이전됩니다.</p><a href="admin.html">관리센터 열기 →</a></div></article>
      <article><div><h3>8. 페이지 개발자 문의</h3><p>이후 보안 설정이나 페이지 세부 수정이 필요한 경우 페이지 개발자에게 문의해 주세요.</p></div></article>
    </div>`;
  }catch(error){deny(error.message||'권한을 확인하지 못했습니다.');}
})();
