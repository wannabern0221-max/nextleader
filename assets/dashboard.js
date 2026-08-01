(async () => {
  const client = window.knaSupabase;
  const root = document.querySelector('#dashboardRoot');
  const stateText = document.querySelector('#serverStateText');
  const stateDot = document.querySelector('#serverStateDot');

  const fail = message => {
    root.innerHTML = `<div class="member-panel access-denied"><h2>내부포털에 접속할 수 없습니다</h2><p>${message}</p><a class="btn btn-primary" href="login.html">로그인 화면으로</a></div>`;
    if (stateText) stateText.textContent = '접속 불가';
    stateDot?.classList.add('error');
  };

  if (!window.SUPABASE_CONFIG_READY || !client) return fail('리더 서비스 연결 설정을 확인해 주세요.');

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const has = code => window.KNA_ACCESS?.has(access, code);
  let access;

  try {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) return location.replace('login.html');

    const { data, error } = await client.rpc('get_my_access');
    if (error) throw error;
    access = data;
    if (!access) throw new Error('리더 정보를 찾을 수 없습니다.');

    stateText.textContent = '정상 연결';
    stateDot.classList.add('ok');

    if (access.approval_status !== 'approved') {
      const label = {pending:'승인 대기',rejected:'신청 반려',suspended:'이용 중지'}[access.approval_status] || access.approval_status;
      root.innerHTML = `<div class="member-panel access-denied"><span class="status-pill ${access.approval_status}">${label}</span><h2>승인이 필요합니다</h2><p>이메일 인증 후 정책국장 또는 해당 부서 수석부장의 승인이 완료되어야 내부포털을 이용할 수 있습니다.</p><button class="btn btn-outline" id="logoutButton">로그아웃</button></div>`;
      document.querySelector('#logoutButton')?.addEventListener('click', async () => { await client.auth.signOut(); location.replace('login.html'); });
      return;
    }

    const roleLabel = window.KNA_ACCESS.labels.role(access.system_role);
    const departmentLabel = window.KNA_ACCESS.labels.department(access.department);
    const external = access.system_role === 'external_admin';
    const canManage = ['member_approve','role_manage','permission_grant','system_manage'].some(has);
    const canWriteContent = ['content_write_notice','content_write_card','content_write_policy','content_approve'].some(has);

    root.innerHTML = `
      <div class="member-layout">
        <aside class="member-panel" id="profile">
          <div class="profile-card">
            <img src="assets/brand-mark.png" alt="">
            <span class="status-pill approved">승인 완료</span>
            <div class="profile-name">${escapeHtml(access.name)}${external ? '' : ' 리더'}</div>
            <div class="profile-meta">
              <span>${escapeHtml(access.school || '외부 관리자')}</span>
              <span>${escapeHtml(access.cohort || '')}${access.cohort ? ' · ' : ''}${escapeHtml(departmentLabel)}</span>
              <span>${escapeHtml(access.position || roleLabel)}</span>
            </div>
            <button class="btn btn-outline" id="logoutButton">로그아웃</button>
          </div>
        </aside>
        <section class="member-panel">
          <div class="section-head portal-head"><div><span class="eyebrow">INTERNAL PORTAL</span><h2>리더 내부포털</h2></div></div>
          <div class="portal-grid portal-grid-links">
            <a class="portal-card" href="board.html"><span>01</span><strong>익명 리더 소통방</strong><small>승인된 리더끼리 익명으로 의견을 나눕니다.</small></a>
            <a class="portal-card" href="internal-schedule.html"><span>02</span><strong>리더 일정</strong><small>정책국 공통·정책1부·정책2부 일정을 확인하고 등록합니다.</small></a>
            <a class="portal-card" href="news.html"><span>03</span><strong>간호·정책 뉴스</strong><small>자동으로 수집된 외부 간호·보건 정책 뉴스를 확인합니다.</small></a>
            ${canWriteContent ? '<a class="portal-card" href="content-manager.html"><span>04</span><strong>콘텐츠 작성</strong><small>공지사항·카드뉴스·정책 콘텐츠를 작성하고 승인 요청합니다.</small></a>' : ''}
            ${canManage ? '<a class="portal-card portal-card-admin" href="admin.html"><span>05</span><strong>관리센터</strong><small>가입 승인·직책·기능 권한을 관리합니다.</small></a>' : ''}
          </div>
        </section>
      </div>`;

    document.querySelector('#logoutButton')?.addEventListener('click', async () => { await client.auth.signOut(); location.replace('index.html'); });
  } catch (error) {
    console.error(error);
    fail(error.message || '내부포털을 불러오지 못했습니다.');
  }
})();
