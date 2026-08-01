(async () => {
  const client = window.knaSupabase;
  const list = document.querySelector('#publicScheduleList');
  const calendar = document.querySelector('#publicScheduleCalendar');
  const details = document.querySelector('#publicScheduleDetails');
  const title = document.querySelector('#publicMonthTitle');
  const previous = document.querySelector('#publicPreviousMonth');
  const next = document.querySelector('#publicNextMonth');
  const filters = document.querySelector('#publicScheduleFilters');
  const state = { month:new Date(new Date().getFullYear(),new Date().getMonth(),1), filter:'all', rows:[], selectedDate:null };
  const pad = value => String(value).padStart(2,'0');
  const monthStart = () => `${state.month.getFullYear()}-${pad(state.month.getMonth()+1)}-01`;
  const monthEnd = () => `${state.month.getFullYear()}-${pad(state.month.getMonth()+1)}-${pad(new Date(state.month.getFullYear(),state.month.getMonth()+1,0).getDate())}`;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const scopeLabel = scope => ({policy_office:'정책국',div1:'정책1부',div2:'정책2부'}[scope] || scope);

  previous.addEventListener('click', async () => { state.month = new Date(state.month.getFullYear(),state.month.getMonth()-1,1); state.selectedDate=null; await load(); });
  next.addEventListener('click', async () => { state.month = new Date(state.month.getFullYear(),state.month.getMonth()+1,1); state.selectedDate=null; await load(); });
  filters.addEventListener('click', event => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    state.filter = button.dataset.filter;
    filters.querySelectorAll('[data-filter]').forEach(item => item.classList.toggle('active',item===button));
    renderAll();
  });

  if (!window.SUPABASE_CONFIG_READY || !client) {
    list.innerHTML = '<div class="empty-state">일정 서비스를 불러오지 못했습니다.</div>';
    calendar.innerHTML = '<div class="empty-state">일정 서비스를 불러오지 못했습니다.</div>';
    return;
  }
  await load();

  async function load() {
    title.textContent = `${state.month.getFullYear()}년 ${state.month.getMonth()+1}월`;
    list.innerHTML = '<div class="empty-state">일정을 불러오고 있습니다.</div>';
    calendar.innerHTML = '<div class="empty-state">달력을 불러오고 있습니다.</div>';
    const { data, error } = await client.rpc('list_public_policy_schedules_v2',{ p_start_date:monthStart(), p_end_date:monthEnd() });
    if (error) {
      list.innerHTML = '<div class="empty-state">공개 일정을 불러오지 못했습니다.</div>';
      calendar.innerHTML = '<div class="empty-state">공개 일정을 불러오지 못했습니다.</div>';
      return;
    }
    state.rows = data || [];
    if (!state.selectedDate && state.rows.length) state.selectedDate = state.rows[0].event_date;
    renderAll();
  }

  function filteredRows() {
    return state.filter === 'all' ? state.rows : state.rows.filter(row => row.scope === state.filter);
  }

  function renderAll() {
    const rows = filteredRows();
    renderCalendar(rows);
    renderDetails(rows);
    renderUpcoming(rows);
  }

  function renderCalendar(rows) {
    const year = state.month.getFullYear();
    const month = state.month.getMonth();
    const firstDay = new Date(year,month,1).getDay();
    const daysInMonth = new Date(year,month+1,0).getDate();
    const grouped = new Map();
    rows.forEach(row => {
      const key = String(row.event_date);
      if (!grouped.has(key)) grouped.set(key,[]);
      grouped.get(key).push(row);
    });
    const cells=[];
    for(let i=0;i<firstDay;i++) cells.push('<span class="public-calendar-day blank"></span>');
    for(let day=1;day<=daysInMonth;day++){
      const date=`${year}-${pad(month+1)}-${pad(day)}`;
      const count=grouped.get(date)?.length||0;
      cells.push(`<button type="button" class="public-calendar-day ${count?'has-event':''} ${state.selectedDate===date?'selected':''}" data-date="${date}"><span>${day}</span>${count?`<i>${count}</i>`:''}</button>`);
    }
    calendar.innerHTML=`<div class="public-calendar-weekdays">${['일','월','화','수','목','금','토'].map(v=>`<span>${v}</span>`).join('')}</div><div class="public-calendar-days">${cells.join('')}</div>`;
    calendar.querySelectorAll('[data-date]').forEach(button=>button.addEventListener('click',()=>{
      state.selectedDate=button.dataset.date;
      renderCalendar(rows);
      renderDetails(rows);
    }));
  }

  function renderDetails(rows) {
    if (!state.selectedDate) {
      details.innerHTML='<div class="empty-state">일정이 있는 날짜를 선택하면 상세 내용이 표시됩니다.</div>';
      return;
    }
    const dayRows=rows.filter(row=>String(row.event_date)===state.selectedDate);
    const dateLabel=new Date(`${state.selectedDate}T00:00:00`).toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'});
    if(!dayRows.length){
      details.innerHTML=`<div class="public-detail-head"><strong>${dateLabel}</strong></div><div class="empty-state">등록된 공개 일정이 없습니다.</div>`;
      return;
    }
    details.innerHTML=`<div class="public-detail-head"><strong>${dateLabel}</strong></div>${dayRows.map(scheduleCard).join('')}`;
  }

  function renderUpcoming(rows) {
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state">이 달에 공개된 일정이 아직 없습니다.</div>';
      return;
    }
    const today = new Date();
    today.setHours(0,0,0,0);
    const upcoming=[...rows]
      .filter(item => new Date(`${item.event_date}T00:00:00`) >= today)
      .sort((a,b)=>String(a.event_date).localeCompare(String(b.event_date)) || String(a.start_time||'').localeCompare(String(b.start_time||'')));
    list.innerHTML = upcoming.map(item => {
      const date = new Date(`${item.event_date}T00:00:00`);
      const time = [item.start_time ? String(item.start_time).slice(0,5) : '', item.end_time ? `~ ${String(item.end_time).slice(0,5)}` : ''].filter(Boolean).join(' ');
      return `<article class="public-schedule-item"><time><strong>${date.getDate()}</strong><span>${date.toLocaleDateString('ko-KR',{weekday:'long'})}</span></time><div><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.note || '세부 내용은 일정에 맞춰 안내합니다.')}</p><div class="public-schedule-meta"><span>${scopeLabel(item.scope)}</span>${time ? `<span>${escapeHtml(time)}</span>` : ''}${item.location ? `<span>${escapeHtml(item.location)}</span>` : ''}</div></div></article>`;
    }).join('');
  }

  function scheduleCard(item){
    const time = [item.start_time ? String(item.start_time).slice(0,5) : '', item.end_time ? `~ ${String(item.end_time).slice(0,5)}` : ''].filter(Boolean).join(' ');
    return `<article class="public-detail-item"><div><span class="scope-badge">${scopeLabel(item.scope)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.note || '세부 내용은 추후 안내됩니다.')}</p><div class="public-schedule-meta">${time?`<span>${escapeHtml(time)}</span>`:''}${item.location?`<span>${escapeHtml(item.location)}</span>`:''}</div></div></article>`;
  }
})();
