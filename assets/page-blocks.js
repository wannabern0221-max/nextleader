(() => {
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[char]));

  const linkSafe = value => {
    const url = String(value || '').trim();
    if (!url) return '#';
    if (/^(https?:\/\/|mailto:|tel:|[./?#])/i.test(url)) return url;
    return '#';
  };

  const markdown = value => {
    const source = escapeHtml(value || '').replace(/\r\n?/g, '\n');
    const lines = source.split('\n');
    const output = [];
    let listOpen = false;
    const closeList = () => { if (listOpen) { output.push('</ul>'); listOpen = false; } };

    for (const raw of lines) {
      const line = raw.trimEnd();
      if (/^###\s+/.test(line)) { closeList(); output.push(`<h4>${inline(line.replace(/^###\s+/,''))}</h4>`); continue; }
      if (/^##\s+/.test(line)) { closeList(); output.push(`<h3>${inline(line.replace(/^##\s+/,''))}</h3>`); continue; }
      if (/^#\s+/.test(line)) { closeList(); output.push(`<h2>${inline(line.replace(/^#\s+/,''))}</h2>`); continue; }
      if (/^[-*]\s+/.test(line)) {
        if (!listOpen) { output.push('<ul>'); listOpen = true; }
        output.push(`<li>${inline(line.replace(/^[-*]\s+/,''))}</li>`);
        continue;
      }
      closeList();
      if (!line.trim()) output.push('<div class="managed-paragraph-gap"></div>');
      else output.push(`<p>${inline(line)}</p>`);
    }
    closeList();
    return output.join('');
  };

  function inline(value) {
    return String(value)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  const scopeLabel = scope => ({policy_office:'정책국',div1:'정책1부',div2:'정책2부'}[scope] || scope || '정책국');
  const pad = value => String(value).padStart(2,'0');
  const formatDate = value => {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'});
  };
  const formatTime = value => value ? String(value).slice(0,5) : '';
  const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

  const BLOCK_TYPES = Object.freeze({
    heading: '제목',
    text: '문구·본문',
    callout: '안내 상자',
    image: '이미지',
    button: '버튼',
    link_list: '링크 목록',
    cards: '카드 목록',
    faq: '자주 묻는 질문',
    notice_feed: '게시글 목록',
    schedule_calendar: '정책국 일정 달력',
    divider: '구분선',
    spacer: '여백'
  });

  const BLOCK_DEFAULTS = Object.freeze({
    heading: {title:'새 제목',subtitle:'',level:2,align:'left'},
    text: {body:'내용을 입력해 주세요.',align:'left'},
    callout: {title:'안내',body:'안내할 내용을 입력해 주세요.',tone:'blue'},
    image: {url:'',alt:'이미지',caption:'',fit:'cover',radius:'large',link:''},
    button: {label:'자세히 보기',url:'#',style:'primary',align:'left'},
    link_list: {title:'관련 링크',items:[{label:'링크 이름',url:'#',description:''}]},
    cards: {title:'주요 내용',columns:3,items:[{title:'카드 제목',body:'카드 내용을 입력해 주세요.',url:'#',image:''}]},
    faq: {title:'자주 묻는 질문',items:[{question:'질문을 입력해 주세요.',answer:'답변을 입력해 주세요.'}]},
    notice_feed: {title:'최신 게시글',category:'notice',limit:5,show_more:true},
    schedule_calendar: {title:'정책국 일정',description:'확정된 정책국 일정을 한눈에 확인하세요.',show_filters:true,upcoming_count:5,variant:'clean'},
    divider: {style:'solid'},
    spacer: {height:32}
  });

  const createBlock = type => ({
    id: uid('block'),
    type,
    visible: true,
    background: '#ffffff',
    padding: 'normal',
    ...JSON.parse(JSON.stringify(BLOCK_DEFAULTS[type] || BLOCK_DEFAULTS.text))
  });

  const blockShell = (block, inner, extraClass='') => {
    const background = /^#[0-9a-f]{6}$/i.test(block.background || '') ? block.background : '';
    const style = background ? ` style="--block-background:${escapeHtml(background)}"` : '';
    return `<section class="managed-block managed-block-${escapeHtml(block.type)} padding-${escapeHtml(block.padding || 'normal')} ${extraClass}" data-managed-block-id="${escapeHtml(block.id || '')}"${style}><div class="managed-block-inner">${inner}</div></section>`;
  };

  const renderStaticBlock = block => {
    if (!block || block.visible === false) return '';
    switch (block.type) {
      case 'heading': {
        const level = [2,3,4].includes(Number(block.level)) ? Number(block.level) : 2;
        return blockShell(block, `<div class="managed-heading align-${escapeHtml(block.align || 'left')}"><h${level}>${escapeHtml(block.title || '')}</h${level}>${block.subtitle ? `<p>${escapeHtml(block.subtitle)}</p>` : ''}</div>`);
      }
      case 'text':
        return blockShell(block, `<div class="managed-richtext align-${escapeHtml(block.align || 'left')}">${markdown(block.body || '')}</div>`);
      case 'callout':
        return blockShell(block, `<div class="managed-callout tone-${escapeHtml(block.tone || 'blue')}"><strong>${escapeHtml(block.title || '안내')}</strong><div>${markdown(block.body || '')}</div></div>`);
      case 'image': {
        if (!block.url) return blockShell(block, '<div class="managed-image-placeholder">이미지를 등록해 주세요.</div>');
        const image = `<img src="${escapeHtml(linkSafe(block.url))}" alt="${escapeHtml(block.alt || '')}" class="fit-${escapeHtml(block.fit || 'cover')} radius-${escapeHtml(block.radius || 'large')}">`;
        return blockShell(block, `<figure class="managed-image">${block.link ? `<a href="${escapeHtml(linkSafe(block.link))}">${image}</a>` : image}${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''}</figure>`);
      }
      case 'button':
        return blockShell(block, `<div class="managed-button-row align-${escapeHtml(block.align || 'left')}"><a class="managed-button style-${escapeHtml(block.style || 'primary')}" href="${escapeHtml(linkSafe(block.url))}">${escapeHtml(block.label || '자세히 보기')}</a></div>`);
      case 'link_list': {
        const items = Array.isArray(block.items) ? block.items : [];
        return blockShell(block, `<div class="managed-link-list">${block.title ? `<h2>${escapeHtml(block.title)}</h2>` : ''}<div>${items.map(item=>`<a href="${escapeHtml(linkSafe(item.url))}"><strong>${escapeHtml(item.label || '')}</strong>${item.description ? `<span>${escapeHtml(item.description)}</span>` : ''}<i>→</i></a>`).join('')}</div></div>`);
      }
      case 'cards': {
        const items = Array.isArray(block.items) ? block.items : [];
        const columns = Math.max(1,Math.min(4,Number(block.columns)||3));
        return blockShell(block, `<div class="managed-cards"><h2>${escapeHtml(block.title || '')}</h2><div class="managed-card-grid columns-${columns}">${items.map(item=>`<article>${item.image ? `<img src="${escapeHtml(linkSafe(item.image))}" alt="">` : ''}<div><h3>${escapeHtml(item.title || '')}</h3><p>${escapeHtml(item.body || '')}</p>${item.url ? `<a href="${escapeHtml(linkSafe(item.url))}">자세히 보기 →</a>` : ''}</div></article>`).join('')}</div></div>`);
      }
      case 'faq': {
        const items = Array.isArray(block.items) ? block.items : [];
        return blockShell(block, `<div class="managed-faq"><h2>${escapeHtml(block.title || '')}</h2>${items.map(item=>`<details><summary>${escapeHtml(item.question || '')}</summary><div>${markdown(item.answer || '')}</div></details>`).join('')}</div>`);
      }
      case 'divider':
        return blockShell(block, `<hr class="managed-divider style-${escapeHtml(block.style || 'solid')}">`);
      case 'spacer':
        return blockShell(block, `<div class="managed-spacer" style="height:${Math.max(8,Math.min(160,Number(block.height)||32))}px"></div>`);
      default:
        return '';
    }
  };

  async function renderNoticeFeed(block, container, options={}) {
    const category = ['notice','card','policy'].includes(block.category) ? block.category : 'notice';
    const limit = Math.max(1,Math.min(12,Number(block.limit)||5));
    let rows = [];
    if (options.preview || !window.knaSupabase || !window.SUPABASE_CONFIG_READY) {
      rows = [
        {title:'정책국 홈페이지 이용 안내',summary:'정책국 홈페이지의 주요 기능과 이용 방법을 안내합니다.',published_at:new Date().toISOString(),id:'preview-1'},
        {title:'정책국 일정 등록 안내',summary:'일정 등록과 확인 방법을 안내합니다.',published_at:new Date().toISOString(),id:'preview-2'}
      ];
    } else {
      const {data,error} = await window.knaSupabase.from('content_posts')
        .select('id,title,summary,published_at,created_at')
        .eq('category',category).eq('status','published')
        .order('published_at',{ascending:false}).limit(limit);
      if (!error) rows = data || [];
    }
    container.innerHTML = `<div class="managed-feed"><div class="managed-feed-head"><h2>${escapeHtml(block.title || '최신 게시글')}</h2>${block.show_more !== false ? `<a href="${category==='notice'?'notice.html':category==='card'?'cards.html':'policy.html'}">전체 보기 →</a>` : ''}</div><div class="managed-feed-list">${rows.length ? rows.map(row=>`<a href="article.html?id=${escapeHtml(row.id)}"><div><strong>${escapeHtml(row.title)}</strong><span>${escapeHtml(row.summary || '')}</span></div><time>${new Date(row.published_at||row.created_at).toLocaleDateString('ko-KR')}</time></a>`).join('') : '<div class="managed-empty">게시된 글이 없습니다.</div>'}</div></div>`;
  }

  async function renderScheduleCalendar(block, container, options={}) {
    const state = {month:new Date(new Date().getFullYear(),new Date().getMonth(),1),filter:'all',rows:[],selected:null};
    const rootId = uid('schedule');
    container.innerHTML = `<div class="managed-schedule" id="${rootId}">
      <div class="managed-schedule-head"><div><span class="managed-kicker">SCHEDULE</span><h2>${escapeHtml(block.title || '정책국 일정')}</h2><p>${escapeHtml(block.description || '')}</p></div><a href="schedule.html">전체 일정 보기 →</a></div>
      <div class="managed-schedule-toolbar"><button type="button" data-prev aria-label="이전 달">‹</button><strong data-month></strong><button type="button" data-next aria-label="다음 달">›</button></div>
      ${block.show_filters === false ? '' : `<div class="managed-schedule-filters"><button type="button" data-filter="all" class="active">전체</button><button type="button" data-filter="policy_office">정책국</button><button type="button" data-filter="div1">정책1부</button><button type="button" data-filter="div2">정책2부</button></div>`}
      <div class="managed-schedule-layout"><div><div class="managed-calendar" data-calendar></div><div class="managed-selected-schedule" data-selected><div class="managed-empty">일정이 있는 날짜를 선택해 주세요.</div></div></div><aside><h3>다가오는 일정</h3><div data-upcoming></div></aside></div>
    </div>`;
    const root = container.querySelector(`#${rootId}`);
    const monthEl = root.querySelector('[data-month]');
    const calendarEl = root.querySelector('[data-calendar]');
    const selectedEl = root.querySelector('[data-selected]');
    const upcomingEl = root.querySelector('[data-upcoming]');

    root.querySelector('[data-prev]').addEventListener('click',async()=>{state.month=new Date(state.month.getFullYear(),state.month.getMonth()-1,1);await load();});
    root.querySelector('[data-next]').addEventListener('click',async()=>{state.month=new Date(state.month.getFullYear(),state.month.getMonth()+1,1);await load();});
    root.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{state.filter=button.dataset.filter;root.querySelectorAll('[data-filter]').forEach(item=>item.classList.toggle('active',item===button));render();}));

    async function load() {
      const year=state.month.getFullYear(), month=state.month.getMonth();
      const start=`${year}-${pad(month+1)}-01`;
      const end=`${year}-${pad(month+1)}-${pad(new Date(year,month+1,0).getDate())}`;
      monthEl.textContent=`${year}년 ${month+1}월`;
      if (options.preview || !window.knaSupabase || !window.SUPABASE_CONFIG_READY) {
        const d1=`${year}-${pad(month+1)}-${pad(Math.min(12,new Date(year,month+1,0).getDate()))}`;
        const d2=`${year}-${pad(month+1)}-${pad(Math.min(21,new Date(year,month+1,0).getDate()))}`;
        state.rows=[
          {id:'sample1',scope:'div1',event_date:d1,start_time:'19:00',title:'정책1부 사업회의',location:'온라인',note:'사업 진행 상황을 공유합니다.'},
          {id:'sample2',scope:'policy_office',event_date:d2,start_time:'20:00',title:'정책국 월례회의',location:'온라인',note:'정책국 전체 정기회의입니다.'}
        ];
      } else {
        const {data,error}=await window.knaSupabase.rpc('list_public_policy_schedules_v2',{p_start_date:start,p_end_date:end});
        state.rows=error ? [] : (data||[]);
      }
      render();
    }

    function filteredRows(){return state.filter==='all'?state.rows:state.rows.filter(row=>row.scope===state.filter);}
    function render(){
      const year=state.month.getFullYear(), month=state.month.getMonth();
      const rows=filteredRows();
      const byDate=new Map();
      rows.forEach(row=>{const key=String(row.event_date);if(!byDate.has(key))byDate.set(key,[]);byDate.get(key).push(row);});
      const firstDay=new Date(year,month,1).getDay();
      const days=new Date(year,month+1,0).getDate();
      const cells=[];
      for(let i=0;i<firstDay;i++)cells.push('<span class="blank"></span>');
      for(let day=1;day<=days;day++){
        const key=`${year}-${pad(month+1)}-${pad(day)}`;
        const dayRows=byDate.get(key)||[];
        const dots=dayRows.slice(0,3).map(row=>`<i class="scope-${escapeHtml(row.scope)}"></i>`).join('');
        cells.push(`<button type="button" data-date="${key}" class="${dayRows.length?'has-event':''} ${state.selected===key?'selected':''}"><span>${day}</span><span class="event-dots">${dots}</span>${dayRows.length?`<small>${dayRows.length}</small>`:''}</button>`);
      }
      calendarEl.innerHTML=`<div class="weekdays">${['일','월','화','수','목','금','토'].map(x=>`<span>${x}</span>`).join('')}</div><div class="days">${cells.join('')}</div>`;
      calendarEl.querySelectorAll('[data-date]').forEach(button=>button.addEventListener('click',()=>{state.selected=button.dataset.date;render();renderSelected(byDate.get(state.selected)||[]);}));
      const upcoming=rows.filter(row=>new Date(`${row.event_date}T23:59:59`)>=new Date()).slice(0,Math.max(1,Number(block.upcoming_count)||5));
      upcomingEl.innerHTML=upcoming.length?upcoming.map(scheduleCard).join(''):'<div class="managed-empty">다가오는 공개 일정이 없습니다.</div>';
      if(state.selected)renderSelected(byDate.get(state.selected)||[]);
    }
    function renderSelected(rows){
      selectedEl.innerHTML=rows.length?`<h3>${formatDate(state.selected)}</h3>${rows.map(scheduleCard).join('')}`:'<div class="managed-empty">선택한 날짜에 공개 일정이 없습니다.</div>';
    }
    function scheduleCard(row){
      const time=[formatTime(row.start_time),formatTime(row.end_time)].filter(Boolean).join('–');
      return `<article class="managed-schedule-item"><span class="scope-pill scope-${escapeHtml(row.scope)}">${escapeHtml(scopeLabel(row.scope))}</span><div><strong>${escapeHtml(row.title)}</strong><p>${[time,row.location].filter(Boolean).map(escapeHtml).join(' · ') || '시간·장소 추후 안내'}</p>${row.note?`<small>${escapeHtml(row.note)}</small>`:''}</div></article>`;
    }
    await load();
  }

  async function renderBlocks(layout, root, options={}) {
    if (!root) return;
    const blocks = Array.isArray(layout?.blocks) ? layout.blocks : [];
    root.innerHTML = '';
    for (const block of blocks) {
      if (!block || block.visible === false) continue;
      if (block.type === 'schedule_calendar' || block.type === 'notice_feed') {
        const section = document.createElement('section');
        section.className = `managed-block managed-block-${block.type} padding-${block.padding || 'normal'}`;
        if (/^#[0-9a-f]{6}$/i.test(block.background || '')) section.style.setProperty('--block-background',block.background);
        const inner = document.createElement('div'); inner.className='managed-block-inner'; section.append(inner); root.append(section);
        if (block.type === 'schedule_calendar') await renderScheduleCalendar(block,inner,options);
        else await renderNoticeFeed(block,inner,options);
      } else {
        root.insertAdjacentHTML('beforeend',renderStaticBlock(block));
      }
    }
    if (!root.children.length && options.showEmpty) root.innerHTML='<div class="managed-empty">추가된 페이지 블록이 없습니다.</div>';
  }

  window.KNA_PAGE_BLOCKS = Object.freeze({
    BLOCK_TYPES,
    BLOCK_DEFAULTS,
    createBlock,
    renderBlocks,
    renderStaticBlock,
    markdown,
    escapeHtml,
    linkSafe
  });
})();
