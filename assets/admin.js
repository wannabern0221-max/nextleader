(async () => {
  const client = window.knaSupabase;
  const pendingBody = document.querySelector('#pendingTableBody');
  const memberBody = document.querySelector('#memberTableBody');
  const memberSection = document.querySelector('#memberManagementSection');
  const message = document.querySelector('#adminMessage');
  const adminIdentity = document.querySelector('#adminIdentity');

  const showMessage = (text, type = 'info') => {
    if (!message) return;
    message.className = `auth-message show ${type}`;
    message.textContent = text;
  };

  if (!window.SUPABASE_CONFIG_READY || !client) {
    showMessage('Supabase 연결정보가 입력되지 않았습니다.', 'error');
    return;
  }

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[ch]);

  const roleLabels = Object.freeze({
    member: '일반 부원',
    staff: '담당자',
    general_manager: '총괄부장',
    senior_manager: '수석부장',
    director: '국장'
  });
  const roleEntries = Object.entries(roleLabels);
  let myProfile;

  try {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) {
      location.replace('login.html');
      return;
    }

    const { data, error } = await client
      .from('profiles')
      .select('id,name,school,cohort,department,approval_status,position,system_role')
      .eq('id', sessionData.session.user.id)
      .single();
    if (error) throw error;
    myProfile = data;

    if (myProfile.approval_status !== 'approved' || !['director', 'senior_manager'].includes(myProfile.system_role)) {
      document.querySelector('#adminRoot').innerHTML = `
        <div class="admin-panel access-denied">
          <h2>접근 권한이 없습니다</h2>
          <p>가입 승인 관리는 승인된 국장 또는 수석부장만 이용할 수 있습니다.</p>
          <a class="btn btn-primary" href="dashboard.html">내부 포털로 돌아가기</a>
        </div>`;
      return;
    }

    adminIdentity.textContent = `${myProfile.name} · ${roleLabels[myProfile.system_role]}`;
    if (myProfile.system_role === 'director') memberSection?.classList.remove('hidden');
    await refreshAll();
  } catch (error) {
    console.error(error);
    showMessage('관리자 정보를 불러오지 못했습니다.', 'error');
  }

  async function refreshAll() {
    await loadPending();
    if (myProfile?.system_role === 'director') await loadMembers();
  }

  async function loadPending() {
    pendingBody.innerHTML = '<tr><td colspan="8" class="loading-state">승인 대기 목록을 불러오는 중입니다.</td></tr>';
    const { data, error } = await client
      .from('profiles')
      .select('id,name,school,cohort,department,approval_status,position,system_role,created_at')
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: true });
    if (error) {
      console.error(error);
      showMessage('승인 대기 목록을 불러오지 못했습니다. SQL 보안 설정을 확인해 주세요.', 'error');
      return;
    }
    renderPending(data || []);
  }

  function renderPending(rows) {
    if (!rows.length) {
      pendingBody.innerHTML = '<tr><td colspan="8" class="empty-state">현재 승인 대기 중인 신청자가 없습니다.</td></tr>';
      return;
    }

    const allowedRoles = roleEntries.filter(([value]) =>
      myProfile.system_role === 'director' || !['senior_manager', 'director'].includes(value)
    );

    pendingBody.innerHTML = rows.map(row => `
      <tr data-user-id="${row.id}">
        <td><strong>${escapeHtml(row.name)}</strong></td>
        <td>${escapeHtml(row.school)}</td>
        <td>${escapeHtml(row.cohort)}</td>
        <td>${escapeHtml(row.department)}</td>
        <td><input data-position maxlength="80" placeholder="예: 정책1부 부원"></td>
        <td>
          <select data-role>
            ${allowedRoles.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
          </select>
        </td>
        <td>${formatDate(row.created_at)}</td>
        <td>
          <div class="action-group">
            <button class="action-btn approve" data-approve type="button">승인</button>
            <button class="action-btn reject" data-reject type="button">반려</button>
          </div>
        </td>
      </tr>
    `).join('');

    pendingBody.querySelectorAll('[data-approve]').forEach(btn =>
      btn.addEventListener('click', () => approveRow(btn.closest('tr')))
    );
    pendingBody.querySelectorAll('[data-reject]').forEach(btn =>
      btn.addEventListener('click', () => rejectRow(btn.closest('tr')))
    );
  }

  async function loadMembers() {
    memberBody.innerHTML = '<tr><td colspan="7" class="loading-state">회원 목록을 불러오는 중입니다.</td></tr>';
    const { data, error } = await client
      .from('profiles')
      .select('id,name,school,cohort,department,approval_status,position,system_role,approved_at')
      .in('approval_status', ['approved', 'suspended'])
      .order('name', { ascending: true });
    if (error) {
      console.error(error);
      showMessage('승인 회원 목록을 불러오지 못했습니다. 최신 SQL을 다시 실행해 주세요.', 'error');
      return;
    }
    renderMembers(data || []);
  }

  function renderMembers(rows) {
    if (!rows.length) {
      memberBody.innerHTML = '<tr><td colspan="7" class="empty-state">승인된 회원이 없습니다.</td></tr>';
      return;
    }

    memberBody.innerHTML = rows.map(row => {
      const isSelf = row.id === myProfile.id;
      const suspended = row.approval_status === 'suspended';
      return `
        <tr data-user-id="${row.id}">
          <td><strong>${escapeHtml(row.name)}</strong>${isSelf ? '<span class="self-badge">현재 계정</span>' : ''}</td>
          <td>${escapeHtml(row.school)}<br><span class="table-subtext">${escapeHtml(row.cohort)} · ${escapeHtml(row.department)}</span></td>
          <td><span class="status-pill ${row.approval_status}">${suspended ? '이용 중지' : '승인 완료'}</span></td>
          <td><input data-member-position maxlength="80" value="${escapeHtml(row.position || '')}" ${isSelf || suspended ? 'disabled' : ''}></td>
          <td>
            <select data-member-role ${isSelf || suspended ? 'disabled' : ''}>
              ${roleEntries.map(([value, label]) => `<option value="${value}" ${value === row.system_role ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </td>
          <td>${formatDate(row.approved_at)}</td>
          <td>
            ${isSelf
              ? '<span class="table-subtext">본인 변경 불가</span>'
              : suspended
                ? '<button class="action-btn approve" data-reactivate type="button">이용 재개</button>'
                : `<div class="action-group">
                    <button class="action-btn save" data-save-role type="button">권한 저장</button>
                    <button class="action-btn reject" data-suspend type="button">이용 중지</button>
                  </div>`}
          </td>
        </tr>`;
    }).join('');

    memberBody.querySelectorAll('[data-save-role]').forEach(btn =>
      btn.addEventListener('click', () => saveMemberRole(btn.closest('tr')))
    );
    memberBody.querySelectorAll('[data-suspend]').forEach(btn =>
      btn.addEventListener('click', () => suspendMember(btn.closest('tr')))
    );
    memberBody.querySelectorAll('[data-reactivate]').forEach(btn =>
      btn.addEventListener('click', () => reactivateMember(btn.closest('tr')))
    );
  }

  async function approveRow(row) {
    const userId = row.dataset.userId;
    const role = row.querySelector('[data-role]').value;
    const position = row.querySelector('[data-position]').value.trim() || null;
    if (!confirm('이 가입 신청을 승인하시겠습니까?')) return;
    toggleRowButtons(row, true);

    const { error } = await client.rpc('approve_member', {
      target_user_id: userId,
      new_system_role: role,
      new_position: position
    });
    if (error) {
      console.error(error);
      showMessage(error.message || '승인 처리에 실패했습니다.', 'error');
      toggleRowButtons(row, false);
      return;
    }
    showMessage('가입 신청을 승인했습니다.', 'success');
    await refreshAll();
  }

  async function rejectRow(row) {
    const userId = row.dataset.userId;
    if (!confirm('이 가입 신청을 반려하시겠습니까?')) return;
    toggleRowButtons(row, true);

    const { error } = await client.rpc('reject_member', { target_user_id: userId });
    if (error) {
      console.error(error);
      showMessage(error.message || '반려 처리에 실패했습니다.', 'error');
      toggleRowButtons(row, false);
      return;
    }
    showMessage('가입 신청을 반려했습니다.', 'success');
    await loadPending();
  }

  async function saveMemberRole(row) {
    const selectedRole = row.querySelector('[data-member-role]').value;
    const position = row.querySelector('[data-member-position]').value.trim() || null;
    const roleName = roleLabels[selectedRole];
    if (!confirm(`이 회원의 시스템 권한을 '${roleName}'(으)로 저장하시겠습니까?`)) return;
    toggleRowButtons(row, true);

    const { error } = await client.rpc('change_member_role', {
      target_user_id: row.dataset.userId,
      new_system_role: selectedRole,
      new_position: position
    });
    if (error) {
      console.error(error);
      showMessage(error.message || '회원 권한 변경에 실패했습니다.', 'error');
      toggleRowButtons(row, false);
      return;
    }
    showMessage('회원의 직책과 시스템 권한을 변경했습니다.', 'success');
    await loadMembers();
  }

  async function suspendMember(row) {
    if (!confirm('이 회원의 내부 포털 이용을 중지하시겠습니까?')) return;
    toggleRowButtons(row, true);
    const { error } = await client.rpc('suspend_member', { target_user_id: row.dataset.userId });
    if (error) {
      console.error(error);
      showMessage(error.message || '회원 이용 중지에 실패했습니다.', 'error');
      toggleRowButtons(row, false);
      return;
    }
    showMessage('회원의 내부 포털 이용을 중지했습니다.', 'success');
    await loadMembers();
  }

  async function reactivateMember(row) {
    if (!confirm('이 회원의 내부 포털 이용을 다시 허용하시겠습니까?')) return;
    toggleRowButtons(row, true);
    const { error } = await client.rpc('reactivate_member', { target_user_id: row.dataset.userId });
    if (error) {
      console.error(error);
      showMessage(error.message || '회원 이용 재개에 실패했습니다.', 'error');
      toggleRowButtons(row, false);
      return;
    }
    showMessage('회원의 내부 포털 이용을 다시 허용했습니다.', 'success');
    await loadMembers();
  }

  function toggleRowButtons(row, disabled) {
    row.querySelectorAll('button').forEach(btn => { btn.disabled = disabled; });
  }

  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('ko-KR');
  }

  document.querySelector('#refreshButton')?.addEventListener('click', refreshAll);
  document.querySelector('#adminLogoutButton')?.addEventListener('click', async () => {
    await client.auth.signOut();
    location.replace('login.html');
  });
})();
