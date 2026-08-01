(async () => {
  const client = window.knaSupabase;
  const root = document.querySelector('#dashboardRoot');
  const stateText = document.querySelector('#serverStateText');
  const stateDot = document.querySelector('#serverStateDot');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));

  const fail = message => {
    root.innerHTML = `<div class="member-panel access-denied"><h2>리더 홈에 접속할 수 없습니다</h2><p>${escapeHtml(message)}</p><a class="btn btn-primary" href="login.html">로그인 화면으로</a></div>`;
    if (stateText) stateText.textContent = '접속 불가';
    stateDot?.classList.add('error');
  };

  if (!window.SUPABASE_CONFIG_READY || !client) return fail('리더 서비스 연결 설정을 확인해 주세요.');

  try {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) return location.replace('login.html');

    const { data: access, error } = await client.rpc('get_my_access');
    if (error) throw error;
    if (!access) throw new Error('리더 정보를 찾을 수 없습니다.');

    stateText.textContent = '정상 연결';
    stateDot.classList.add('ok');

    if (access.approval_status !== 'approved') {
      const label = {pending:'승인 대기',rejected:'신청 반려',suspended:'이용 중지'}[access.approval_status] || access.approval_status;
      root.innerHTML = `<div class="member-panel access-denied"><span class="status-pill ${access.approval_status}">${label}</span><h2>가입 승인이 필요합니다</h2><p>이메일 인증 후 정책국장 또는 해당 부서 수석부장의 승인이 완료되어야 리더 기능을 이용할 수 있습니다.</p><button class="btn btn-outline" id="logoutButton">로그아웃</button></div>`;
      window.KNA_REFRESH_APPROVAL_BADGES?.();

    document.querySelector('#logoutButton')?.addEventListener('click', async () => { await client.auth.signOut(); location.replace('login.html'); });
      return;
    }

    const roleLabel = window.KNA_ACCESS?.labels.role(access.system_role) || access.position || '리더';
    const departmentLabel = window.KNA_ACCESS?.labels.department(access.department) || access.department || '정책국';
    const external = access.system_role === 'external_admin';
    const permissions = Array.isArray(access.permissions) ? access.permissions : [];
    const hasAny = codes => codes.some(code => permissions.includes(code));
    const canManage = ['policy_director','director','senior_manager_div1','senior_manager_div2','senior_manager','policy_general_manager','general_manager'].includes(access.system_role) || hasAny(['member_approve','role_manage','permission_grant','system_manage']);
    const canWrite = access.approval_status === 'approved' && access.system_role !== 'external_admin';
    const normalizedPosition = String(access.position || access.requested_position || '').replace(/\s+/g,'');
    const isDirector = ['policy_director','director'].includes(access.system_role) || normalizedPosition.includes('정책국장');

    root.innerHTML = `
      <div class="leader-home-welcome">
        <h2>${escapeHtml(access.name)}${external ? '' : ' 리더'}님 반갑습니다</h2>
        <p>${escapeHtml(departmentLabel)} · ${escapeHtml(access.position || roleLabel)}로 로그인되어 있습니다. 자주 사용하는 기능은 아래에서 바로 들어갈 수 있습니다.</p>
        <div class="leader-home-actions">
          <a class="leader-home-action" href="internal-schedule.html"><span>01 · 일정 조율</span><strong>일정 확인</strong><small>정책국·정책1부·정책2부 리더가 불가한 날짜와 사유를 등록하고 일정을 조율합니다.</small></a>
          <a class="leader-home-action" href="board.html"><span>02 · 자유로운 의견</span><strong>익명 리더 소통방</strong><small>이름과 직책 그리고 소속을 드러내지 않고 의견을 나눕니다.</small></a>
          <a class="leader-home-action" href="quiz.html"><span>03 · 정책 학습</span><strong>정책 퀴즈</strong><small>쉬움부터 어려움까지 무작위 문제로 정책 지식을 확인합니다.</small></a>
          <a class="leader-home-action" href="notice.html"><span>04 · 정책국 소식</span><strong>공지사항</strong><small>정책국 활동과 중요한 안내를 빠르게 확인합니다.</small></a>
          ${canWrite ? '<a class="leader-home-action" href="content-manager.html"><span>05 · 콘텐츠 운영</span><strong>콘텐츠 관리 <span class="approval-menu-badge" data-approval-badge="content" hidden></span></strong><small>작성한 글과 승인 요청 그리고 게시 상태를 확인합니다.</small></a><a class="leader-home-action" href="activity-documents.html"><span>06 · 부서 운영</span><strong>사업자료 <span class="approval-menu-badge" data-approval-badge="activity" hidden></span></strong><small>정책1부·정책2부의 활동보고서와 사업계획 자료를 확인합니다.</small></a><a class="leader-home-action" href="glossary-manager.html"><span>07 · 정책 학습</span><strong>정책단어 작성</strong><small>정책단어를 등록하고 관리 권한자의 검토를 요청합니다.</small></a>' : ''}
          ${canManage ? '<a class="leader-home-action" href="admin.html"><span>08 · 운영 권한</span><strong>관리센터 <span class="approval-menu-badge" data-approval-badge="total" hidden></span></strong><small>가입 승인과 직책 그리고 기능 권한을 관리합니다.</small></a>' : ''}
          ${isDirector ? '<a class="leader-home-action" href="permission-center.html"><span>09 · 권한 운영</span><strong>권한 안내·관리</strong><small>직책별 기본 권한과 리더별 추가 기능 권한을 확인하고 관리합니다.</small></a><a class="leader-home-action" href="site-manager.html"><span>10 · 공통 설정</span><strong>홈페이지 관리</strong><small>사이트 이름과 메뉴 그리고 공통 환영 팝업을 관리합니다.</small></a><a class="leader-home-action" href="page-editor.html?page=home"><span>11 · 페이지 운영</span><strong>페이지 편집기</strong><small>각 페이지의 문구·디자인·이미지·블록·팝업을 직접 추가하고 수정합니다.</small></a><a class="leader-home-action" href="operations-guide.html"><span>12 · 인계 안내</span><strong>홈페이지 운영 안내</strong><small>차기 정책국장이 알아야 할 사이트 운영 절차를 한눈에 확인합니다.</small></a>' : ''}
        </div>
      </div>
      <div class="member-layout">
        <aside class="member-panel" id="profile">
          <div class="profile-card">
            <img src="assets/brand-mark.png" alt="">
            <span class="status-pill approved">로그인됨</span>
            <div class="profile-name">${escapeHtml(access.name)}${external ? '' : ' 리더'}</div>
            <div class="profile-meta"><span>${escapeHtml(access.school || '외부 관리자')}</span><span>${escapeHtml(access.cohort || '')}${access.cohort ? ' · ' : ''}${escapeHtml(departmentLabel)}</span><span>${escapeHtml(access.position || roleLabel)}</span></div>
            <button class="btn btn-outline" id="logoutButton">로그아웃</button>
          </div>
        </aside>
        <section class="member-panel">
          <div class="section-head portal-head"><div><span class="eyebrow">QUICK GUIDE</span><h2>리더 이용 안내</h2></div></div>
          <div class="succession-note">휴대폰에서는 화면 아래의 빠른 메뉴로 리더 홈과 일정 확인 그리고 익명 소통방을 바로 이동할 수 있습니다. 별도의 리더 홈을 거치지 않아도 됩니다.</div>
          <div class="portal-grid portal-grid-links">
            <a class="portal-card" href="internal-schedule.html"><span>01</span><strong>일정 응답 등록</strong><small>본인 소속의 참여 불가한 날짜와 사유를 등록합니다.</small></a>
            <a class="portal-card" href="schedule.html"><span>02</span><strong>확정 일정 보기</strong><small>수석부장 또는 정책국장이 확정한 공개 일정을 확인합니다.</small></a>
            <a class="portal-card" href="news.html"><span>03</span><strong>간호·정책 뉴스</strong><small>공식자료와 기자 작성 기사를 함께 확인합니다.</small></a>
            <a class="portal-card" href="glossary.html"><span>04</span><strong>정책단어</strong><small>간호·보건의료 정책 핵심 용어를 검색합니다.</small></a>
          </div>
        </section>
      </div>`;

    window.KNA_REFRESH_APPROVAL_BADGES?.();

    document.querySelector('#logoutButton')?.addEventListener('click', async () => { await client.auth.signOut({ scope:'local' }); location.replace('index.html'); });
  } catch (error) {
    console.error(error);
    fail(error.message || '리더 홈을 불러오지 못했습니다.');
  }
})();
