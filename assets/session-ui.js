(async () => {
  const shell = document.querySelector('[data-session-shell]');
  const trigger = document.querySelector('[data-session-trigger]');
  const popover = document.querySelector('[data-session-popover]');
  const summary = document.querySelector('[data-session-summary]');
  const logoutButton = document.querySelector('[data-session-logout]');
  const portalLinks = [...document.querySelectorAll('[data-portal-link]')];
  const client = window.knaSupabase;

  const state = { session: null, profile: null, access: null };
  window.KNA_SESSION_STATE = state;

  const dispatchReady = () => document.dispatchEvent(new CustomEvent('kna:session-ready', { detail: state }));

  if (!shell || !trigger || !window.SUPABASE_CONFIG_READY || !client) {
    dispatchReady();
    return;
  }

  const escapeText = value => String(value ?? '').trim();

  async function loadAccess(userId) {
    try {
      const { data, error } = await client.rpc('get_my_access');
      if (!error && data) return data;
    } catch (_) {}

    const { data, error } = await client
      .from('profiles')
      .select('id,name,school,cohort,department,approval_status,position,system_role')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { ...data, permissions: [] };
  }

  function closePopover() {
    if (popover) popover.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }

  function renderSignedOut() {
    trigger.textContent = '로그인';
    trigger.href = 'login.html';
    trigger.classList.remove('signed-in');
    trigger.setAttribute('aria-expanded', 'false');
    if (popover) popover.hidden = true;
  }

  function renderSignedIn(access) {
    const roleLabel = window.KNA_ACCESS?.labels.role(access.system_role) || access.position || '리더';
    const name = escapeText(access.name) || '사용자';
    const approved = access.approval_status === 'approved';
    const isExternalAdmin = access.system_role === 'external_admin';

    trigger.textContent = approved
      ? (isExternalAdmin ? `${name} · 관리자` : `${name} 리더 · ${escapeText(access.position) || roleLabel}`)
      : `${name} 리더 · 승인 대기`;
    trigger.href = 'dashboard.html';
    trigger.classList.add('signed-in');
    trigger.setAttribute('aria-expanded', 'false');

    if (summary) {
      summary.innerHTML = `<strong>${name}${isExternalAdmin ? '' : ' 리더'}</strong><span>${approved ? (escapeText(access.position) || roleLabel) : '승인 대기'}</span>`;
    }
    portalLinks.forEach(link => link.classList.toggle('is-approved', approved));
  }

  trigger.addEventListener('click', event => {
    if (!state.session || !popover) return;
    event.preventDefault();
    popover.hidden = !popover.hidden;
    trigger.setAttribute('aria-expanded', String(!popover.hidden));
  });

  document.addEventListener('click', event => {
    if (!shell.contains(event.target)) closePopover();
  });

  logoutButton?.addEventListener('click', async () => {
    logoutButton.disabled = true;
    await client.auth.signOut();
    location.href = 'index.html';
  });

  async function refresh() {
    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      state.session = data.session;
      if (!state.session) {
        state.profile = null;
        state.access = null;
        renderSignedOut();
        dispatchReady();
        return;
      }
      const access = await loadAccess(state.session.user.id);
      state.profile = access;
      state.access = access;
      renderSignedIn(access || { name: state.session.user.email, approval_status: 'pending', system_role: 'leader', permissions: [] });
    } catch (error) {
      console.error(error);
      renderSignedOut();
    }
    dispatchReady();
  }

  client.auth.onAuthStateChange(() => setTimeout(refresh, 0));
  await refresh();
})();
