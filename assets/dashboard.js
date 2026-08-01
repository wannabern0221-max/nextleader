(async () => {
  const client = window.knaSupabase;
  const root = document.querySelector('#dashboardRoot');
  const stateText = document.querySelector('#serverStateText');
  const stateDot = document.querySelector('#serverStateDot');

  const fail = message => {
    if (root) root.innerHTML = `<div class="member-panel access-denied"><h2>내부 포털에 접속할 수 없습니다</h2><p>${message}</p><a class="btn btn-primary" href="login.html">로그인 화면으로</a></div>`;
    if (stateText) stateText.textContent = '연결 실패';
    stateDot?.classList.add('error');
  };

  if (!window.SUPABASE_CONFIG_READY || !client) {
    fail('Supabase 연결정보가 입력되지 않았습니다.');
    return;
  }

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[ch]);

  try {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    const session = sessionData.session;
    if (!session) {
      location.replace('login.html');
      return;
    }

    const { data: profile, error } = await client
      .from('profiles')
      .select('id,name,school,cohort,department,approval_status,position,system_role')
      .eq('id', session.user.id)
      .single();
    if (error) throw error;

    stateText.textContent = '정상 연결';
    stateDot.classList.add('ok');

    if (profile.approval_status !== 'approved') {
      const label = {
        pending: '승인 대기',
        rejected: '신청 반려',
        suspended: '이용 중지'
      }[profile.approval_status] || profile.approval_status;
      root.innerHTML = `
        <div class="member-panel access-denied">
          <span class="status-pill ${profile.approval_status}">${label}</span>
          <h2>관리자 승인이 필요합니다</h2>
          <p>이메일 인증은 완료되었지만 내부 기능은 국장 또는 수석부장의 승인 후 이용할 수 있습니다.</p>
          <button class="btn btn-outline" id="logoutButton">로그아웃</button>
        </div>`;
      document.querySelector('#logoutButton')?.addEventListener('click', async () => {
        await client.auth.signOut();
        location.replace('login.html');
      });
      return;
    }

    const roleLabel = {
      member: '일반 부원',
      staff: '담당자',
      general_manager: '총괄부장',
      senior_manager: '수석부장',
      director: '국장'
    }[profile.system_role] || profile.system_role;

    const canApprove = ['director', 'senior_manager'].includes(profile.system_role);
    root.innerHTML = `
      <div class="member-layout">
        <aside class="member-panel">
          <div class="profile-card">
            <img src="assets/brand-mark.png" alt="">
            <span class="status-pill approved">승인 완료</span>
            <div class="profile-name">${escapeHtml(profile.name)}</div>
            <div class="profile-meta">
              <span>${escapeHtml(profile.school)}</span>
              <span>${escapeHtml(profile.cohort)} · ${escapeHtml(profile.department)}</span>
              <span>${escapeHtml(profile.position || roleLabel)}</span>
              <span>시스템 권한: ${escapeHtml(roleLabel)}</span>
            </div>
            ${canApprove ? '<a class="btn btn-primary" href="admin.html">가입 승인·회원 관리</a>' : ''}
            <button class="btn btn-outline" id="logoutButton">로그아웃</button>
          </div>
        </aside>
        <section class="member-panel">
          <div class="section-head">
            <div><span class="eyebrow">INTERNAL PORTAL</span><h2>정책국 내부 포털</h2></div>
          </div>
          <div class="portal-grid">
            <div class="portal-card"><span>01</span><strong>내부 일정</strong><span>승인된 관계자 전용 일정 기능을 연결할 예정입니다.</span></div>
            <div class="portal-card"><span>02</span><strong>문서 자료실</strong><span>Supabase Storage 비공개 자료실을 다음 단계에서 연결합니다.</span></div>
            <div class="portal-card"><span>03</span><strong>업무 게시판</strong><span>부서별 글쓰기와 첨부파일 기능을 다음 단계에서 연결합니다.</span></div>
          </div>
        </section>
      </div>`;

    document.querySelector('#logoutButton')?.addEventListener('click', async () => {
      await client.auth.signOut();
      location.replace('login.html');
    });
  } catch (error) {
    console.error(error);
    fail('데이터 서버 연결에 실패했습니다. Supabase 프로젝트 상태와 인터넷 연결을 확인해 주세요.');
  }
})();
