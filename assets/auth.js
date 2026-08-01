(() => {
  const client = window.knaSupabase;
  const configWarning = document.querySelector('#configWarning');
  const messageBox = document.querySelector('#authMessage');

  const showMessage = (text, type = 'info') => {
    if (!messageBox) return;
    messageBox.className = `auth-message show ${type}`;
    messageBox.textContent = text;
  };

  if (!window.SUPABASE_CONFIG_READY || !client) {
    configWarning?.classList.add('show');
    showMessage('Supabase 연결정보를 먼저 입력해야 회원가입과 로그인을 사용할 수 있습니다.', 'warning');
    document.querySelectorAll('form[data-auth-form] button[type="submit"]').forEach(btn => btn.disabled = true);
    return;
  }

  const tabs = [...document.querySelectorAll('[data-auth-tab]')];
  const sections = [...document.querySelectorAll('[data-auth-section]')];
  const activateTab = name => {
    tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.authTab === name));
    sections.forEach(section => section.hidden = section.dataset.authSection !== name);
  };
  tabs.forEach(tab => tab.addEventListener('click', () => activateTab(tab.dataset.authTab)));

  const redirectUrl = new URL('login.html?verified=1', window.location.href).href;

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
    const { data, error } = await client
      .from('profiles')
      .select('id,name,school,cohort,department,approval_status,position,system_role')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  };

  const signupForm = document.querySelector('#signupForm');
  signupForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const form = new FormData(signupForm);
    const submit = signupForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = '신청 중...';
    showMessage('회원가입 신청을 처리하고 있습니다.', 'info');

    try {
      const email = String(form.get('email') || '').trim();
      const password = String(form.get('password') || '');
      const metadata = {
        name: String(form.get('name') || '').trim(),
        school: String(form.get('school') || '').trim(),
        cohort: String(form.get('cohort') || '').trim(),
        department: String(form.get('department') || '').trim()
      };

      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: metadata
        }
      });
      if (error) throw error;

      signupForm.reset();
      showMessage(
        `${email}로 인증메일을 보냈습니다. 메일에서 '이메일 인증하기'를 누른 뒤 관리자 승인을 기다려 주세요.`,
        'success'
      );
      if (data.session) await client.auth.signOut();
    } catch (error) {
      showMessage(koreanError(error), 'error');
    } finally {
      submit.disabled = false;
      submit.textContent = '가입 신청';
    }
  });

  const loginForm = document.querySelector('#loginForm');
  loginForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const form = new FormData(loginForm);
    const submit = loginForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = '로그인 중...';

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: String(form.get('email') || '').trim(),
        password: String(form.get('password') || '')
      });
      if (error) throw error;

      const profile = await getProfile(data.user.id);
      if (!profile) {
        showMessage('프로필을 찾을 수 없습니다. 관리자에게 문의해 주세요.', 'error');
        return;
      }

      if (profile.approval_status === 'approved') {
        showMessage('로그인되었습니다. 내부 포털로 이동합니다.', 'success');
        setTimeout(() => location.href = 'dashboard.html', 500);
      } else if (profile.approval_status === 'pending') {
        showMessage('이메일 인증은 완료되었지만 관리자 승인 대기 중입니다.', 'warning');
      } else if (profile.approval_status === 'rejected') {
        showMessage('가입 신청이 반려되었습니다. 관리자에게 문의해 주세요.', 'error');
      } else {
        showMessage('현재 계정 이용이 중지되어 있습니다. 관리자에게 문의해 주세요.', 'error');
      }
    } catch (error) {
      showMessage(koreanError(error), 'error');
    } finally {
      submit.disabled = false;
      submit.textContent = '로그인';
    }
  });

  const resendButton = document.querySelector('#resendButton');
  resendButton?.addEventListener('click', async () => {
    const email = document.querySelector('#signupEmail')?.value.trim();
    if (!email) {
      showMessage('회원가입에 사용한 이메일을 입력해 주세요.', 'warning');
      activateTab('signup');
      return;
    }
    resendButton.disabled = true;
    try {
      const { error } = await client.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: redirectUrl }
      });
      if (error) throw error;
      showMessage('인증메일을 다시 보냈습니다. 같은 주소로 반복 요청할 때는 잠시 기다려야 합니다.', 'success');
    } catch (error) {
      showMessage(koreanError(error), 'error');
    } finally {
      setTimeout(() => resendButton.disabled = false, 60000);
    }
  });

  const checkExistingSession = async () => {
    const params = new URLSearchParams(location.search);
    if (params.get('verified') === '1') {
      showMessage('이메일 인증이 처리되었습니다. 승인 상태를 확인합니다.', 'success');
    }

    const { data } = await client.auth.getSession();
    const session = data.session;
    if (!session) return;

    try {
      const profile = await getProfile(session.user.id);
      if (profile?.approval_status === 'approved') {
        showMessage('이미 로그인된 승인 계정입니다. 내부 포털로 이동할 수 있습니다.', 'success');
      } else if (profile?.approval_status === 'pending') {
        showMessage('이메일 인증이 완료되었으며 관리자 승인 대기 중입니다.', 'warning');
      }
    } catch (error) {
      showMessage(koreanError(error), 'error');
    }
  };

  client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' && new URLSearchParams(location.search).get('verified') === '1') {
      checkExistingSession();
    }
  });
  checkExistingSession();
})();
