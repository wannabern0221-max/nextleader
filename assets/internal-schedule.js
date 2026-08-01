(async () => {
  const client = window.knaSupabase;
  const calendar = document.querySelector('#availabilityCalendar');
  const monthTitle = document.querySelector('#availabilityMonthTitle');
  const previousMonth = document.querySelector('#previousMonth');
  const nextMonth = document.querySelector('#nextMonth');
  const scopeSwitch = document.querySelector('#availabilityScopeSwitch');
  const submitButton = document.querySelector('#submitAvailability');
  const submissionState = document.querySelector('#availabilitySubmissionState');
  const unavailableCount = document.querySelector('#unavailableCount');
  const possibleDaysCount = document.querySelector('#possibleDaysCount');
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
    selections: new Set(),
    summary: [],
    confirmed: [],
    editingScheduleId: null
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const pad = value => String(value).padStart(2, '0');
  const monthStart = () => `${state.month.getFullYear()}-${pad(state.month.getMonth()+1)}-01`;
  const monthEnd = () => `${state.month.getFullYear()}-${pad(state.month.getMonth()+1)}-${pad(new Date(state.month.getFullYear(), state.month.getMonth()+1, 0).getDate())}`;
  const scopeLabel = scope => ({policy_office:'정책국 공통',div1:'정책1부',div2:'정책2부'}[scope] || scope);
  const visibilityLabel = value => ({public:'전체 공개',internal:'리더 공개',executive:'임원 공개'}[value] || value);
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
      client.rpc('get_schedule_context_v2')
    ]);
    if (accessError) throw accessError;
    if (contextError) throw contextError;
    state.access = access;
    state.context = context;
    if (access?.approval_status !== 'approved') return location.replace('dashboard.html');

    const own = context?.own_scope;
    if (own === 'div1' || own === 'div2') state.scope = own;
    else if (context?.can_view_div1) state.scope = 'div1';
    else if (context?.can_view_div2) state.scope = 'div2';

    setupScopeButtons();
    setupScheduleForm();
    if (!context?.can_submit && !context?.can_view_div1 && !context?.can_view_div2) {
      show(context?.scope_message || '정책1부 또는 정책2부 소속이 확인되지 않아 불가능한 날짜를 제출할 수 없습니다.', 'warning');
    }
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

  function setupScheduleForm() {
    const canCreate = Boolean(state.context?.can_create_schedule);
    toggleConfirmedForm.hidden = !canCreate;
    [...confirmedForm.elements.scope.options].forEach(option => option.disabled = !canCreate);
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
    submitButton.addEventListener('click', submitUnavailableDays);
    toggleConfirmedForm.addEventListener('click', () => openScheduleForm());
    cancelConfirmedForm.addEventListener('click', closeScheduleForm);
    confirmedForm.addEventListener('submit', saveSchedule);
  }

  async function loadMonth() {
    monthTitle.textContent = `${state.month.getFullYear()}년 ${state.month.getMonth()+1}월`;
    state.selections = new Set();
    state.submitted = false;
    state.summary = [];
    help.textContent = '참여하기 어려운 날짜만 눌러 표시해 주세요. 선택하지 않은 날짜는 가능한 날로 집계됩니다.';
    submitButton.disabled = true;

    const ownPromise = isOwnScope(state.scope)
      ? client.rpc('get_my_unavailable_month_v2', { p_scope: state.scope, p_month_start: monthStart() })
      : Promise.resolve({ data: { submitted:false, selections:[] }, error:null });
    const summaryPromise = canView(state.scope)
      ? client.rpc('list_unavailable_summary_v2', { p_scope: state.scope, p_month_start: monthStart() })
      : Promise.resolve({ data: [], error:null });
    const schedulePromise = client.rpc('list_policy_schedules_v2', { p_start_date: monthStart(), p_end_date: monthEnd() });

    const [ownResult, summaryResult, scheduleResult] = await Promise.all([ownPromise, summaryPromise, schedulePromise]);
    if (ownResult.error) throw ownResult.error;
    if (summaryResult.error) throw summaryResult.error;
    if (scheduleResult.error) throw scheduleResult.error;

    const ownData = ownResult.data || { submitted:false, selections:[] };
    state.submitted = Boolean(ownData.submitted);
    (ownData.selections || []).forEach(item => state.selections.add(String(item.date)));
    state.summary = summaryResult.data || [];
    state.confirmed = scheduleResult.data || [];

    renderSubmissionState(ownData);
    renderCalendar();
    renderCounts();
    renderManagerSummary();
    renderSchedules();
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
      submissionState.textContent = `제출 완료${submittedAt ? ` · ${submittedAt}` : ''}. 변경이 필요하면 소속 수석부장이나 정책총괄부장에게 요청해 주세요.`;
      submitButton.disabled = true;
      submitButton.textContent = '제출 완료';
      help.textContent = '제출이 완료되어 달력이 잠겼습니다. 선택된 날짜가 참여 불가능한 날입니다.';
    } else {
      submissionState.className = 'submission-state';
      submissionState.textContent = '아직 이 달의 불가능한 날짜를 제출하지 않았습니다.';
      submitButton.disabled = false;
      submitButton.textContent = '불가능한 날짜 제출';
    }
  }

  function renderCalendar() {
    const year = state.month.getFullYear();
    const month = state.month.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const summaryByDate = new Map(state.summary.map(row => [String(row.schedule_date), row]));
    const maxAvailable = Math.max(0, ...state.summary.map(row => Number(row.available_count || 0)));
    const cells = [];

    for (let index=0; index<firstDay; index++) cells.push('<span class="availability-day blank" aria-hidden="true"></span>');
    for (let day=1; day<=daysInMonth; day++) {
      const date = `${year}-${pad(month+1)}-${pad(day)}`;
      const selected = state.selections.has(date);
      const summary = summaryByDate.get(date);
      const recommended = canView(state.scope) && maxAvailable > 0 && Number(summary?.available_count || 0) === maxAvailable;
      const locked = state.submitted || !isOwnScope(state.scope);
      const counts = summary && canView(state.scope)
        ? `<span class="manager-count">가능 ${summary.available_count} · 불가 ${summary.unavailable_count}<br>제출 ${summary.submission_count}명</span>`
        : '';
      cells.push(`<button type="button" class="availability-day ${selected ? 'unavailable' : ''} ${locked ? 'locked' : ''} ${recommended ? 'recommended' : ''}" data-date="${date}" aria-label="${day}일 ${selected ? '참여 불가능' : '가능'}"><span class="day-number">${day}</span>${counts}${selected ? '<span class="day-status">불가능</span>' : ''}</button>`);
    }

    calendar.innerHTML = `<div class="availability-weekdays">${['일','월','화','수','목','금','토'].map(day => `<span>${day}</span>`).join('')}</div><div class="availability-days">${cells.join('')}</div>`;
    calendar.querySelectorAll('[data-date]').forEach(button => button.addEventListener('click', () => onDateClick(button.dataset.date)));
  }

  async function onDateClick(date) {
    if (isOwnScope(state.scope) && !state.submitted) {
      if (state.selections.has(date)) state.selections.delete(date);
      else state.selections.add(date);
      renderCalendar();
      renderCounts();
      return;
    }
    if (canView(state.scope)) await loadDetails(date);
  }

  function renderCounts() {
    const daysInMonth = new Date(state.month.getFullYear(), state.month.getMonth()+1, 0).getDate();
    unavailableCount.textContent = state.selections.size;
    possibleDaysCount.textContent = Math.max(daysInMonth - state.selections.size, 0);
  }

  async function submitUnavailableDays() {
    if (state.submitted || !isOwnScope(state.scope)) {
      show(state.context?.scope_message || '본인 소속 부서의 일정 응답만 제출할 수 있습니다.', 'warning');
      return;
    }
    const count = state.selections.size;
    if (!confirm(`${state.month.getFullYear()}년 ${state.month.getMonth()+1}월 참여 불가능 날짜 ${count}개를 제출하시겠습니까?\n\n선택하지 않은 날짜는 가능한 날로 집계됩니다. 제출 후 본인이 직접 수정하거나 삭제할 수 없습니다.`)) return;
    submitButton.disabled = true;
    const selections = [...state.selections].map(date => ({ date }));
    const { error } = await client.rpc('submit_unavailable_month_v2', { p_scope:state.scope, p_month_start:monthStart(), p_selections:selections });
    if (error) {
      submitButton.disabled = false;
      return show(error.message, 'error');
    }
    show('불가능한 날짜를 제출했습니다. 수정 또는 삭제가 필요하면 소속 수석부장이나 정책총괄부장에게 요청해 주세요.', 'success');
    await loadMonth();
  }

  function renderManagerSummary() {
    managerSummary.hidden = !canView(state.scope);
    if (!canView(state.scope)) return;
    const ranked = [...state.summary]
      .filter(row => Number(row.submission_count || 0) > 0)
      .sort((a,b) => Number(b.available_count || 0) - Number(a.available_count || 0))
      .slice(0,7);
    if (!ranked.length) {
      recommendList.innerHTML = '<div class="empty-state">아직 제출한 리더가 없습니다.</div>';
      return;
    }
    recommendList.innerHTML = ranked.map(row => {
      const date = new Date(`${row.schedule_date}T00:00:00`);
      return `<button type="button" class="recommend-item" data-detail-date="${row.schedule_date}"><strong>${date.getMonth()+1}/${date.getDate()}</strong><span>가능 ${row.available_count}명 · 불가 ${row.unavailable_count}명</span><b>${row.submission_count}명 제출</b></button>`;
    }).join('');
    recommendList.querySelectorAll('[data-detail-date]').forEach(button => button.addEventListener('click', () => loadDetails(button.dataset.detailDate)));
  }

  async function loadDetails(date) {
    detail.innerHTML = '<div class="loading-state">리더별 일정 응답을 불러오고 있습니다.</div>';
    const { data, error } = await client.rpc('list_unavailable_details_v2', { p_scope:state.scope, p_schedule_date:date });
    if (error) { detail.innerHTML = `<div class="auth-message show error">${escapeHtml(error.message)}</div>`; return; }
    const rows = data || [];
    const label = new Date(`${date}T00:00:00`).toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'});
    detail.innerHTML = `<h3>${label}</h3>${rows.length ? `<div class="availability-detail-list">${rows.map(row => `<div class="availability-person"><div><strong>${escapeHtml(row.leader_name)} 리더</strong><small>${escapeHtml(row.leader_position || '')}</small></div>${canManage(state.scope) ? `<select data-user-id="${row.leader_id}" data-date="${date}"><option value="available" ${row.status==='available'?'selected':''}>가능</option><option value="unavailable" ${row.status==='unavailable'?'selected':''}>불가능</option></select>` : `<strong>${row.status==='unavailable'?'불가능':'가능'}</strong>`}</div>`).join('')}</div>` : '<div class="empty-state">이 달에 제출한 리더가 없습니다.</div>'}`;
    detail.querySelectorAll('select[data-user-id]').forEach(select => select.addEventListener('change', async () => {
      select.disabled = true;
      const { error: updateError } = await client.rpc('manager_set_unavailable_day_v2', { p_target_user_id:select.dataset.userId, p_scope:state.scope, p_schedule_date:select.dataset.date, p_status:select.value });
      select.disabled = false;
      if (updateError) return show(updateError.message,'error');
      show('리더의 일정 상태를 수정했습니다.','success');
      await loadMonth();
      await loadDetails(date);
    }));
  }

  function renderSchedules() {
    if (!state.confirmed.length) {
      confirmedList.innerHTML = '<div class="empty-state">선택한 달에 등록된 정책국 일정이 없습니다.</div>';
      return;
    }
    confirmedList.innerHTML = state.confirmed.map(item => {
      const date = new Date(`${item.event_date}T00:00:00`);
      const time = [item.start_time ? String(item.start_time).slice(0,5) : '', item.end_time ? `~ ${String(item.end_time).slice(0,5)}` : ''].filter(Boolean).join(' ');
      const registrant = item.created_by_name && item.can_manage ? `<small class="schedule-registrant">등록: ${escapeHtml(item.created_by_name)} 리더</small>` : '';
      return `<article class="confirmed-schedule-card" data-schedule-id="${item.id}"><div class="confirmed-date"><strong>${date.getDate()}</strong><span>${date.toLocaleDateString('ko-KR',{weekday:'short'})}</span></div><div><h3>${escapeHtml(item.title)}</h3><p>${[time,item.location].filter(Boolean).map(escapeHtml).join(' · ') || '시간과 장소는 추후 안내'}</p>${item.note ? `<p>${escapeHtml(item.note)}</p>` : ''}<span class="scope-badge">${scopeLabel(item.scope)} · ${visibilityLabel(item.visibility)}</span>${registrant}</div>${item.can_manage ? `<div class="action-group"><button type="button" class="action-btn" data-edit-schedule>수정</button><button type="button" class="action-btn reject" data-delete-schedule>삭제</button></div>` : ''}</article>`;
    }).join('');
    confirmedList.querySelectorAll('[data-edit-schedule]').forEach(button => button.addEventListener('click', () => editSchedule(button.closest('[data-schedule-id]').dataset.scheduleId)));
    confirmedList.querySelectorAll('[data-delete-schedule]').forEach(button => button.addEventListener('click', () => deleteSchedule(button.closest('[data-schedule-id]').dataset.scheduleId)));
  }

  function openScheduleForm(item = null) {
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
      confirmedForm.querySelector('[data-form-guide]').textContent = '관리 권한으로 등록된 일정을 수정하고 있습니다.';
    } else {
      confirmedForm.reset();
      if (['div1','div2'].includes(state.context?.own_scope)) confirmedForm.elements.scope.value = state.context.own_scope;
      confirmedForm.querySelector('[data-form-guide]').textContent = '모든 승인된 리더가 일정을 등록할 수 있습니다. 등록 후 직접 수정하거나 삭제할 수 없으며 변경이 필요하면 소속 수석부장이나 정책총괄부장에게 요청해 주세요.';
    }
    confirmedForm.scrollIntoView({ behavior:'smooth', block:'center' });
  }

  function closeScheduleForm() {
    state.editingScheduleId = null;
    confirmedForm.reset();
    confirmedForm.hidden = true;
    toggleConfirmedForm.hidden = !state.context?.can_create_schedule;
  }

  async function saveSchedule(event) {
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
      ? client.rpc('manager_update_policy_schedule_v2', { p_schedule_id:state.editingScheduleId, ...base })
      : client.rpc('create_policy_schedule_v2', { p_scope:String(formData.get('scope')), ...base });
    const { error } = await request;
    submit.disabled = false;
    if (error) return show(error.message,'error');
    show(state.editingScheduleId ? '정책국 일정을 수정했습니다.' : '정책국 일정을 등록했습니다. 수정 또는 삭제가 필요하면 소속 수석부장이나 정책총괄부장에게 요청해 주세요.','success');
    closeScheduleForm();
    await loadMonth();
  }

  function editSchedule(id) {
    const item = state.confirmed.find(schedule => schedule.id === id);
    if (item) openScheduleForm(item);
  }

  async function deleteSchedule(id) {
    if (!confirm('이 정책국 일정을 삭제하시겠습니까?')) return;
    const { error } = await client.rpc('manager_delete_policy_schedule_v2', { p_schedule_id:id });
    if (error) return show(error.message,'error');
    show('정책국 일정을 삭제했습니다.','success');
    await loadMonth();
  }
})();
