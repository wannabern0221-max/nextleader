(async () => {
  const client=window.knaSupabase;
  const calendar=document.querySelector('#leaderCalendar');
  const list=document.querySelector('#scheduleList');
  const form=document.querySelector('#scheduleForm');
  const monthInput=document.querySelector('#scheduleMonth');
  const scopeFilter=document.querySelector('#scheduleScopeFilter');
  const message=document.querySelector('#scheduleMessage');
  let access, events=[];

  const show=(text,type='info')=>{message.className=`auth-message show ${type}`;message.textContent=text;};
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const scopeLabel=scope=>({policy_office:'정책국 공통',div1:'정책1부',div2:'정책2부'}[scope]||scope);
  const pad=n=>String(n).padStart(2,'0');
  const current=new Date(); monthInput.value=`${current.getFullYear()}-${pad(current.getMonth()+1)}`;

  if(!window.SUPABASE_CONFIG_READY||!client)return show('리더 서비스 연결 설정을 확인해 주세요.','error');
  try{const{data:s}=await client.auth.getSession();if(!s.session)return location.replace('login.html');const{data,error}=await client.rpc('get_my_access');if(error)throw error;access=data;if(access?.approval_status!=='approved')return location.replace('dashboard.html');setDefaultScope();await load();}catch(error){show(error.message||'일정을 불러오지 못했습니다.','error');}

  function setDefaultScope(){const dep=window.KNA_ACCESS.labels.department(access.department);const value=dep==='정책1부'?'div1':dep==='정책2부'?'div2':'policy_office';form.scope.value=value;scopeFilter.value='all';}
  monthInput.addEventListener('change',load);scopeFilter.addEventListener('change',render);
  form.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(form);const submit=form.querySelector('button[type="submit"]');submit.disabled=true;const payload={p_scope:String(fd.get('scope')),p_event_date:String(fd.get('event_date')),p_start_time:String(fd.get('start_time')||'')||null,p_end_time:String(fd.get('end_time')||'')||null,p_title:String(fd.get('title')||''),p_location:String(fd.get('location')||''),p_note:String(fd.get('note')||'')};const{error}=await client.rpc('create_leader_schedule',payload);submit.disabled=false;if(error)return show(error.message,'error');form.reset();setDefaultScope();show('일정을 등록했습니다. 등록 후에는 일정 관리 권한자만 수정하거나 삭제할 수 있습니다.','success');await load();});

  async function load(){const[y,m]=monthInput.value.split('-').map(Number);const start=`${y}-${pad(m)}-01`;const endDate=new Date(y,m,0);const end=`${y}-${pad(m)}-${pad(endDate.getDate())}`;const{data,error}=await client.rpc('list_leader_schedules',{p_start_date:start,p_end_date:end});if(error)return show(error.message,'error');events=data||[];render();}
  function render(){const filter=scopeFilter.value;const shown=filter==='all'?events:events.filter(e=>e.scope===filter);renderCalendar(shown);renderList(shown);}
  function renderCalendar(rows){const[y,m]=monthInput.value.split('-').map(Number);const first=new Date(y,m-1,1);const days=new Date(y,m,0).getDate();const start=first.getDay();const cells=[];for(let i=0;i<start;i++)cells.push('<div class="calendar-day muted"></div>');for(let d=1;d<=days;d++){const date=`${y}-${pad(m)}-${pad(d)}`;const dayEvents=rows.filter(e=>e.event_date===date);cells.push(`<div class="calendar-day"><strong>${d}</strong>${dayEvents.map(e=>`<span class="calendar-event scope-${e.scope}" title="${escapeHtml(e.title)}">${escapeHtml(e.title)}</span>`).join('')}</div>`);}calendar.innerHTML=`<div class="calendar-weekdays">${['일','월','화','수','목','금','토'].map(x=>`<span>${x}</span>`).join('')}</div><div class="calendar-days">${cells.join('')}</div>`;}
  function renderList(rows){if(!rows.length){list.innerHTML='<div class="empty-state">선택한 달의 일정이 없습니다.</div>';return;}list.innerHTML=rows.map(e=>`<article class="schedule-entry" data-id="${e.id}"><div class="schedule-date-box"><strong>${String(e.event_date).slice(5)}</strong><span>${scopeLabel(e.scope)}</span></div><div><h3>${escapeHtml(e.title)}</h3><p>${[e.start_time?String(e.start_time).slice(0,5):'',e.end_time?`~ ${String(e.end_time).slice(0,5)}`:'',e.location||''].filter(Boolean).join(' · ')}</p>${e.note?`<small>${escapeHtml(e.note)}</small>`:''}<small>등록: ${escapeHtml(e.creator_name)} 리더${e.creator_position?` · ${escapeHtml(e.creator_position)}`:''}</small></div>${e.can_manage?'<div class="action-group"><button class="action-btn" data-edit>수정</button><button class="action-btn reject" data-delete>삭제</button></div>':''}</article>`).join('');list.querySelectorAll('[data-delete]').forEach(btn=>btn.addEventListener('click',()=>remove(btn.closest('.schedule-entry'))));list.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',()=>edit(btn.closest('.schedule-entry'))));}
  async function remove(article){if(!confirm('이 일정을 삭제하시겠습니까?'))return;const{error}=await client.rpc('delete_leader_schedule',{p_schedule_id:article.dataset.id});if(error)return show(error.message,'error');show('일정을 삭제했습니다.','success');await load();}
  async function edit(article){const e=events.find(x=>x.id===article.dataset.id);if(!e)return;const title=prompt('일정 제목',e.title);if(title===null)return;const location=prompt('장소',e.location||'');if(location===null)return;const note=prompt('설명',e.note||'');if(note===null)return;const{error}=await client.rpc('update_leader_schedule',{p_schedule_id:e.id,p_event_date:e.event_date,p_start_time:e.start_time,p_end_time:e.end_time,p_title:title,p_location:location,p_note:note});if(error)return show(error.message,'error');show('일정을 수정했습니다.','success');await load();}
})();
