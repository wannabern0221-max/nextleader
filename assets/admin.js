(async () => {
  const client = window.knaSupabase;
  const root = document.querySelector('#adminRoot');
  const pendingBody = document.querySelector('#pendingTableBody');
  const memberBody = document.querySelector('#memberTableBody');
  const message = document.querySelector('#adminMessage');
  const identity = document.querySelector('#adminIdentity');
  let access, rows = [], positionCatalog = [];

  const show = (text, type = 'info') => { message.className = `auth-message show ${type}`; message.textContent = text; };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const roleLabels = window.KNA_ACCESS.roleLabels;
  const roles = ['president','political_vice_president','leader','team_leader','deputy_manager','section_manager','department_manager','policy_general_manager','senior_manager_div1','senior_manager_div2','policy_director','external_admin'];
  const allPermissionCodes = [...window.KNA_ACCESS.allPermissionCodes];
  const coreSecurity = new Set(window.KNA_ACCESS.coreSecurityPermissions);
  const operationalPermissions = allPermissionCodes.filter(code => !coreSecurity.has(code));
  const assignableRoles = () => access?.system_role === 'policy_director' ? roles : ['leader','team_leader','deputy_manager','section_manager','department_manager'];
  const has = code => window.KNA_ACCESS.has(access, code);
  const defaultSet = role => window.KNA_ACCESS.defaultPermissions[role] || new Set();

  const grantablePermissions = () => {
    if (access?.system_role === 'policy_director') return allPermissionCodes;
    const list = [...operationalPermissions];
    if (access?.system_role === 'senior_manager_div1') return list.filter(code => !code.startsWith('schedule_manage_') || code === 'schedule_manage_div1');
    if (access?.system_role === 'senior_manager_div2') return list.filter(code => !code.startsWith('schedule_manage_') || code === 'schedule_manage_div2');
    if (access?.system_role === 'policy_general_manager') return list.filter(code => !code.startsWith('schedule_manage_') || code === 'schedule_manage_common');
    return list.filter(code => !code.startsWith('schedule_manage_'));
  };

  if (!window.SUPABASE_CONFIG_READY || !client) return show('리더 서비스 연결 설정을 확인해 주세요.', 'error');

  try {
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) return location.replace('login.html');
    const { data, error } = await client.rpc('get_my_access');
    if (error) throw error;
    access = data;
    if (access?.approval_status !== 'approved') return location.replace('dashboard.html');
    if (!window.KNA_ACCESS.canManageCenter(access)) {
      root.innerHTML = '<div class="admin-panel access-denied"><h2>접근 권한이 없습니다</h2><p>관리센터 권한이 있는 임원 또는 관리자만 이용할 수 있습니다.</p><a class="btn btn-primary" href="dashboard.html">리더 홈으로 돌아가기</a></div>';
      return;
    }
    identity.textContent = `${access.name}${access.system_role === 'external_admin' ? '' : ' 리더'} · ${access.position || window.KNA_ACCESS.labels.role(access.system_role)}`;
    const siteManagerLink = document.querySelector('#siteManagerLink');
    const permissionCenterLink = document.querySelector('#permissionCenterLink');
    const normalizedPosition = String(access.position || access.requested_position || '').replace(/\s+/g, '');
    const isDirector = ['policy_director','director'].includes(access.system_role) || normalizedPosition.includes('정책국장');
    if (siteManagerLink) siteManagerLink.hidden = !isDirector;
    if (permissionCenterLink) permissionCenterLink.hidden = !isDirector;
    await loadPositionCatalog();
    await load();
    window.KNA_REFRESH_APPROVAL_BADGES?.();
  } catch (error) {
    show(error.message || '관리센터를 불러오지 못했습니다.', 'error');
  }

  document.querySelector('#refreshButton')?.addEventListener('click', async () => { await loadPositionCatalog(); await load(); });
  document.querySelector('#adminLogoutButton')?.addEventListener('click', async () => { await client.auth.signOut(); location.replace('index.html'); });

  async function load() {
    const { data, error } = await client.rpc('list_manageable_leaders');
    if (error) return show(error.message, 'error');
    rows = data || [];
    renderPending(rows.filter(row => row.approval_status === 'pending'));
    renderMembers(rows.filter(row => row.approval_status !== 'pending'));
  }

  async function loadPositionCatalog() {
    const { data, error } = await client.rpc('list_position_catalog');
    if (error) throw error;
    positionCatalog = data || [];
  }

  function roleSelectionValue(systemRole, positionTitle) {
    const custom = positionCatalog.find(item => !item.is_system && item.system_role === 'leader' && item.position_name === positionTitle);
    return custom ? `custom:${custom.id}` : systemRole;
  }

  function roleOptions(selectedRole, selectedPosition = '', editable = true) {
    const allowed = new Set(editable ? assignableRoles() : roles);
    const selectedValue = roleSelectionValue(selectedRole, selectedPosition);
    const items = positionCatalog.filter(item => item.is_system ? allowed.has(item.system_role) : allowed.has('leader'));
    if (!items.length) {
      const source = editable ? assignableRoles() : roles;
      return source.map(value => `<option value="${value}" ${value === selectedRole ? 'selected' : ''}>${escapeHtml(roleLabels[value])}</option>`).join('');
    }
    return items.map(item => {
      const value = item.is_system ? item.system_role : `custom:${item.id}`;
      return `<option value="${value}" ${value === selectedValue ? 'selected' : ''}>${escapeHtml(item.position_name)}</option>`;
    }).join('');
  }

  function selectedAssignment(select, positionInput) {
    const value = select.value;
    if (value.startsWith('custom:')) {
      const id = Number(value.split(':')[1]);
      const item = positionCatalog.find(row => Number(row.id) === id);
      return { role: 'leader', position: item?.position_name || String(positionInput?.value || '').trim() || '리더' };
    }
    const item = positionCatalog.find(row => row.is_system && row.system_role === value);
    return { role: value, position: String(positionInput?.value || '').trim() || item?.position_name || roleLabels[value] || '리더' };
  }

  function syncPositionFromRole(select, positionInput) {
    const value = select.value;
    const item = value.startsWith('custom:')
      ? positionCatalog.find(row => Number(row.id) === Number(value.split(':')[1]))
      : positionCatalog.find(row => row.is_system && row.system_role === value);
    if (item && positionInput) positionInput.value = item.position_name;
  }

  function suggestedRole(requested) {
    const exact = positionCatalog.find(item => item.position_name === String(requested || '').trim());
    if (exact) return exact.is_system ? exact.system_role : `custom:${exact.id}`;
    const value = String(requested || '').replace(/\s+/g, '');
    if (value === '회장') return 'president';
    if (value.includes('정무부회장')) return 'political_vice_president';
    if (value.includes('정책국장')) return 'policy_director';
    if (value.includes('정책1부') && value.includes('수석부장')) return 'senior_manager_div1';
    if (value.includes('정책2부') && value.includes('수석부장')) return 'senior_manager_div2';
    if (value.includes('총괄부장')) return 'policy_general_manager';
    if (value.includes('외부') && value.includes('관리자')) return 'external_admin';
    if (value.includes('팀장')) return 'team_leader';
    if (value.includes('차장')) return 'deputy_manager';
    if (value.includes('부장')) return 'department_manager';
    if (value.includes('과장')) return 'section_manager';
    return 'leader';
  }

  function renderPending(data) {
    if (!data.length) {
      pendingBody.innerHTML = '<tr><td colspan="8" class="empty-state">승인 대기 중인 신청자가 없습니다.</td></tr>';
      return;
    }
    pendingBody.innerHTML = data.map(row => {
      const requested = row.requested_position_title || '미입력';
      const suggested = suggestedRole(requested);
      return `<tr data-id="${row.id}"><td><strong>${escapeHtml(row.name)}</strong>${row.possible_duplicate ? '<span class="duplicate-badge">중복 의심</span>' : ''}<br><span class="table-subtext">${escapeHtml(row.login_email || '이메일 확인 불가')}</span></td><td>${escapeHtml(row.school)}</td><td>${escapeHtml(row.cohort)}</td><td><select data-department>${deptOptions(row.department)}</select></td><td><span class="requested-position-badge">신청: ${escapeHtml(requested)}</span><input data-position value="${escapeHtml(requested === '미입력' ? '' : requested)}" placeholder="승인할 실제 직책명"></td><td><select data-role>${roleOptions(suggested, requested)}</select></td><td>${new Date(row.created_at).toLocaleDateString('ko-KR')}</td><td><div class="action-group">${row.can_approve ? '<button class="action-btn approve" data-approve>승인</button><button class="action-btn reject" data-reject>반려</button>' : '<span class="table-subtext">처리 권한 없음</span>'}</div></td></tr>`;
    }).join('');
    pendingBody.querySelectorAll('[data-approve]').forEach(button => button.addEventListener('click', () => approve(button.closest('tr'))));
    pendingBody.querySelectorAll('[data-reject]').forEach(button => button.addEventListener('click', () => reject(button.closest('tr'))));
    pendingBody.querySelectorAll('[data-role]').forEach(select => select.addEventListener('change', () => syncPositionFromRole(select, select.closest('tr').querySelector('[data-position]'))));
  }

  function renderMembers(data) {
    if (!data.length) {
      memberBody.innerHTML = '<tr><td colspan="7" class="empty-state">관리할 리더가 없습니다.</td></tr>';
      return;
    }
    memberBody.innerHTML = data.map(row => {
      const overrides = new Map((row.permissions || []).map(item => [item.code, item.allowed !== false]));
      const defaults = defaultSet(row.system_role);
      const permissionInputs = grantablePermissions().map(code => {
        const isDefault = defaults.has(code);
        const hasOverride = overrides.has(code);
        const effective = hasOverride ? overrides.get(code) : isDefault;
        const stateText = hasOverride ? (effective ? '개별 허용' : '개별 해제') : (isDefault ? '직책 기본' : '기본 없음');
        return `<label title="${stateText}"><input type="checkbox" data-permission="${code}" ${effective ? 'checked' : ''} ${!row.can_edit_permissions ? 'disabled' : ''}>${escapeHtml(window.KNA_ACCESS.labels.permission(code))}${isDefault ? ' <small>직책 기본</small>' : ''}${coreSecurity.has(code) ? ' <small>핵심 보안</small>' : ''}</label>`;
      }).join('');
      return `<tr data-id="${row.id}"><td><strong>${escapeHtml(row.name)}</strong>${row.id === access.id ? '<span class="self-badge">현재 계정</span>' : ''}${row.possible_duplicate ? '<span class="duplicate-badge">중복 의심</span>' : ''}<br><span class="table-subtext">${escapeHtml(row.login_email || '이메일 확인 불가')}</span><br><span class="table-subtext">${escapeHtml(row.school)} · ${escapeHtml(row.cohort)}</span></td><td><select data-member-department ${!row.can_edit_role ? 'disabled' : ''}>${deptOptions(row.department)}</select></td><td><input data-member-position value="${escapeHtml(row.position_title || '')}" ${!row.can_edit_role ? 'disabled' : ''}></td><td><select data-member-role ${!row.can_edit_role ? 'disabled' : ''}>${roleOptions(row.system_role, row.position_title, row.can_edit_role)}</select></td><td><span class="status-pill ${row.approval_status}">${row.approval_status === 'approved' ? '승인 완료' : '이용 중지'}</span></td><td><details class="permission-details" ${!row.can_edit_permissions ? 'data-readonly' : ''}><summary>실제 적용 권한</summary><div class="permission-grid">${permissionInputs}</div>${row.can_edit_permissions ? '<p class="table-subtext">체크를 해제하면 직책 기본 권한도 개인별로 중지됩니다.</p><button class="action-btn save" data-save-permissions>권한 저장</button>' : ''}</details></td><td>${row.can_edit_role ? `<div class="action-group"><button class="action-btn save" data-save-role>직책 저장</button>${row.approval_status === 'approved' ? '<button class="action-btn reject" data-suspend>이용 중지</button>' : '<button class="action-btn approve" data-reactivate>이용 재개</button>'}</div>` : '<span class="table-subtext">변경 권한 없음</span>'}</td></tr>`;
    }).join('');
    memberBody.querySelectorAll('[data-save-role]').forEach(button => button.addEventListener('click', () => saveRole(button.closest('tr'))));
    memberBody.querySelectorAll('[data-member-role]').forEach(select => select.addEventListener('change', () => syncPositionFromRole(select, select.closest('tr').querySelector('[data-member-position]'))));
    memberBody.querySelectorAll('[data-save-permissions]').forEach(button => button.addEventListener('click', () => savePermissions(button.closest('tr'))));
    memberBody.querySelectorAll('[data-suspend]').forEach(button => button.addEventListener('click', () => statusCall('suspend_member', button.closest('tr'), '이용을 중지했습니다.')));
    memberBody.querySelectorAll('[data-reactivate]').forEach(button => button.addEventListener('click', () => statusCall('reactivate_member', button.closest('tr'), '이용을 재개했습니다.')));
  }

  async function approve(row) {
    if (!confirm('가입 신청을 승인하시겠습니까?')) return;
    const assignment = selectedAssignment(row.querySelector('[data-role]'), row.querySelector('[data-position]'));
    const args = { p_target_user_id: row.dataset.id, p_new_system_role: assignment.role, p_new_position: assignment.position, p_new_department: row.querySelector('[data-department]').value };
    const { error } = await client.rpc('approve_leader', args);
    if (error) return show(error.message, 'error');
    show('가입 신청을 승인했습니다.', 'success'); await load(); window.KNA_REFRESH_APPROVAL_BADGES?.();
  }
  async function reject(row) {
    if (!confirm('가입 신청을 반려하시겠습니까?')) return;
    const { error } = await client.rpc('reject_member', { p_target_user_id: row.dataset.id });
    if (error) return show(error.message, 'error');
    show('가입 신청을 반려했습니다.', 'success'); await load(); window.KNA_REFRESH_APPROVAL_BADGES?.();
  }
  async function saveRole(row) {
    const assignment = selectedAssignment(row.querySelector('[data-member-role]'), row.querySelector('[data-member-position]'));
    const { error } = await client.rpc('update_leader_assignment', { p_target_user_id: row.dataset.id, p_new_system_role: assignment.role, p_new_position: assignment.position, p_new_department: row.querySelector('[data-member-department]').value });
    if (error) return show(error.message, 'error');
    show('직책과 소속을 저장했습니다.', 'success'); await load();
  }
  async function savePermissions(row) {
    const items = [...row.querySelectorAll('[data-permission]:checked')].map(input => ({ code: input.dataset.permission, scope: '*' }));
    const { error } = await client.rpc('set_member_permissions', { p_target_user_id: row.dataset.id, p_permission_items: items });
    if (error) return show(error.message, 'error');
    show('실제 적용 권한을 저장했습니다.', 'success'); await load();
  }
  async function statusCall(functionName, row, success) {
    if (!confirm('계정 상태를 변경하시겠습니까?')) return;
    const { error } = await client.rpc(functionName, { p_target_user_id: row.dataset.id });
    if (error) return show(error.message, 'error');
    show(success, 'success'); await load(); window.KNA_REFRESH_APPROVAL_BADGES?.();
  }
})();
