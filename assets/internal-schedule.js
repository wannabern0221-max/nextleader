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
  const myUnavailableList = document.querySelector('#myUnavailableList');
  const availabilitySelectionSummary = document.querySelector('#availabilitySelectionSummary');
  const help = document.querySelector('#availabilityHelp');
  const message = document.querySelector('#availabilityMessage');
  const managerSummary = document.querySelector('#managerSummary');
  const recommendList = document.querySelector('#recommendList');
  const detail = document.querySelector('#availabilityDetail');
  const confirmedList = document.querySelector('#confirmedScheduleList');
  const toggleConfirmedForm = document.querySelector('#toggleConfirmedForm');
  const confirmedForm = document.querySelector('#confirmedScheduleForm');
  const cancelConfirmedForm = document.querySelector('#cancelConfirmedForm');
  const reasonSheet = document.querySelector('#reasonSheet');
  const reasonSheetDate = document.querySelector('#reasonSheetDate');
  const reasonDetail = document.querySelector('#reasonDetail');
  const reasonOptions = document.querySelector('#reasonOptions');
  const saveReason = document.querySelector('#saveReason');
  const removeReason = document.querySelector('#removeReason');

  const state = {
    access: null,
    context: null,
    month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    scope: 'policy_office',
    submitted: false,
    selections: new Map(),
    persisted: new Set(),
    summary: [],
    confirmed: [],
    editingScheduleId: null,
    reasonTarget: null,
    reasonCode: 'personal',
    managerEditTarget: null
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const pad = value => String(value).padStart(2, '0');
  const monthStart = () => `${state.month.getFullYear()}-${pad(state.month.getMonth()+1)}-01`;
  const monthEnd = () => `${state.month.getFullYear()}-${pad(state.month.getMonth()+1)}-${pad(new Date(state.month.getFullYear(), state.month.getMonth()+1, 0).getDate())}`;
  const scopeLabel = scope => ({policy_office:'정책국',div1:'정책1부',div2:'정책2부'}[scope] || scope);
  const visibilityLabel = value => ({public:'전체 공개',internal:'리더 공개',executive:'임원 공개'}[value] || value);
  const reasonLabel = code => ({personal:'개인 일정',class:'수업',clinical:'실습',work:'근무',exam:'시험',family:'가족 일정',health:'건강 사유',other:'기타'}[code] || '개인 일정');
  const show = (text, type='info') => { message.className = `auth-message show ${type}`; message.textContent = text; };
  const canView = scope => Boolean(state.context?.[`can_view_${scope}`]);
  const canManage = scope => Boolean(state.context?.[`can_manage_${scope}`]);
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
    if (['policy_office','div1','div2'].includes(own)) state.scope = own;
    else if (context?.can_view_policy_office) state.scope = 'policy_office';
    else if (context?.can_view_div1) state.scope = 'div1';
    else if (context?.can_view_div2) state.scope = 'div2';

    setupScopeButtons();
    setupScheduleForm();
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
    reasonOptions.addEventListener('click', event => {
      const button=event.target.closest('[data-reason]');
      if(!button)return;
      state.reasonCode=button.dataset.reason;
      reasonOptions.querySelectorAll('[data-reason]').forEach(item=>item.classList.toggle('active',item===button));
    });
    reasonSheet.querySelectorAll('[data-close-reason]').forEach(button=>button.addEventListener('click',closeReasonSheet));
    saveReason.addEventListener('click',saveReasonSelection);
    removeReason.addEventListener('click',removeReasonSelection);
  }

  async function loadMonth() {
    monthTitle.textContent = `${state.month.getFullYear()}년 ${state.month.getMonth()+1}월`;
    state.selections = new Map();
    state.persisted = new Set();
    state.submitted = false;
    state.summary = [];
    help.textContent = '참여가 불가한 날짜를 누르고 사유를 선택해 주세요. 기존 불가일은 유지되며 새로운 날짜를 추가할 수 있습니다.';
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
    (ownData.selections || []).forEach(item => {
      const date=String(item.date);
      state.selections.set(date,{reason_code:item.reason_code || 'personal',reason_label:item.reason_label || reasonLabel(item.reason_code),reason_detail:item.reason_detail || ''});
      state.persisted.add(date);
    });
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
    availabilitySelectionSummary.hidden=!own;
    myUnavailableList.hidden=!own;
    if (!own) {
      submissionState.className = 'submission-state';
      submissionState.textContent = canView(state.scope) ? `${scopeLabel(state.scope)} 참여 현황 조회 화면입니다.` : (state.context?.scope_message || '소속 확인이 필요합니다.');
      submitButton.hidden = true;
      return;
    }
    submitButton.hidden = false;
    if (state.submitted) {
      const submittedAt = ownData.submitted_at ? new Date(ownData.submitted_at).toLocaleString('ko-KR') : '';
      submissionState.className = 'submission-state locked';
      submissionState.textContent = `기존 제출 완료${submittedAt ? ` · ${submittedAt}` : ''}. 새로운 불가일은 추가할 수 있으며 기존 불가일 삭제는 소속 수석부장이나 정책총괄부장에게 요청해 주세요.`;
      submitButton.textContent = '추가 불가일 제출';
      help.textContent = '새롭게 불가해진 날짜를 눌러 추가할 수 있습니다. 이미 제출한 날짜는 본인이 삭제할 수 없습니다.';
    } else {
      submissionState.className = 'submission-state';
      submissionState.textContent = '아직 이 달의 불가일을 제출하지 않았습니다.';
      submitButton.textContent = '불가일 제출';
    }
    submitButton.disabled = true;
  }

  function renderCalendar() {
    const year=state.month.getFullYear(),month=state.month.getMonth();
    const firstDay=new Date(year,month,1).getDay(),daysInMonth=new Date(year,month+1,0).getDate();
    const summaryByDate=new Map(state.summary.map(row=>[String(row.schedule_date),row]));
    const cells=[];
    for(let i=0;i<firstDay;i++)cells.push('<span class="availability-day blank" aria-hidden="true"></span>');
    for(let day=1;day<=daysInMonth;day++){
      const date=`${year}-${pad(month+1)}-${pad(day)}`;
      const selection=state.selections.get(date);
      const summary=summaryByDate.get(date);
      const managerCount=canManage(state.scope)&&Number(summary?.unavailable_count||0)>0?`<span class="manager-count">불가 ${summary.unavailable_count}명</span>`:'';
      const persisted=state.persisted.has(date);
      cells.push(`<button type="button" class="availability-day ${selection?'unavailable':''} ${persisted?'persisted':''}" data-date="${date}" aria-label="${day}일 ${selection?`불가 ${selection.reason_label}`:'선택 없음'}"><span class="day-number">${day}</span>${managerCount}${selection?`<span class="day-status">불가</span><small class="day-reason">${escapeHtml(selection.reason_label)}</small>`:''}</button>`);
    }
    calendar.innerHTML=`<div class="availability-weekdays">${['일','월','화','수','목','금','토'].map(d=>`<span>${d}</span>`).join('')}</div><div class="availability-days">${cells.join('')}</div>`;
    calendar.querySelectorAll('[data-date]').forEach(button=>button.addEventListener('click',()=>onDateClick(button.dataset.date)));
  }

  async function onDateClick(date) {
    if(isOwnScope(state.scope)){
      if(state.persisted.has(date)){show('이미 제출한 불가일입니다. 삭제가 필요하면 소속 수석부장이나 정책총괄부장에게 요청해 주세요.','warning');}
      else openReasonSheet(date);
    }
    if(canManage(state.scope))await loadDetails(date);
  }

  function openReasonSheet(date,managerEdit=null) {
    state.reasonTarget=date;
    state.managerEditTarget=managerEdit;
    const existing=managerEdit?.selection || state.selections.get(date) || {reason_code:'personal',reason_detail:''};
    state.reasonCode=existing.reason_code||'personal';
    reasonDetail.value=existing.reason_detail||'';
    reasonSheetDate.textContent=new Date(`${date}T00:00:00`).toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'});
    reasonOptions.querySelectorAll('[data-reason]').forEach(item=>item.classList.toggle('active',item.dataset.reason===state.reasonCode));
    removeReason.hidden=managerEdit ? managerEdit.status!=='unavailable' : (!state.selections.has(date) || state.persisted.has(date));
    removeReason.textContent=managerEdit?'불가일 삭제':'선택 해제';
    saveReason.textContent=managerEdit?'불가 사유 저장':'불가로 표시';
    reasonSheet.hidden=false;
    document.body.classList.add('reason-sheet-open');
  }

  function closeReasonSheet(){reasonSheet.hidden=true;state.reasonTarget=null;state.managerEditTarget=null;document.body.classList.remove('reason-sheet-open');}

  async function saveReasonSelection(){
    if(!state.reasonTarget)return;
    const payload={reason_code:state.reasonCode,reason_label:reasonLabel(state.reasonCode),reason_detail:reasonDetail.value.trim()};
    if(state.managerEditTarget){
      const target=state.managerEditTarget;
      saveReason.disabled=true;
      const {error}=await client.rpc('manager_set_unavailable_day_v3',{p_target_user_id:target.userId,p_scope:state.scope,p_schedule_date:state.reasonTarget,p_status:'unavailable',p_reason_code:payload.reason_code,p_reason_detail:payload.reason_detail||null});
      saveReason.disabled=false;
      if(error)return show(error.message,'error');
      closeReasonSheet();show('리더의 참여 불가 사유를 수정했습니다.','success');await loadMonth();await loadDetails(target.date);return;
    }
    state.selections.set(state.reasonTarget,payload);closeReasonSheet();renderCalendar();renderCounts();
  }

  async function removeReasonSelection(){
    if(!state.reasonTarget)return;
    if(state.managerEditTarget){
      const target=state.managerEditTarget;
      removeReason.disabled=true;
      const {error}=await client.rpc('manager_set_unavailable_day_v3',{p_target_user_id:target.userId,p_scope:state.scope,p_schedule_date:state.reasonTarget,p_status:'available',p_reason_code:'personal',p_reason_detail:null});
      removeReason.disabled=false;
      if(error)return show(error.message,'error');
      closeReasonSheet();show('리더의 상태를 가능한 날로 변경했습니다.','success');await loadMonth();await loadDetails(target.date);return;
    }
    if(state.persisted.has(state.reasonTarget)){closeReasonSheet();return show('기존에 제출한 불가일은 직접 삭제할 수 없습니다. 소속 수석부장이나 정책총괄부장에게 요청해 주세요.','warning');}
    state.selections.delete(state.reasonTarget);closeReasonSheet();renderCalendar();renderCounts();
  }

  function renderCounts() {
    const daysInMonth=new Date(state.month.getFullYear(),state.month.getMonth()+1,0).getDate();
    unavailableCount.textContent=state.selections.size;
    possibleDaysCount.textContent=Math.max(daysInMonth-state.selections.size,0);
    const items=[...state.selections.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
    myUnavailableList.innerHTML=items.length?items.map(([date,value])=>{const d=new Date(`${date}T00:00:00`);return `<div class="my-unavailable-item"><strong>${d.getMonth()+1}월 ${d.getDate()}일</strong><span>${escapeHtml(value.reason_label)}${state.persisted.has(date)?' · 제출됨':' · 추가 예정'}</span></div>`;}).join(''):'<div class="empty-state">등록한 불가일이 없습니다.</div>';
    const newCount=[...state.selections.keys()].filter(date=>!state.persisted.has(date)).length;
    submitButton.disabled=!isOwnScope(state.scope)||newCount===0;
  }

  async function submitUnavailableDays() {
    if(!isOwnScope(state.scope)){show(state.context?.scope_message||'본인 소속의 불가일만 제출할 수 있습니다.','warning');return;}
    const additions=[...state.selections.entries()].filter(([date])=>!state.persisted.has(date));
    if(!additions.length)return show('새로 추가할 불가일을 선택해 주세요.','warning');
    if(!confirm(`${state.month.getFullYear()}년 ${state.month.getMonth()+1}월 불가일 ${additions.length}개를 추가 제출하시겠습니까?

기존에 제출한 불가일은 유지됩니다.`))return;
    submitButton.disabled=true;
    const selections=additions.map(([date,value])=>({date,reason_code:value.reason_code,reason_detail:value.reason_detail||null}));
    const{error}=await client.rpc('submit_unavailable_month_v2',{p_scope:state.scope,p_month_start:monthStart(),p_selections:selections});
    if(error){submitButton.disabled=false;return show(error.message,'error');}
    show('불가일을 추가했습니다. 삭제가 필요하면 소속 수석부장이나 정책총괄부장에게 요청해 주세요.','success');
    await loadMonth();
  }

  function renderManagerSummary() {
    managerSummary.hidden=!canManage(state.scope);
    if(!canManage(state.scope))return;
    const rows=[...state.summary].filter(row=>Number(row.unavailable_count||0)>0).sort((a,b)=>String(a.schedule_date).localeCompare(String(b.schedule_date)));
    if(!rows.length){recommendList.innerHTML='<div class="empty-state">이 달에 등록된 불가일이 없습니다.</div>';detail.innerHTML='';return;}
    recommendList.innerHTML=rows.map(row=>{const d=new Date(`${row.schedule_date}T00:00:00`);return `<button type="button" class="recommend-item" data-detail-date="${row.schedule_date}"><strong>${d.getMonth()+1}/${d.getDate()}</strong><span>불가를 선택한 리더</span><b>${row.unavailable_count}명</b></button>`;}).join('');
    recommendList.querySelectorAll('[data-detail-date]').forEach(button=>button.addEventListener('click',()=>loadDetails(button.dataset.detailDate)));
  }

  async function loadDetails(date) {
    detail.innerHTML = '<div class="loading-state">불가일 등록 리더를 불러오고 있습니다.</div>';
    const { data, error } = await client.rpc('list_unavailable_details_v2', { p_scope:state.scope, p_schedule_date:date });
    if (error) { detail.innerHTML = `<div class="auth-message show error">${escapeHtml(error.message)}</div>`; return; }
    const rows = data || [];
    const label = new Date(`${date}T00:00:00`).toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'});
    detail.innerHTML = `<h3>${label}</h3>${rows.length ? `<div class="availability-detail-list">${rows.map(row => {
      const position=row.leader_position_title||'리더';
      return `<div class="availability-person is-unavailable"><div><strong>${escapeHtml(row.leader_name)} ${escapeHtml(position)}</strong><small>${escapeHtml(row.reason_label||'개인 일정')}${row.reason_detail?` · ${escapeHtml(row.reason_detail)}`:''}</small></div><div class="availability-person-actions"><button type="button" data-manage-unavailable data-user-id="${row.leader_id}" data-date="${date}" data-status="unavailable" data-reason="${escapeHtml(row.reason_code||'personal')}" data-reason-detail="${escapeHtml(encodeURIComponent(row.reason_detail||''))}">사유 수정</button><button type="button" data-manage-available data-user-id="${row.leader_id}" data-date="${date}">불가일 삭제</button></div></div>`;
    }).join('')}</div>` : '<div class="empty-state">이 달에 제출한 리더가 없습니다.</div>'}`;
    detail.querySelectorAll('[data-manage-unavailable]').forEach(button=>button.addEventListener('click',()=>openReasonSheet(date,{userId:button.dataset.userId,date,status:button.dataset.status,selection:{reason_code:button.dataset.reason,reason_detail:decodeURIComponent(button.dataset.reasonDetail||'')}})));
    detail.querySelectorAll('[data-manage-available]').forEach(button=>button.addEventListener('click',async()=>{
      if(!confirm('이 리더의 해당 불가일을 삭제할까요?'))return;
      const {error:updateError}=await client.rpc('manager_set_unavailable_day_v3',{p_target_user_id:button.dataset.userId,p_scope:state.scope,p_schedule_date:date,p_status:'available',p_reason_code:'personal',p_reason_detail:null});
      if(updateError)return show(updateError.message,'error');show('불가일을 삭제했습니다.','success');await loadMonth();await loadDetails(date);
    }));
  }

  function renderSchedules() {
    if (!state.confirmed.length) { confirmedList.innerHTML = '<div class="empty-state">선택한 달에 등록된 정책국 일정이 없습니다.</div>'; return; }
    confirmedList.innerHTML = state.confirmed.map(item => {
      const date = new Date(`${item.event_date}T00:00:00`);
      const time = [item.start_time ? String(item.start_time).slice(0,5) : '', item.end_time ? `~ ${String(item.end_time).slice(0,5)}` : ''].filter(Boolean).join(' ');
      const registrant = item.created_by_name && item.can_manage ? `<small class="schedule-registrant">등록: ${escapeHtml(item.created_by_name)}</small>` : '';
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
      if (['policy_office','div1','div2'].includes(state.context?.own_scope)) confirmedForm.elements.scope.value = state.context.own_scope;
      confirmedForm.querySelector('[data-form-guide]').textContent = '모든 승인된 리더가 일정을 등록할 수 있습니다. 등록 후 직접 수정하거나 삭제할 수 없으며 변경이 필요하면 소속 수석부장이나 정책총괄부장에게 요청해 주세요.';
    }
    confirmedForm.scrollIntoView({ behavior:'smooth', block:'center' });
  }

  function closeScheduleForm() { state.editingScheduleId = null; confirmedForm.reset(); confirmedForm.hidden = true; toggleConfirmedForm.hidden = !state.context?.can_create_schedule; }

  async function saveSchedule(event) {
    event.preventDefault();
    const formData = new FormData(confirmedForm);
    const submit = confirmedForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    const base = {p_event_date:String(formData.get('event_date')),p_start_time:String(formData.get('start_time')||'') || null,p_end_time:String(formData.get('end_time')||'') || null,p_title:String(formData.get('title')||''),p_location:String(formData.get('location')||''),p_note:String(formData.get('note')||''),p_visibility:String(formData.get('visibility')||'internal')};
    const request = state.editingScheduleId ? client.rpc('manager_update_policy_schedule_v2', { p_schedule_id:state.editingScheduleId, ...base }) : client.rpc('create_policy_schedule_v2', { p_scope:String(formData.get('scope')), ...base });
    const { error } = await request;
    submit.disabled = false;
    if (error) return show(error.message,'error');
    show(state.editingScheduleId ? '정책국 일정을 수정했습니다.' : '정책국 일정을 등록했습니다. 수정 또는 삭제가 필요하면 소속 수석부장이나 정책총괄부장에게 요청해 주세요.','success');
    closeScheduleForm();
    await loadMonth();
  }

  function editSchedule(id) { const item = state.confirmed.find(schedule => schedule.id === id); if (item) openScheduleForm(item); }
  async function deleteSchedule(id) { if (!confirm('이 정책국 일정을 삭제하시겠습니까?')) return; const { error } = await client.rpc('manager_delete_policy_schedule_v2', { p_schedule_id:id }); if (error) return show(error.message,'error'); show('정책국 일정을 삭제했습니다.','success'); await loadMonth(); }
})();
