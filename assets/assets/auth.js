(() => {
  const client = window.knaSupabase;
  const configWarning = document.querySelector('#configWarning');
  const messageBox = document.querySelector('#authMessage');
  const showMessage = (text, type = 'info') => { if (!messageBox) return; messageBox.className = `auth-message show ${type}`; messageBox.textContent = text; };
  if (!window.SUPABASE_CONFIG_READY || !client) {
    configWarning?.classList.add('show');
    showMessage('리더 서비스 연결 설정이 완료되지 않았습니다. 홈페이지 관리자에게 문의해 주세요.', 'warning');
    document.querySelectorAll('form[data-auth-form] button[type="submit"]').forEach(btn => btn.disabled = true);
    return;
  }

  const tabs = [...document.querySelectorAll('[data-auth-tab]')];
  const sections = [...document.querySelectorAll('[data-auth-section]')];
  const activateTab = name => { tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.authTab === name)); sections.forEach(section => section.hidden = section.dataset.authSection !== name); };
  tabs.forEach(tab => tab.addEventListener('click', () => activateTab(tab.dataset.authTab)));
  const requestedTab = new URLSearchParams(location.search).get('tab');
  if (requestedTab === 'signup') activateTab('signup');
  document.querySelectorAll('[data-auth-tab-jump]').forEach(button => button.addEventListener('click', () => activateTab(button.dataset.authTabJump)));

  const accountModeButtons = [...document.querySelectorAll('[data-account-mode]')];
  const accountPanes = [...document.querySelectorAll('[data-account-pane]')];
  const setAccountMode = mode => {
    accountModeButtons.forEach(button => { const active = button.dataset.accountMode === mode; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
    accountPanes.forEach(pane => pane.hidden = pane.dataset.accountPane !== mode);
  };
  document.querySelectorAll('[data-account-view]').forEach(button => button.addEventListener('click', () => { activateTab('account'); setAccountMode(button.dataset.accountView || 'id'); }));
  accountModeButtons.forEach(button => button.addEventListener('click', () => setAccountMode(button.dataset.accountMode)));

  const requestedPosition = document.querySelector('#requestedPosition');
  const requestedPositionOtherField = document.querySelector('#requestedPositionOtherField');
  const requestedPositionOther = document.querySelector('#requestedPositionOther');
  const syncRequestedPositionField = () => {
    const isOther = requestedPosition?.value === '기타';
    if (requestedPositionOtherField) requestedPositionOtherField.hidden = !isOther;
    if (requestedPositionOther) {
      requestedPositionOther.required = Boolean(isOther);
      if (!isOther) requestedPositionOther.value = '';
    }
  };
  requestedPosition?.addEventListener('change', syncRequestedPositionField);
  syncRequestedPositionField();

  const redirectUrl = new URL('login.html?verified=1', window.location.href).href;
  const passwordRecoveryUrl = new URL('reset-password.html', window.location.href).href;
  const koreanError = error => {
    const msg = String(error?.message || error || '');
    if (/invalid login credentials/i.test(msg)) return '이메일 또는 비밀번호가 올바르지 않습니다.';
    if (/email not confirmed/i.test(msg)) return '이메일 인증을 먼저 완료해 주세요.';
    if (/user already registered/i.test(msg)) return '이미 가입된 이메일입니다.';
    if (/password/i.test(msg) && /least/i.test(msg)) return '비밀번호 길이와 조건을 확인해 주세요.';
    if (/rate limit/i.test(msg)) return '요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.';
    return msg || '요청 처리 중 오류가 발생했습니다.';
  };
  const getProfile = async userId => {
    const { data, error } = await client.from('profiles').select('id,name,school,cohort,department,approval_status,position,system_role').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data;
  };

  document.querySelector('#signupForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const submit = formElement.querySelector('button[type="submit"]');
    submit.disabled = true; submit.textContent = '신청 중...';
    try {
      const email = String(form.get('email') || '').trim();
      const requestedPositionValue = String(form.get('requested_position')||'').trim();
      const requestedPositionText = requestedPositionValue === '기타' ? String(form.get('requested_position_other')||'').trim() : requestedPositionValue;
      if (!requestedPositionText) throw new Error('현재 직책을 입력해 주세요.');
      const { data, error } = await client.auth.signUp({
        email,
        password: String(form.get('password') || ''),
        options: { emailRedirectTo: redirectUrl, data: { name:String(form.get('name')||'').trim(), school:String(form.get('school')||'').trim(), cohort:String(form.get('cohort')||'').trim(), department:String(form.get('department')||'').trim(), requested_position:requestedPositionText } }
      });
      if (error) throw error;
      formElement.reset();
      showMessage(`${email}로 인증메일을 보냈습니다. 이메일 인증과 가입 승인이 끝나면 리더 홈을 이용할 수 있습니다.`, 'success');
      if (data.session) await client.auth.signOut();
    } catch (error) { showMessage(koreanError(error), 'error'); }
    finally { submit.disabled = false; submit.textContent = '가입 신청'; }
  });

  document.querySelector('#loginForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const submit = formElement.querySelector('button[type="submit"]');
    submit.disabled = true; submit.textContent = '로그인 중...';
    try {
      const { data, error } = await client.auth.signInWithPassword({ email:String(form.get('email')||'').trim(), password:String(form.get('password')||'') });
      if (error) throw error;
      const profile = await getProfile(data.user.id);
      if (!profile) return showMessage('프로필을 찾을 수 없습니다. 관리자에게 문의해 주세요.', 'error');
      if (profile.approval_status === 'approved') {
        showMessage('로그인되었습니다. 리더 홈으로 이동합니다.', 'success');
        setTimeout(() => location.href = 'dashboard.html', 350);
      } else if (profile.approval_status === 'pending') showMessage('이메일 인증은 완료되었지만 가입 승인 대기 중입니다.', 'warning');
      else if (profile.approval_status === 'rejected') showMessage('가입 신청이 반려되었습니다. 관리자에게 문의해 주세요.', 'error');
      else showMessage('현재 계정 이용이 중지되어 있습니다. 관리자에게 문의해 주세요.', 'error');
    } catch (error) { showMessage(koreanError(error), 'error'); }
    finally { submit.disabled = false; submit.textContent = '로그인'; }
  });

  document.querySelector('#passwordResetRequestForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const submit = formElement.querySelector('button[type="submit"]');
    submit.disabled = true; submit.textContent = '전송 중...';
    try {
      const { error } = await client.auth.resetPasswordForEmail(String(form.get('email')||'').trim(), { redirectTo: passwordRecoveryUrl });
      if (error) throw error;
      showMessage('가입된 이메일이라면 비밀번호 재설정 메일이 발송됩니다. 메일함과 스팸함을 확인해 주세요.', 'success');
    } catch (error) { showMessage(koreanError(error), 'error'); }
    finally { submit.disabled = false; submit.textContent = '재설정 메일 보내기'; }
  });

  const resendButton = document.querySelector('#resendButton');
  resendButton?.addEventListener('click', async () => {
    const email = document.querySelector('#signupEmail')?.value.trim();
    if (!email) { showMessage('가입 신청에 사용한 이메일을 입력해 주세요.', 'warning'); activateTab('signup'); return; }
    resendButton.disabled = true;
    try {
      const { error } = await client.auth.resend({ type:'signup', email, options:{ emailRedirectTo:redirectUrl } });
      if (error) throw error;
      showMessage('인증메일을 다시 보냈습니다.', 'success');
    } catch (error) { showMessage(koreanError(error), 'error'); }
    finally { setTimeout(() => resendButton.disabled = false, 60000); }
  });

  async function checkExistingSession() {
    const params = new URLSearchParams(location.search);
    if (params.get('verified') === '1') showMessage('이메일 인증이 처리되었습니다. 가입 승인 상태를 확인해 주세요.', 'success');
    if (params.get('password_reset') === '1') { showMessage('비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.', 'success'); activateTab('login'); }
    if (params.get('timeout') === '1') { showMessage('30분 동안 활동이 없어 보안을 위해 자동으로 로그아웃되었습니다.', 'warning'); activateTab('login'); }
    const { data } = await client.auth.getSession();
    if (!data.session) return;
    try {
      const profile = await getProfile(data.session.user.id);
      if (profile?.approval_status === 'approved') showMessage('이미 로그인되어 있습니다. 상단의 리더 홈을 눌러 바로 이용할 수 있습니다.', 'success');
      else if (profile?.approval_status === 'pending') showMessage('이메일 인증이 완료되었으며 가입 승인 대기 중입니다.', 'warning');
    } catch (error) { showMessage(koreanError(error), 'error'); }
  }
  client.auth.onAuthStateChange(event => { if (event === 'SIGNED_IN' && new URLSearchParams(location.search).get('verified') === '1') checkExistingSession(); });
  checkExistingSession();
})();
