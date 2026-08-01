(() => {
  const client = window.knaSupabase;
  const form = document.querySelector('#newPasswordForm');
  const message = document.querySelector('#recoveryMessage');

  const show = (text, type = 'info') => {
    if (!message) return;
    message.className = `auth-message show ${type}`;
    message.textContent = text;
  };

  if (!window.SUPABASE_CONFIG_READY || !client || !form) {
    form?.querySelector('button[type="submit"]')?.setAttribute('disabled', 'disabled');
    show('계정 복구 서비스를 불러오지 못했습니다. 관리자에게 문의해 주세요.', 'error');
    return;
  }

  let recoveryReady = false;
  const markReady = () => {
    recoveryReady = true;
    show('새 비밀번호를 입력해 주세요.', 'success');
  };

  client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) markReady();
  });

  client.auth.getSession().then(({ data, error }) => {
    if (error) return show('재설정 링크를 확인하지 못했습니다. 새 링크를 다시 요청해 주세요.', 'error');
    if (data.session) markReady();
    else show('유효한 재설정 링크가 아닙니다. 로그인 화면에서 새 링크를 요청해 주세요.', 'warning');
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    const data = new FormData(form);
    const password = String(data.get('password') || '');
    const passwordConfirm = String(data.get('passwordConfirm') || '');

    if (!recoveryReady) return show('재설정 링크 확인이 완료되지 않았습니다.', 'warning');
    if (password.length < 8) return show('비밀번호는 8자 이상으로 입력해 주세요.', 'warning');
    if (password !== passwordConfirm) return show('비밀번호 확인 값이 일치하지 않습니다.', 'warning');

    submit.disabled = true;
    submit.textContent = '변경 중...';
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      await client.auth.signOut();
      location.replace('login.html?password_reset=1');
    } catch (error) {
      const text = String(error?.message || error || '');
      show(/same password/i.test(text) ? '기존 비밀번호와 다른 비밀번호를 입력해 주세요.' : (text || '비밀번호를 변경하지 못했습니다.'), 'error');
    } finally {
      submit.disabled = false;
      submit.textContent = '비밀번호 변경';
    }
  });
})();
