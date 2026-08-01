(async () => {
  const client = window.knaSupabase;
  const calendar = document.querySelector('#availabilityCalendar');
  const monthTitle = document.querySelector('#availabilityMonthTitle');
  const previousMonth = document.querySelector('#previousMonth');
  const nextMonth = document.querySelector('#nextMonth');
  const scopeSwitch = document.querySelector('#availabilityScopeSwitch');
  const submitButton = document.querySelector('#submitAvailability');
  const submissionState = document.querySelector('#availabilitySubmissionState');
  const availableCount = document.querySelector('#availableCount');
  const possibleCount = document.querySelector('#possibleCount');
  const help = document.querySelector('#availabilityHelp');
  const message = document.querySelector('#availabilityMessage');
  const managerSummary = document.querySelector('#managerSummary');
  const recommendList = document.querySelector('#recommendList');
  const detail = document.querySelector('#availabilityDetail');
  const confirmedList = document.querySelector('#confirmedScheduleList');
  const toggleConfirmedForm = document.querySelector('#toggleConfirmedForm');
  const confirmedForm = document.querySelector('#confirmedScheduleForm');
  const cancelConfirmedForm = document.querySelector('#cancelConfirmedForm');

  const state = {
    access: null,
    context: null,
    month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    scope: 'div1',
    submitted: false,
    selections: new Map(),
    summary: [],
    confirmed: [],
    editingScheduleId: null
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const pad = value => String(value).padStart(2, '0');
  const iso = date => `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  const monthStart = () => `${state.month.getFullYear()}-${pad(state.month.getMonth()+1)}-01`;
  const monthEnd = () => `${state.month.getFullYear()}-${pad(state.month.getMonth()+1)}-${pad(new Date(state.month.getFullYear(), state.month.getMonth()+1, 0).getDate())}`;
  const scopeLabel = scope => ({policy_office:'정책국 공통',div1:'정책1부',div2:'정책2부'}[scope] || scope);
  const statusLabel = status => ({available:'가능',possible:'조율 가능',unavailable:'어려움'}[status] || status);
  const show = (text, type='info') => { message.className = `auth-message show ${type}`; message.textContent = text; };
  const canView = scope => Boolean(state.context?.[`can_view_${scope}`]);
  const canManage = scope => scope === 'policy_office' ? Boolean(state.context?.can_manage_common) : Boolean(state.context?.[`can_manage_${scope}`]);
  const isOwnScope = scope => Boolean(state.context?.can_submit) && state.context?.own_scope === scope;

  if (!window.SUPABASE_CONFIG_READY || !client) {
    show('리더 서비스 연결 설정을 확인해 주세요.', 'error');
    return;
  }

  try {
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) return location.replace('login.html');
    const [{ data: access, error: accessError }, { data: context, error: contextError }] = await Promise.all([
      client.rpc('get_my_access'),
      client.rpc('get_availability_context_v1')
    ]);
    if (accessError) throw accessError;
    if (contextError) throw contextError;
    state.access = access;
    state.context = context;
    if (access?.approval_status !== 'approved') return location.replace('dashboard.html');

    const own = context?.own_scope;
    if (own === 'div1' || own === 'div2') state.scope = own;
    else if (context?.can_view_div1) state.scope = 'div1';
    else state.scope = 'div1';

    setupScopeButtons();
    setupConfirmedFormPermissions();
    if (!context?.can_submit && !context?.can_view_div1 && !context?.can_view_div2) show(context?.scope_message || '정책1부 또는 정책2부 소속이 확인되지 않아 일정 응답을 등록할 수 없습니다. 관리센터에서 소속을 확인해 주세요.', 'warning');
    bindEvents();
    await loadMonth();
  } catch (error) {
    console.error(error);
    show(error.message || '일정 확인 화면을 불러오지 못했습니다.', 'error');
  }

  function setupScopeButtons() {
    scopeSwitch.querySelectorAll('[data-scope]').forEach(button => {
      const scope = button.dataset.scope;
      const visible = isOwnScope(scope) || canView(scope);
      button.hidden = !visible;
      button.classList.toggle('active', scope === state.scope);
    });
  }

  function setupConfirmedFormPermissions() {
    const select = confirmedForm.elements.scope;
    [...select.options].forEach(option => option.disabled = !canManage(option.value));
    const firstAllowed = [...select.options].find(option => !option.disabled);
    if (firstAllowed) select.value = firstAllowed.value;
    toggleConfirmedForm.hidden = !firstAllowed;
  }

  function bindEvents() {
    previousMonth.addEventListener('click', async () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth()-1, 1); await loadMonth(); });
    nextMonth.addEventListener('click', async () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth()+1, 1); await loadMonth(); });
    scopeSwitch.addEventListener('click', async event => {
      const button = event.target.closest('[data-scope]');
      if (!button || button.hidden) return;
      state.scope = button.dataset.scope;
      scopeSwitch.querySelectorAll('[data-scope]').forEach(item => item.classList.toggle('active', item === button));
      detail.innerHTML = '';
      await loadMonth();
    });
    submitButton.addEventListener('click', submitAvailability);
    toggleConfirmedForm.addEventListener('click', () => openConfirmedForm());
    cancelConfirmedForm.addEventListener('click', closeConfirmedForm);
    confirmedForm.addEventListener('submit', saveConfirmedSchedule);
  }

  async function loadMonth() {
    monthTitle.textContent = `${state.month.getFullYear()}년 ${state.month.getMonth()+1}월`;
    state.selections = new Map();
    state.submitted = false;
    state.summary = [];
    help.textContent = '달력에서 가능한 날짜를 눌러 선택하세요.';
    submitButton.disabled = true;

    const ownPromise = isOwnScope(state.scope)
      ? client.rpc('get_my_availability_month_v1', { p_scope: state.scope, p_month_start: monthStart() })
      : Promise.resolve({ data: { submitted:false, selections:[] }, error:null });
    const summaryPromise = canView(state.scope)
      ? client.rpc('list_availability_summary_v1', { p_scope: state.scope, p_month_start: monthStart() })
      : Promise.resolve({ data: [], error:null });
    const confirmedPromise = client.rpc('list_confirmed_schedules_v1', { p_start_date: monthStart(), p_end_date: monthEnd() });

    const [ownResult, summaryResult, confirmedResult] = await Promise.all([ownPromise, summaryPromise, confirmedPromise]);
    if (ownResult.error) throw ownResult.error;
    if (summaryResult.error) throw summaryResult.error;
    if (confirmedResult.error) throw confirmedResult.error;

    const ownData = ownResult.data || { submitted:false, selections:[] };
    state.submitted = Boolean(ownData.submitted);
    (ownData.selections || []).forEach(item => state.selections.set(String(item.date), item.status));
    state.summary = summaryResult.data || [];
    state.confirmed = confirmedResult.data || [];

    renderSubmissionState(ownData);
    renderCalendar();
    renderCounts();
    renderManagerSummary();
    renderConfirmedSchedules();
  }

  function renderSubmissionState(ownData) {
    const own = isOwnScope(state.scope);
    if (!own) {
      submissionState.className = 'submission-state';
      submissionState.textContent = canView(state.scope) ? `${scopeLabel(state.scope)} 일정 현황 조회 화면입니다.` : (state.context?.scope_message || '소속 확인이 필요합니다.');
      submitButton.hidden = true;
      return;
    }
    submitButton.hidden = false;
    if (state.submitted) {
      const submittedAt = ownData.submitted_at ? new Date(ownData.submitted_at).toLocaleString('ko-KR') : '';
      submissionState.className = 'submission-state locked';
      submissionState.textContent = `제출 완료${submittedAt ? ` · ${submittedAt}` : ''}. 변경이 필요하면 해당 부서 수석부장에게 요청해 주세요.`;
      submitButton.disabled = true;
      submitButton.textContent = '제출 완료';
      help.textContent = '제출이 완료되어 달력이 잠겼습니다.';
    } else {
      submissionState.className = 'submission-state';
      submissionState.textContent = '아직 이 달 일정 응답을 제출하지 않았습니다.';
      submitButton.disabled = false;
      submitButton.textContent = '이 달 일정 응답 제출';
    }
  }

  function renderCalendar() {
    const year = state.month.getFullYear();
    const month = state.month.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const summaryByDate = new Map(state.summary.map(row => [String(row.available_date), row]));
    const maxScore = Math.max(0, ...state.summary.map(row => Number(row.available_count || 0)*2 + Number(row.possible_count || 0)));
    const cells = [];

    for (let index=0; index<firstDay; index++) cells.push('<span class="availability-day blank" aria-hidden="true"></span>');
    for (let day=1; day<=daysInMonth; day++) {
      const date = `${year}-${pad(month+1)}-${pad(day)}`;
      const selected = state.selections.get(date) || '';
      const summary = summaryByDate.get(date);
      const score = summary ? Number(summary.available_count || 0)*2 + Number(summary.possible_count || 0) : 0;
      const recommended = canView(state.scope) && maxScore > 0 && score === maxScore;
      const locked = state.submitted || !isOwnScope(state.scope);
      const counts = summary && canView(state.scope)
        ? `<span class="manager-count">가능 ${summary.available_count} · 조율 ${summary.possible_count}<br>제출 ${summary.submission_count}명</span>`
        : '';
      cells.push(`<button type="button" class="availability-day ${selected} ${locked ? 'locked' : ''} ${recommended ? 'recommended' : ''}" data-date="${date}" aria-label="${day}일 ${selected ? statusLabel(selected) : '미선택'}"><span class="day-number">${day}</span>${counts}${selected ? `<span class="day-status">${statusLabel(selected)}</span>` : ''}</button>`);
    }

    calendar.innerHTML = `<div class="availability-weekdays">${['일','월','화','수','목','금','토'].map(day => `<span>${day}</span>`).join('')}</div><div class="availability-days">${cells.join('')}</div>`;
    calendar.querySelectorAll('[data-date]').forEach(button => button.addEventListener('click', () => onDateClick(button.dataset.date)));
  }

  async function onDateClick(date) {
    if (isOwnScope(state.scope) && !state.submitted) {
      const current = state.selections.get(date);
      if (!current) state.selections.set(date, 'available');
      else if (current === 'available') state.selections.set(date, 'possible');
      else state.selections.delete(date);
      renderCalendar();
      renderCounts();
      return;
    }
    if (canView(state.scope)) await loadDetails(date);
  }

  function renderCounts() {
    const values = [...state.selections.values()];
    availableCount.textContent = values.filter(value => value === 'available').length;
    possibleCount.textContent = values.filter(value => value === 'possible').length;
  }

  async function submitAvailability() {
    if (state.submitted || !isOwnScope(state.scope)) { show(state.context?.scope_message || '본인 소속 부서의 일정 응답만 제출할 수 있습니다.', 'warning'); return; }
    const count = state.selections.size;
    if (!confirm(`${state.month.getFullYear()}년 ${state.month.getMonth()+1}월 일정 응답을 제출하시겠습니까?\n\n선택한 날짜 ${count}개가 제출되며 이후 본인이 수정하거나 삭제할 수 없습니다.`)) return;
    submitButton.disabled = true;
    const selections = [...state.selections.entries()].map(([date,status]) => ({ date, status }));
    const { error } = await client.rpc('submit_availability_month_v1', { p_scope:state.scope, p_month_start:monthStart(), p_selections:selections });
    if (error) {
      submitButton.disabled = false;
      return show(error.message, 'error');
    }
    show('일정 응답을 제출했습니다.', 'success');
    await loadMonth();
  }

  function renderManagerSummary() {
    managerSummary.hidden = !canView(state.scope);
    if (!canView(state.scope)) return;
    const ranked = [...state.summary]
      .filter(row => Number(row.submission_count || 0) > 0)
      .sort((a,b) => (Number(b.available_count)*2 + Number(b.possible_count)) - (Number(a.available_count)*2 + Number(a.possible_count)))
      .slice(0,5);
    if (!ranked.length) {
      recommendList.innerHTML = '<div class="empty-state">아직 제출한 리더가 없습니다.</div>';
      return;
    }
    recommendList.innerHTML = ranked.map(row => {
      const date = new Date(`${row.available_date}T00:00:00`);
      return `<button type="button" class="recommend-item" data-detail-date="${row.available_date}"><strong>${date.getMonth()+1}/${date.getDate()}</strong><span>가능 ${row.available_count}명 · 조율 ${row.possible_count}명 · 어려움 ${row.unavailable_count}명</span><b>${row.submission_count}명 제출</b></button>`;
    }).join('');
    recommendList.querySelectorAll('[data-detail-date]').forEach(button => button.addEventListener('click', () => loadDetails(button.dataset.detailDate)));
  }

  async function loadDetails(date) {
    detail.innerHTML = '<div class="loading-state">리더별 일정 응답을 불러오고 있습니다.</div>';
    const { data, error } = await client.rpc('list_availability_details_v1', { p_scope:state.scope, p_available_date:date });
    if (error) { detail.innerHTML = `<div class="auth-message show error">${escapeHtml(error.message)}</div>`; return; }
    const rows = data || [];
    const label = new Date(`${date}T00:00:00`).toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'});
    detail.innerHTML = `<h3>${label}</h3>${rows.length ? `<div class="availability-detail-list">${rows.map(row => `<div class="availability-person"><div><strong>${escapeHtml(row.leader_name)} 리더</strong><small>${escapeHtml(row.leader_position || '')}</small></div>${canManage(state.scope) ? `<select data-user-id="${row.leader_id}" data-date="${date}"><option value="available" ${row.status==='available'?'selected':''}>가능</option><option value="possible" ${row.status==='possible'?'selected':''}>조율 가능</option><option value="unavailable" ${row.status==='unavailable'?'selected':''}>어려움</option></select>` : `<strong>${statusLabel(row.status)}</strong>`}</div>`).join('')}</div>` : '<div class="empty-state">이 달에 제출한 리더가 없습니다.</div>'}`;
    detail.querySelectorAll('select[data-user-id]').forEach(select => select.addEventListener('change', async () => {
      select.disabled = true;
      const { error: updateError } = await client.rpc('manager_set_availability_day_v1', { p_target_user_id:select.dataset.userId, p_scope:state.scope, p_available_date:select.dataset.date, p_status:select.value });
      select.disabled = false;
      if (updateError) return show(updateError.message,'error');
      show('일정 확인을 수정했습니다.','success');
      await loadMonth();
      await loadDetails(date);
    }));
  }

  function renderConfirmedSchedules() {
    if (!state.confirmed.length) {
      confirmedList.innerHTML = '<div class="empty-state">선택한 달에 확정된 일정이 없습니다.</div>';
      return;
    }
    confirmedList.innerHTML = state.confirmed.map(item => {
      const date = new Date(`${item.event_date}T00:00:00`);
      const time = [item.start_time ? String(item.start_time).slice(0,5) : '', item.end_time ? `~ ${String(item.end_time).slice(0,5)}` : ''].filter(Boolean).join(' ');
      return `<article class="confirmed-schedule-card" data-schedule-id="${item.id}"><div class="confirmed-date"><strong>${date.getDate()}</strong><span>${date.toLocaleDateString('ko-KR',{weekday:'short'})}</span></div><div><h3>${escapeHtml(item.title)}</h3><p>${[time,item.location].filter(Boolean).map(escapeHtml).join(' · ') || '시간과 장소는 추후 안내'}</p>${item.note ? `<p>${escapeHtml(item.note)}</p>` : ''}<span class="scope-badge">${scopeLabel(item.scope)} · ${item.visibility==='public'?'홈페이지 공개':'리더 공개'}</span></div>${item.can_manage ? `<div class="action-group"><button type="button" class="action-btn" data-edit-schedule>수정</button><button type="button" class="action-btn reject" data-delete-schedule>삭제</button></div>` : ''}</article>`;
    }).join('');
    confirmedList.querySelectorAll('[data-edit-schedule]').forEach(button => button.addEventListener('click', () => editConfirmed(button.closest('[data-schedule-id]').dataset.scheduleId)));
    confirmedList.querySelectorAll('[data-delete-schedule]').forEach(button => button.addEventListener('click', () => deleteConfirmed(button.closest('[data-schedule-id]').dataset.scheduleId)));
  }

  function openConfirmedForm(item = null) {
    state.editingScheduleId = item?.id || null;
    confirmedForm.hidden = false;
    toggleConfirmedForm.hidden = true;
    if (item) {
      confirmedForm.elements.scope.value = item.scope;
      confirmedForm.elements.event_date.value = item.event_date;
      confirmedForm.elements.visibility.value = item.visibility;
      confirmedForm.elements.start_time.value = item.start_time ? String(item.start_time).slice(0,5) : '';
      confirmedForm.elements.end_time.value = item.end_time ? String(item.end_time).slice(0,5) : '';
      confirmedForm.elements.title.value = item.title || '';
      confirmedForm.elements.location.value = item.location || '';
      confirmedForm.elements.note.value = item.note || '';
    } else {
      confirmedForm.reset();
      const preferred = canManage(state.scope) ? state.scope : [...confirmedForm.elements.scope.options].find(option => !option.disabled)?.value;
      if (preferred) confirmedForm.elements.scope.value = preferred;
    }
    confirmedForm.scrollIntoView({ behavior:'smooth', block:'center' });
  }

  function closeConfirmedForm() {
    state.editingScheduleId = null;
    confirmedForm.reset();
    confirmedForm.hidden = true;
    toggleConfirmedForm.hidden = ![...confirmedForm.elements.scope.options].some(option => !option.disabled);
  }

  async function saveConfirmedSchedule(event) {
    event.preventDefault();
    const formData = new FormData(confirmedForm);
    const submit = confirmedForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    const base = {
      p_event_date:String(formData.get('event_date')),
      p_start_time:String(formData.get('start_time')||'') || null,
      p_end_time:String(formData.get('end_time')||'') || null,
      p_title:String(formData.get('title')||''),
      p_location:String(formData.get('location')||''),
      p_note:String(formData.get('note')||''),
      p_visibility:String(formData.get('visibility')||'internal')
    };
    const request = state.editingScheduleId
      ? client.rpc('manager_update_confirmed_schedule_v1', { p_schedule_id:state.editingScheduleId, ...base })
      : client.rpc('manager_create_confirmed_schedule_v1', { p_scope:String(formData.get('scope')), ...base });
    const { error } = await request;
    submit.disabled = false;
    if (error) return show(error.message,'error');
    show(state.editingScheduleId ? '확정 일정을 수정했습니다.' : '확정 일정을 등록했습니다.','success');
    closeConfirmedForm();
    await loadMonth();
  }

  function editConfirmed(id) {
    const item = state.confirmed.find(schedule => schedule.id === id);
    if (item) openConfirmedForm(item);
  }

  async function deleteConfirmed(id) {
    if (!confirm('이 확정 일정을 삭제하시겠습니까?')) return;
    const { error } = await client.rpc('manager_delete_confirmed_schedule_v1', { p_schedule_id:id });
    if (error) return show(error.message,'error');
    show('확정 일정을 삭제했습니다.','success');
    await loadMonth();
  }
})();
