(async () => {
  const client = window.knaSupabase;
  const list = document.querySelector('#publicScheduleList');
  const title = document.querySelector('#publicMonthTitle');
  const previous = document.querySelector('#publicPreviousMonth');
  const next = document.querySelector('#publicNextMonth');
  const filters = document.querySelector('#publicScheduleFilters');
  const state = { month:new Date(new Date().getFullYear(),new Date().getMonth(),1), filter:'all', rows:[] };
  const pad = value => String(value).padStart(2,'0');
  const monthStart = () => `${state.month.getFullYear()}-${pad(state.month.getMonth()+1)}-01`;
  const monthEnd = () => `${state.month.getFullYear()}-${pad(state.month.getMonth()+1)}-${pad(new Date(state.month.getFullYear(),state.month.getMonth()+1,0).getDate())}`;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const scopeLabel = scope => ({policy_office:'정책국',div1:'정책1부',div2:'정책2부'}[scope] || scope);

  previous.addEventListener('click', async () => { state.month = new Date(state.month.getFullYear(),state.month.getMonth()-1,1); await load(); });
  next.addEventListener('click', async () => { state.month = new Date(state.month.getFullYear(),state.month.getMonth()+1,1); await load(); });
  filters.addEventListener('click', event => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    state.filter = button.dataset.filter;
    filters.querySelectorAll('[data-filter]').forEach(item => item.classList.toggle('active',item===button));
    render();
  });

  if (!window.SUPABASE_CONFIG_READY || !client) {
    list.innerHTML = '<div class="empty-state">일정 서비스를 불러오지 못했습니다.</div>';
    return;
  }
  await load();

  async function load() {
    title.textContent = `${state.month.getFullYear()}년 ${state.month.getMonth()+1}월`;
    list.innerHTML = '<div class="empty-state">일정을 불러오고 있습니다.</div>';
    const { data, error } = await client.rpc('list_public_schedules_v1',{ p_start_date:monthStart(), p_end_date:monthEnd() });
    if (error) {
      list.innerHTML = '<div class="empty-state">공개 일정을 불러오지 못했습니다.</div>';
      return;
    }
    state.rows = data || [];
    render();
  }

  function render() {
    const rows = state.filter === 'all' ? state.rows : state.rows.filter(row => row.scope === state.filter);
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state">이 달에 공개된 일정이 아직 없습니다.</div>';
      return;
    }
    list.innerHTML = rows.map(item => {
      const date = new Date(`${item.event_date}T00:00:00`);
      const time = [item.start_time ? String(item.start_time).slice(0,5) : '', item.end_time ? `~ ${String(item.end_time).slice(0,5)}` : ''].filter(Boolean).join(' ');
      return `<article class="public-schedule-item"><time><strong>${date.getDate()}</strong><span>${date.toLocaleDateString('ko-KR',{weekday:'long'})}</span></time><div><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.note || '세부 내용은 일정에 맞춰 안내합니다.')}</p><div class="public-schedule-meta"><span>${scopeLabel(item.scope)}</span>${time ? `<span>${escapeHtml(time)}</span>` : ''}${item.location ? `<span>${escapeHtml(item.location)}</span>` : ''}</div></div></article>`;
    }).join('');
  }
})();
