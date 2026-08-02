(async () => {
  const shell = document.querySelector('[data-session-shell]');
  const trigger = document.querySelector('[data-session-trigger]');
  const popover = document.querySelector('[data-session-popover]');
  const summary = document.querySelector('[data-session-summary]');
  const logoutButton = document.querySelector('[data-session-logout]');
  const portalLinks = [...document.querySelectorAll('[data-portal-link]')];
  const client = window.knaSupabase;

  const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
  const WARNING_BEFORE_MS = 60 * 1000;
  const LAST_ACTIVITY_KEY = 'kna-busan-last-activity-at';
  const SESSION_USER_KEY = 'kna-busan-session-user-id';
  const ACTIVITY_WRITE_GAP_MS = 15000;

  const state = { session: null, profile: null, access: null };
  window.KNA_SESSION_STATE = state;

  let activityListenersReady = false;
  let lastActivityWrite = 0;
  let timeoutInProgress = false;
  let warningShown = false;
  let timeoutTimer = null;
  let approvalPollTimer = null;
  let notificationPollTimer = null;
  let unreadNotificationCount = 0;
  let notificationModal = null;
  let approvalCounts = { total: 0, members: 0, content: 0, activity: 0 };

  if (!document.querySelector('link[href*="leader-experience.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'assets/leader-experience.css?v=20260802-notifications1';
    document.head.appendChild(link);
  }

  const dispatchReady = () => document.dispatchEvent(new CustomEvent('kna:session-ready', { detail: state }));
  if (!shell || !trigger || !window.SUPABASE_CONFIG_READY || !client) {
    dispatchReady();
    return;
  }

  const escapeText = value => String(value ?? '').trim();
  const isManager = access => {
    const role = access?.system_role;
    const managerRoles = ['policy_director','director','senior_manager_div1','senior_manager_div2','senior_manager','policy_general_manager','general_manager'];
    const managerPermissions = ['member_approve','role_manage','permission_grant','system_manage'];
    return managerRoles.includes(role) || managerPermissions.some(code => access?.permissions?.includes(code));
  };

  async function loadAccess(userId) {
    try {
      const { data, error } = await client.rpc('get_my_access');
      if (!error && data) return data;
    } catch (_) {}
    const { data, error } = await client.from('profiles').select('id,name,school,cohort,department,approval_status,position,system_role').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data ? { ...data, permissions: [] } : null;
  }

  function closePopover() {
    if (popover) popover.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }

  function removeLeaderNavigation() {
    document.querySelector('.leader-ribbon')?.remove();
    document.querySelector('.leader-mobile-dock')?.remove();
    document.body.classList.remove('has-leader-dock');
  }

  function currentPage() {
    return document.body.dataset.page || location.pathname.split('/').pop()?.replace('.html','') || 'index';
  }

  function buildLeaderNavigation(access) {
    removeLeaderNavigation();
    if (access?.approval_status !== 'approved') return;

    const page = currentPage();
    const activeFor = target => {
      if (target === 'dashboard') return page === 'dashboard';
      if (target === 'internal-schedule') return page === 'internal-schedule';
      if (target === 'board') return page === 'board';
      if (target === 'quiz') return page === 'quiz';
      if (target === 'content-manager') return page === 'content-manager' || page === 'content-editor';
      if (target === 'activity-documents') return page === 'activity-documents';
      if (target === 'glossary-manager') return page === 'glossary-manager';
      if (target === 'admin') return page === 'admin';
      if (target === 'permission-center') return page === 'permission-center';
      return false;
    };

    const links = [
      ['dashboard.html','dashboard',(window.KNA_SITE_SETTINGS?.leader_menu?.home||'리더 홈')],
      ['internal-schedule.html','internal-schedule',(window.KNA_SITE_SETTINGS?.leader_menu?.schedule||'일정 확인')],
      ['board.html','board',(window.KNA_SITE_SETTINGS?.leader_menu?.board||'익명 소통')],
      ['quiz.html','quiz',(window.KNA_SITE_SETTINGS?.leader_menu?.quiz||'정책 퀴즈')],
      ['content-manager.html','content-manager','콘텐츠 관리'],
      ['activity-documents.html','activity-documents','사업자료'],
      ['glossary-manager.html','glossary-manager','정책단어 관리']
    ];

    const ribbon = document.createElement('div');
    ribbon.className = 'leader-ribbon';
    const isDirector = ['policy_director','director'].includes(access.system_role) || String(access.position||access.requested_position||'').replace(/\s+/g,'').includes('정책국장');
    const linkMarkup = links.map(([href,key,label]) => {
      const badgeKey = key === 'content-manager' ? 'content' : (key === 'activity-documents' ? 'activity' : '');
      return `<a href="${href}" class="${activeFor(key) ? 'active' : ''}">${label}${badgeKey ? `<span class="approval-menu-badge" data-approval-badge="${badgeKey}" hidden></span>` : ''}</a>`;
    }).join('');
    const managementLinks = `${isManager(access) ? `<a href="admin.html" class="manage-link ${activeFor('admin') ? 'active' : ''}">관리센터<span class="approval-menu-badge" data-approval-badge="total" hidden></span></a>` : ''}${isDirector ? `<a href="permission-center.html" class="manage-link ${activeFor('permission-center') ? 'active' : ''}">권한 안내·관리</a><a href="site-manager.html" class="manage-link ${page==='site-manager'?'active':''}">홈페이지 관리</a>` : ''}`;
    ribbon.innerHTML = `<div class="container leader-ribbon-inner"><div class="leader-ribbon-main"><span class="leader-ribbon-label">리더 메뉴</span>${linkMarkup}</div>${managementLinks?`<div class="leader-ribbon-manage">${managementLinks}</div>`:''}</div>`;
    document.querySelector('.site-header')?.after(ribbon);

    const dock = document.createElement('nav');
    dock.className = 'leader-mobile-dock';
    dock.setAttribute('aria-label','리더 빠른 메뉴');
    dock.innerHTML = `
      <a data-dock="home" href="dashboard.html" class="${activeFor('dashboard') ? 'active' : ''}">홈</a>
      <a data-dock="availability" href="internal-schedule.html" class="${activeFor('internal-schedule') ? 'active' : ''}">일정</a>
      <a data-dock="board" href="board.html" class="${activeFor('board') ? 'active' : ''}">소통</a>
      ${isManager(access) ? `<a data-dock="manage" href="admin.html" class="${activeFor('admin') ? 'active' : ''}">관리<span class="approval-menu-badge" data-approval-badge="total" hidden></span></a>` : '<a data-dock="account" href="dashboard.html#profile">내 정보</a>'}`;
    document.body.appendChild(dock);
    document.body.classList.add('has-leader-dock');
    applyApprovalBadges();
  }

  function applyApprovalBadges() {
    document.querySelectorAll('[data-approval-badge]').forEach(node => {
      const key = node.dataset.approvalBadge || 'total';
      const count = Number(approvalCounts[key] || 0);
      node.textContent = count > 99 ? '99+' : String(count);
      node.hidden = count <= 0;
      node.setAttribute('aria-label', count > 0 ? `처리 대기 ${count}건` : '처리 대기 없음');
    });
    const alertButton = document.querySelector('[data-open-alert]');
    if (alertButton) {
      let badge = alertButton.querySelector('.approval-utility-badge');
      if (!badge) { badge = document.createElement('span'); badge.className = 'approval-utility-badge'; alertButton.appendChild(badge); }
      const total = Number(approvalCounts.total || 0) + Number(unreadNotificationCount || 0);
      badge.textContent = total > 99 ? '99+' : String(total);
      badge.hidden = total <= 0;
      alertButton.setAttribute('aria-label', total > 0 ? `알림 ${total}건` : '알림');
    }
  }

  async function refreshApprovalCounts() {
    if (!state.session || state.access?.approval_status !== 'approved') { approvalCounts = { total:0,members:0,content:0,activity:0 }; applyApprovalBadges(); return approvalCounts; }
    try {
      const { data, error } = await client.rpc('get_pending_action_counts_v1');
      if (error) throw error;
      approvalCounts = { total:0,members:0,content:0,activity:0, ...(data || {}) };
      applyApprovalBadges();
      document.dispatchEvent(new CustomEvent('kna:approval-counts', { detail: approvalCounts }));
    } catch (error) {
      console.warn('승인 대기 건수를 불러오지 못했습니다.', error);
    }
    return approvalCounts;
  }

  async function refreshNotificationCount() {
    if (!state.session) {
      unreadNotificationCount = 0;
      applyApprovalBadges();
      return 0;
    }
    try {
      const { data, error } = await client.rpc('get_my_unread_notification_count_v1');
      if (error) throw error;
      unreadNotificationCount = Number(data || 0);
    } catch (error) {
      unreadNotificationCount = 0;
      console.warn('개인 알림 건수를 불러오지 못했습니다.', error);
    }
    applyApprovalBadges();
    return unreadNotificationCount;
  }
  window.KNA_REFRESH_NOTIFICATIONS = refreshNotificationCount;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const notificationDate = value => {
    try { return new Date(value).toLocaleString('ko-KR', { month:'numeric', day:'numeric', hour:'numeric', minute:'2-digit' }); }
    catch (_) { return ''; }
  };

  function ensureNotificationModal() {
    if (notificationModal) return notificationModal;
    const wrap = document.createElement('div');
    wrap.className = 'member-notification-modal';
    wrap.hidden = true;
    wrap.innerHTML = `
      <div class="member-notification-backdrop" data-notification-close></div>
      <section class="member-notification-panel" role="dialog" aria-modal="true" aria-labelledby="memberNotificationTitle">
        <header class="member-notification-head">
          <div><span class="eyebrow">MY NOTIFICATIONS</span><h2 id="memberNotificationTitle">내 알림</h2></div>
          <button type="button" class="member-notification-close" data-notification-close aria-label="알림 닫기">×</button>
        </header>
        <div class="member-notification-actions" data-notification-actions hidden></div>
        <div class="member-notification-toolbar"><span data-notification-summary>알림을 불러오는 중입니다.</span><button type="button" data-notification-read-all>모두 읽음</button></div>
        <div class="member-notification-list" data-notification-list><div class="member-notification-empty">알림을 불러오는 중입니다.</div></div>
      </section>`;
    document.body.appendChild(wrap);
    wrap.querySelectorAll('[data-notification-close]').forEach(node => node.addEventListener('click', () => {
      wrap.hidden = true;
      document.body.classList.remove('notification-open');
    }));
    wrap.querySelector('[data-notification-read-all]')?.addEventListener('click', async () => {
      const { error } = await client.rpc('mark_all_my_notifications_read_v1');
      if (!error) {
        await refreshNotificationCount();
        await loadNotificationsIntoModal();
      }
    });
    wrap.querySelector('[data-notification-list]')?.addEventListener('click', async event => {
      const item = event.target.closest('[data-notification-id]');
      if (!item) return;
      const id = Number(item.dataset.notificationId);
      const link = item.dataset.notificationLink || '';
      await client.rpc('mark_my_notification_read_v1', { p_notification_id: id });
      await refreshNotificationCount();
      item.classList.remove('unread');
      if (link) location.href = link;
    });
    notificationModal = wrap;
    return wrap;
  }

  function renderPendingActions(modal) {
    const actions = modal.querySelector('[data-notification-actions]');
    if (!actions) return;
    const links = [];
    if (Number(approvalCounts.members || 0) > 0) links.push(`<a href="admin.html">가입 승인 <strong>${approvalCounts.members}</strong></a>`);
    if (Number(approvalCounts.content || 0) > 0) links.push(`<a href="content-manager.html">콘텐츠 승인 <strong>${approvalCounts.content}</strong></a>`);
    if (Number(approvalCounts.activity || 0) > 0) links.push(`<a href="activity-documents.html">사업자료 확인 <strong>${approvalCounts.activity}</strong></a>`);
    actions.innerHTML = links.join('');
    actions.hidden = links.length === 0;
  }

  async function loadNotificationsIntoModal() {
    const modal = ensureNotificationModal();
    const list = modal.querySelector('[data-notification-list]');
    const summary = modal.querySelector('[data-notification-summary]');
    renderPendingActions(modal);
    if (list) list.innerHTML = '<div class="member-notification-empty">알림을 불러오는 중입니다.</div>';
    try {
      const { data, error } = await client.rpc('get_my_notifications_v1', { p_limit: 40 });
      if (error) throw error;
      const items = Array.isArray(data) ? data : [];
      const unread = items.filter(item => !item.is_read).length;
      if (summary) summary.textContent = unread > 0 ? `읽지 않은 알림 ${unread}건` : '새로 확인할 알림이 없습니다.';
      if (!items.length) {
        if (list) list.innerHTML = '<div class="member-notification-empty"><strong>아직 받은 알림이 없습니다.</strong><span>가입 승인이나 직책 변경 결과가 여기에 표시됩니다.</span></div>';
        return;
      }
      if (list) list.innerHTML = items.map(item => `
        <button type="button" class="member-notification-item ${item.is_read ? '' : 'unread'}" data-notification-id="${Number(item.id)}" data-notification-link="${escapeHtml(item.link_url || '')}">
          <span class="member-notification-type ${escapeHtml(item.notification_type || 'info')}"></span>
          <span class="member-notification-copy"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span><small>${escapeHtml(notificationDate(item.created_at))}</small></span>
          ${item.is_read ? '' : '<span class="member-notification-new">새 알림</span>'}
        </button>`).join('');
    } catch (error) {
      console.error(error);
      if (summary) summary.textContent = '알림을 불러오지 못했습니다.';
      if (list) list.innerHTML = '<div class="member-notification-empty"><strong>알림 연결을 확인해 주세요.</strong><span>잠시 후 새로고침하면 다시 확인할 수 있습니다.</span></div>';
    }
  }

  async function openNotificationCenter() {
    const modal = ensureNotificationModal();
    modal.hidden = false;
    document.body.classList.add('notification-open');
    await Promise.all([refreshApprovalCounts(), refreshNotificationCount()]);
    await loadNotificationsIntoModal();
  }

  function startNotificationPolling() {
    if (notificationPollTimer) clearInterval(notificationPollTimer);
    refreshNotificationCount();
    notificationPollTimer = window.setInterval(refreshNotificationCount, 30000);
  }

  window.KNA_REFRESH_APPROVAL_BADGES = refreshApprovalCounts;
  function startApprovalPolling() {
    if (approvalPollTimer) clearInterval(approvalPollTimer);
    refreshApprovalCounts();
    approvalPollTimer = window.setInterval(refreshApprovalCounts, 45000);
  }

  function renderSignedOut() {
    trigger.textContent = '로그인';
    trigger.href = 'login.html';
    trigger.classList.remove('signed-in');
    trigger.setAttribute('aria-expanded', 'false');
    if (popover) popover.hidden = true;
    portalLinks.forEach(link => { link.classList.remove('is-approved'); link.textContent = '리더 홈'; });
    removeLeaderNavigation();
    approvalCounts = { total:0,members:0,content:0,activity:0 };
    if (approvalPollTimer) { clearInterval(approvalPollTimer); approvalPollTimer = null; }
    if (notificationPollTimer) { clearInterval(notificationPollTimer); notificationPollTimer = null; }
    unreadNotificationCount = 0;
    applyApprovalBadges();
  }

  function renderSignedIn(access) {
    const roleLabel = window.KNA_ACCESS?.labels.role(access.system_role) || access.position || '리더';
    const name = escapeText(access.name) || '사용자';
    const approved = access.approval_status === 'approved';
    const isExternalAdmin = access.system_role === 'external_admin';

    trigger.textContent = approved ? (isExternalAdmin ? `${name} · 관리자` : `${name} 리더 · ${escapeText(access.position) || roleLabel}`) : `${name} 리더 · 승인 대기`;
    trigger.href = approved ? 'dashboard.html' : 'login.html';
    trigger.classList.add('signed-in');
    trigger.setAttribute('aria-expanded', 'false');

    if (summary) summary.innerHTML = `<strong>${name}${isExternalAdmin ? '' : ' 리더'}</strong><span>${approved ? (escapeText(access.position) || roleLabel) : '승인 대기'}</span>`;
    if (popover) {
      const homeLink = popover.querySelector('a[href="dashboard.html"]');
      if (homeLink) homeLink.textContent = '리더 홈';
    }
    portalLinks.forEach(link => { link.classList.toggle('is-approved', approved); link.textContent = '리더 홈'; });
    buildLeaderNavigation(access);
    startApprovalPolling();
    startNotificationPolling();
  }

  function clearSessionMarkers() {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    localStorage.removeItem(SESSION_USER_KEY);
    warningShown = false;
  }
  function getLastActivity() {
    const value = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  function setLastActivity(force = false) {
    if (!state.session || timeoutInProgress) return;
    const now = Date.now();
    if (!force && now - lastActivityWrite < ACTIVITY_WRITE_GAP_MS) return;
    lastActivityWrite = now;
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    localStorage.setItem(SESSION_USER_KEY, state.session.user.id);
    warningShown = false;
    hideTimeoutNotice();
  }
  function getTimeoutNotice() {
    let notice = document.querySelector('#sessionTimeoutNotice');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'sessionTimeoutNotice';
      notice.className = 'session-timeout-notice';
      notice.setAttribute('role','status');
      notice.setAttribute('aria-live','polite');
      document.body.appendChild(notice);
    }
    return notice;
  }
  function showTimeoutNotice() {
    const notice = getTimeoutNotice();
    notice.textContent = '1분 동안 활동이 없으면 보안을 위해 자동으로 로그아웃됩니다.';
    requestAnimationFrame(() => notice.classList.add('show'));
  }
  function hideTimeoutNotice() { document.querySelector('#sessionTimeoutNotice')?.classList.remove('show'); }
  async function signOutForTimeout() {
    if (timeoutInProgress || !state.session) return;
    timeoutInProgress = true;
    clearSessionMarkers();
    try { await client.auth.signOut({ scope: 'local' }); } catch (error) { console.error(error); }
    const loginUrl = new URL('login.html', window.location.href);
    loginUrl.searchParams.set('timeout','1');
    window.location.replace(loginUrl.href);
  }
  async function checkIdleTimeout() {
    if (!state.session || timeoutInProgress) return false;
    const lastActivity = getLastActivity();
    if (!lastActivity) { setLastActivity(true); return false; }
    const idleFor = Date.now() - lastActivity;
    if (idleFor >= IDLE_TIMEOUT_MS) { await signOutForTimeout(); return true; }
    if (IDLE_TIMEOUT_MS - idleFor <= WARNING_BEFORE_MS) {
      if (!warningShown) { warningShown = true; showTimeoutNotice(); }
    } else if (warningShown) { warningShown = false; hideTimeoutNotice(); }
    return false;
  }
  function prepareActivityTracking() {
    if (activityListenersReady) return;
    activityListenersReady = true;
    const record = () => setLastActivity(false);
    ['pointerdown','keydown','touchstart','scroll'].forEach(name => window.addEventListener(name, record, { passive: true }));
    window.addEventListener('focus', async () => { const timedOut = await checkIdleTimeout(); if (!timedOut) { setLastActivity(true); refreshApprovalCounts(); refreshNotificationCount(); } });
    document.addEventListener('visibilitychange', async () => { if (document.visibilityState !== 'visible') return; const timedOut = await checkIdleTimeout(); if (!timedOut) { setLastActivity(true); refreshApprovalCounts(); refreshNotificationCount(); } });
    window.addEventListener('storage', event => { if (event.key === LAST_ACTIVITY_KEY) { warningShown = false; hideTimeoutNotice(); } });
    timeoutTimer = window.setInterval(checkIdleTimeout, 15000);
  }
  async function initializeTimeoutForSession(session) {
    if (!session) { clearSessionMarkers(); return false; }
    const storedUserId = localStorage.getItem(SESSION_USER_KEY);
    state.session = session;
    if (storedUserId !== session.user.id || !getLastActivity()) setLastActivity(true);
    else if (await checkIdleTimeout()) return true;
    prepareActivityTracking();
    return false;
  }

  const memberAlertButton = document.querySelector('[data-open-alert]');
  memberAlertButton?.addEventListener('click', async event => {
    if (!state.session) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    await openNotificationCenter();
  }, true);

  trigger.addEventListener('click', event => {
    if (!state.session || !popover) return;
    event.preventDefault();
    popover.hidden = !popover.hidden;
    trigger.setAttribute('aria-expanded', String(!popover.hidden));
  });
  document.addEventListener('click', event => { if (!shell.contains(event.target)) closePopover(); });
  logoutButton?.addEventListener('click', async () => {
    logoutButton.disabled = true;
    clearSessionMarkers();
    await client.auth.signOut({ scope: 'local' });
    location.href = 'index.html';
  });

  async function refresh() {
    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      state.session = data.session;
      if (!state.session) {
        state.profile = null; state.access = null; clearSessionMarkers(); renderSignedOut(); dispatchReady(); return;
      }
      if (await initializeTimeoutForSession(state.session)) return;
      const access = await loadAccess(state.session.user.id);
      state.profile = access; state.access = access;
      renderSignedIn(access || { name: state.session.user.email, approval_status: 'pending', system_role: 'leader', permissions: [] });
    } catch (error) {
      console.error(error);
      if (state.session) renderSignedIn({ name: String(state.session.user?.email || '로그인 사용자').split('@')[0], approval_status: 'pending', system_role: 'leader', position: '로그인됨', permissions: [] });
      else renderSignedOut();
    }
    dispatchReady();
  }

  client.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') {
      clearSessionMarkers();
      if (timeoutTimer) { clearInterval(timeoutTimer); timeoutTimer = null; }
      if (approvalPollTimer) { clearInterval(approvalPollTimer); approvalPollTimer = null; }
      if (notificationPollTimer) { clearInterval(notificationPollTimer); notificationPollTimer = null; }
    }
    setTimeout(refresh, 0);
  });
  await refresh();
})();
