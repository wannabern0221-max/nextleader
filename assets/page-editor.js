(async () => {
  const client=window.knaSupabase;
  const root=document.querySelector('#editorRoot');
  const pageSelect=document.querySelector('#pageSelect');
  const publishButton=document.querySelector('#publishPage');
  const localButton=document.querySelector('#saveLocalDraft');
  const openTarget=document.querySelector('#openTargetPage');
  const titleEl=document.querySelector('#editorPageTitle');
  const fullPreviewButton=document.querySelector('#openFullPreview');
  const fullPreviewModal=document.querySelector('#fullPreviewModal');
  const qs=new URLSearchParams(location.search);
  const pageKey=qs.get('page')||'home';
  const targetMap={home:'index.html',about:'about.html',notice:'notice.html',cards:'cards.html',policy:'policy.html',glossary:'glossary.html',news:'news.html',schedule:'schedule.html',dashboard:'dashboard.html','internal-schedule':'internal-schedule.html',board:'board.html',quiz:'quiz.html',article:'article.html'};
  const pageDefaults={
    home:{label:'홈페이지',eyebrow:'POLICY DIVISION · BUSAN',title:'정책을 읽고 간호의 내일을 설계합니다.',description:'간호정책을 쉽고 정확하게 전달하고 현장의 목소리를 연결하는 대한간호학생회 부산 정책국의 공식 공간입니다.'},
    about:{label:'정책국 소개',eyebrow:'ABOUT',title:'정책국 소개',description:'대한간호학생회 부산 정책국의 역할과 활동을 소개합니다.'},
    notice:{label:'공지사항',eyebrow:'NOTICE',title:'공지사항',description:'정책국의 주요 안내와 운영 소식을 확인합니다.'},
    cards:{label:'카드뉴스',eyebrow:'CARD NEWS',title:'카드뉴스',description:'간호·보건의료 정책을 이해하기 쉽게 전달합니다.'},
    policy:{label:'정책 콘텐츠',eyebrow:'POLICY CONTENT',title:'정책 콘텐츠',description:'정책과 제도를 깊이 있게 정리합니다.'},
    glossary:{label:'정책단어',eyebrow:'GLOSSARY',title:'정책단어',description:'간호·보건의료 정책 용어를 쉽게 찾아봅니다.'},
    news:{label:'간호·정책 뉴스',eyebrow:'NEWS',title:'간호·정책 뉴스',description:'공식기관 자료와 기자가 작성한 최신 기사를 함께 확인합니다.'},
    schedule:{label:'정책국 일정',eyebrow:'SCHEDULE',title:'정책국 일정',description:'정책국과 정책1부·2부의 공개 일정을 확인합니다.'},
    dashboard:{label:'리더 홈',eyebrow:'LEADER HOME',title:'리더 홈',description:'승인된 리더를 위한 내부 기능입니다.'},
    'internal-schedule':{label:'일정 확인',eyebrow:'SCHEDULE CHECK',title:'일정 확인',description:'참여가 불가한 날짜와 사유를 등록하고 부서 일정을 조율합니다.'},
    board:{label:'익명 소통',eyebrow:'ANONYMOUS BOARD',title:'익명 리더 소통방',description:'리더들이 자유롭게 의견과 아이디어를 나누는 공간입니다.'},
    quiz:{label:'정책 퀴즈',eyebrow:'POLICY QUIZ',title:'정책 퀴즈',description:'쉬움부터 어려움까지 무작위 정책 문제를 풀어봅니다.'},
    article:{label:'게시글 상세',eyebrow:'ARTICLE',title:'게시글',description:'정책국에서 게시한 내용을 확인합니다.'}
  };
  const fixedDefaults={
    about:{
      role_eyebrow:'OUR ROLE',role_title:'정책을 쉽고 정확하게 전달합니다',
      value1_number:'01',value1_title:'정책 이해',value1_body:'간호와 보건의료 정책을 학생의 시선에서 읽고 핵심 내용을 정리합니다.',
      value2_number:'02',value2_title:'콘텐츠 제작',value2_body:'카드뉴스와 브리핑을 통해 어려운 정책을 쉽게 설명합니다.',
      value3_number:'03',value3_title:'의견 연결',value3_body:'간호학생의 관심과 현장 의견을 모아 정책 참여의 기반을 만듭니다.',
      div1_title:'정책1부',div1_body:'간호·보건의료 정책을 조사하고 카드뉴스를 기획·제작하여 핵심 내용을 쉽고 정확하게 전달합니다.',
      div2_title:'정책2부',div2_body:'국회의원 및 정책 관계자와의 간담회를 기획하고 간호학생의 의견이 실제 정책 논의로 이어질 수 있도록 연결합니다.'
    }
  };
  const fixedFieldDefinitions={
    about:[
      ['역할 영역 영문 표기','role_eyebrow','text'],['역할 영역 제목','role_title','text'],
      ['첫 번째 번호','value1_number','text'],['첫 번째 제목','value1_title','text'],['첫 번째 설명','value1_body','textarea'],
      ['두 번째 번호','value2_number','text'],['두 번째 제목','value2_title','text'],['두 번째 설명','value2_body','textarea'],
      ['세 번째 번호','value3_number','text'],['세 번째 제목','value3_title','text'],['세 번째 설명','value3_body','textarea'],
      ['정책1부 제목','div1_title','text'],['정책1부 소개','div1_body','textarea'],
      ['정책2부 제목','div2_title','text'],['정책2부 소개','div2_body','textarea']
    ]
  };
  const state={activeTab:'basic',layout:null,history:[],pages:[],selectedBlock:0,selectedPopup:0,previewDevice:'desktop',fullPreviewDevice:'desktop',dirty:false,uploadTarget:null};
  const esc=window.KNA_PAGE_BLOCKS?.escapeHtml||((v)=>String(v??''));

  if(!window.SUPABASE_CONFIG_READY||!client){root.innerHTML='<div class="editor-loading">리더 서비스 연결 설정을 확인해 주세요.</div>';return;}
  try{
    const {data:{session}}=await client.auth.getSession();
    if(!session)return location.replace('login.html');
    const {data,error}=await client.rpc('get_page_layout_admin_v1',{p_page_key:pageKey});
    if(error)throw error;
    state.layout=normalizeLayout(data.layout||{},pageKey,data.page_label);
    state.history=data.history||[];state.pages=data.pages||[];
    const local=localStorage.getItem(`kna_page_draft_${pageKey}`);
    if(local&&confirm('이 브라우저에 임시저장한 페이지가 있습니다. 불러올까요?')){
      try{state.layout=normalizeLayout(JSON.parse(local),pageKey,data.page_label);}catch(_){/* ignore */}
    }
    setupTop();renderShell();renderPanel();await renderPreview();
  }catch(error){root.innerHTML=`<div class="editor-loading">${esc(error.message||'정책국장 권한을 확인하지 못했습니다.')}</div>`;}

  function normalizeLayout(layout,key,label){
    const d=pageDefaults[key]||{label:label||key,eyebrow:'PAGE',title:label||key,description:''};
    return {
      page_key:key,page_label:layout.page_label||label||d.label,access_level:layout.access_level||(['dashboard','internal-schedule','board','quiz'].includes(key)?'leaders':'public'),
      hero:{visible:layout.hero?.visible!==false,eyebrow:layout.hero?.eyebrow||d.eyebrow,title:layout.hero?.title||d.title,description:layout.hero?.description||d.description},
      design:{accent:layout.design?.accent||'#1976c9',background:layout.design?.background||'#ffffff',content_width:layout.design?.content_width||'wide',replace_base_content:Boolean(layout.design?.replace_base_content),section_style:layout.design?.section_style||'soft'},
      fixed_content:{...(fixedDefaults[key]||{}),...(layout.fixed_content||{})},
      blocks:Array.isArray(layout.blocks)?layout.blocks:[],popups:Array.isArray(layout.popups)?layout.popups:[]
    };
  }
  function setupTop(){
    titleEl.textContent=`${state.layout.page_label} 편집`;
    pageSelect.innerHTML=state.pages.map(p=>`<option value="${esc(p.page_key)}" ${p.page_key===pageKey?'selected':''}>${esc(p.page_label)}</option>`).join('');
    pageSelect.addEventListener('change',()=>{if(state.dirty&&!confirm('게시하지 않은 변경사항이 있습니다. 페이지를 이동할까요?')){pageSelect.value=pageKey;return;}location.href=`page-editor.html?page=${encodeURIComponent(pageSelect.value)}`;});
    openTarget.href=targetMap[pageKey]||'index.html';
    publishButton.addEventListener('click',publish);
    localButton.addEventListener('click',()=>{localStorage.setItem(`kna_page_draft_${pageKey}`,JSON.stringify(state.layout));message('현재 브라우저에 임시저장했습니다.','success');});
    fullPreviewButton?.addEventListener('click',openFullPreview);
  }
  function renderShell(){
    root.innerHTML=`<div class="editor-layout"><aside class="editor-sidebar">
      ${([['basic','페이지 기본'],...(fixedFieldDefinitions[pageKey]?[['fixed','기존 본문']]:[]),['design','디자인'],['blocks','페이지 블록'],['popups','팝업'],['history','이전 버전']]).map(([k,l])=>`<button class="editor-tab ${state.activeTab===k?'active':''}" data-tab="${k}">${l}</button>`).join('')}
      <div class="editor-sidebar-note">현재 확정 직책이 정책국장인 계정만 게시할 수 있습니다. 로그인·권한·데이터베이스·메일 설정은 이 편집기에서 변경되지 않습니다.</div></aside>
      <section class="editor-panel"><div id="editorPanelBody"></div><div id="editorMessage" class="editor-message"></div></section>
      <aside class="editor-preview-panel"><div class="editor-preview-head"><strong>실시간 미리보기</strong><div class="preview-device-switch"><button type="button" data-device="desktop" class="active">PC</button><button type="button" data-device="mobile">모바일</button></div></div><div class="editor-preview-frame"><div class="editor-preview-canvas" id="editorPreview"><div class="preview-hero" id="previewHero"></div><div id="previewFixed"></div><div class="editor-preview-blocks" id="previewBlocks"></div></div></div></aside></div>
      <input id="editorUploadInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" hidden>`;
    root.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{state.activeTab=button.dataset.tab;root.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===button));renderPanel();}));
    root.querySelectorAll('[data-device]').forEach(button=>button.addEventListener('click',()=>{state.previewDevice=button.dataset.device;root.querySelectorAll('[data-device]').forEach(x=>x.classList.toggle('active',x===button));document.querySelector('#editorPreview').classList.toggle('mobile',state.previewDevice==='mobile');}));
    root.querySelector('#editorUploadInput').addEventListener('change',uploadFile);
  }
  function renderPanel(){
    const panel=document.querySelector('#editorPanelBody');
    panel.innerHTML=state.activeTab==='basic'?basicPanel():state.activeTab==='fixed'?fixedPanel():state.activeTab==='design'?designPanel():state.activeTab==='blocks'?blocksPanel():state.activeTab==='popups'?popupsPanel():historyPanel();
    bindPanel();
  }
  function basicPanel(){const h=state.layout.hero;return `<div class="editor-panel-head"><div><h2>페이지 기본 설정</h2><p>페이지 이름과 상단 안내 영역을 수정합니다.</p></div></div><div class="editor-form-grid">
    ${field('관리용 페이지 이름','page_label',state.layout.page_label,'text','메뉴 자체의 이름은 홈페이지 관리에서 변경합니다.')}
    ${selectField('열람 범위','access_level',state.layout.access_level,[['public','전체 공개'],['leaders','승인 리더'],['executives','임원']])}
    <label class="editor-check full"><input type="checkbox" data-layout-path="hero.visible" ${h.visible?'checked':''}>상단 제목 영역 표시</label>
    ${field('상단 영문 표기','hero.eyebrow',h.eyebrow)}${field('페이지 제목','hero.title',h.title)}
    ${textareaField('페이지 설명','hero.description',h.description,'full')}
  </div>`;}
  function fixedPanel(){
    const defs=fixedFieldDefinitions[pageKey]||[];
    if(!defs.length)return `<div class="managed-empty">이 페이지에는 별도 고정 본문이 없습니다. 페이지 블록에서 내용을 추가해 주세요.</div>`;
    return `<div class="editor-panel-head"><div><h2>기존 본문 수정</h2><p>코드에 고정되어 있던 소개 문구와 카드 내용을 직접 수정합니다.</p></div></div><div class="editor-form-grid">${defs.map(([label,key,type])=>type==='textarea'?`<label class="editor-field full"><span>${label}</span><textarea data-fixed-field="${key}">${esc(state.layout.fixed_content?.[key]||'')}</textarea></label>`:`<label class="editor-field"><span>${label}</span><input type="text" data-fixed-field="${key}" value="${esc(state.layout.fixed_content?.[key]||'')}"></label>`).join('')}</div>`;
  }
  function designPanel(){const d=state.layout.design;return `<div class="editor-panel-head"><div><h2>페이지 디자인</h2><p>개발 코드 없이 색상과 콘텐츠 배치를 조정합니다.</p></div></div><div class="editor-form-grid">
    ${field('강조 색상','design.accent',d.accent,'color')}${field('페이지 배경','design.background',d.background,'color')}
    ${selectField('콘텐츠 폭','design.content_width',d.content_width,[['narrow','좁게'],['medium','보통'],['wide','넓게']])}
    ${selectField('섹션 분위기','design.section_style',d.section_style,[['soft','부드럽게'],['clean','깔끔하게'],['formal','공식적으로']])}
    <label class="editor-check full"><input type="checkbox" data-layout-path="design.replace_base_content" ${d.replace_base_content?'checked':''}>기존 본문을 숨기고 아래 블록만으로 페이지 구성</label>
    <div class="editor-help full">이 옵션을 켜면 원래 페이지의 기능 영역까지 숨겨질 수 있습니다. 일정·퀴즈·게시판처럼 기능이 있는 페이지는 기본적으로 끄는 것을 권장합니다.</div>
  </div>`;}
  function blocksPanel(){
    const types=Object.entries(window.KNA_PAGE_BLOCKS.BLOCK_TYPES).map(([k,l])=>`<option value="${k}">${l}</option>`).join('');
    const list=state.layout.blocks.map((b,i)=>`<div class="block-list-item ${i===state.selectedBlock?'active':''}"><button class="block-drag" type="button">⋮⋮</button><button class="block-select" type="button" data-select-block="${i}"><strong>${esc(blockTitle(b))}</strong><small>${esc(window.KNA_PAGE_BLOCKS.BLOCK_TYPES[b.type]||b.type)} · ${b.visible===false?'숨김':'표시'}</small></button><div class="block-actions"><button type="button" title="위로" data-move-block="${i}" data-direction="-1">↑</button><button type="button" title="아래로" data-move-block="${i}" data-direction="1">↓</button><button type="button" title="복제" data-duplicate-block="${i}">⧉</button><button class="danger" type="button" title="삭제" data-delete-block="${i}">×</button></div></div>`).join('');
    const selected=state.layout.blocks[state.selectedBlock];
    return `<div class="editor-panel-head"><div><h2>페이지 블록</h2><p>원하는 구성요소를 추가하고 순서를 바꿉니다.</p></div></div><div class="block-toolbar"><select id="newBlockType">${types}</select><button class="btn btn-primary" id="addBlock" type="button">블록 추가</button></div><div class="block-list">${list||'<div class="managed-empty">추가된 블록이 없습니다.</div>'}</div>${selected?`<div class="block-editor"><div class="block-editor-head"><strong>${esc(window.KNA_PAGE_BLOCKS.BLOCK_TYPES[selected.type]||selected.type)} 설정</strong><label><input type="checkbox" data-block-field="visible" ${selected.visible!==false?'checked':''}> 표시</label></div>${blockFields(selected)}</div>`:''}`;
  }
  function blockFields(b){
    const common=`<div class="editor-form-grid">${selectBlock('여백','padding',b.padding||'normal',[['compact','좁게'],['normal','보통'],['large','넓게']])}${blockField('배경색','background',b.background||'#ffffff','color')}</div><div class="editor-section"><h3>콘텐츠</h3>`;
    let body='';
    if(b.type==='heading')body=`<div class="editor-form-grid">${blockField('제목','title',b.title)}${blockField('보조 문구','subtitle',b.subtitle)}${selectBlock('제목 크기','level',String(b.level||2),[['2','크게'],['3','보통'],['4','작게']])}${selectBlock('정렬','align',b.align||'left',[['left','왼쪽'],['center','가운데'],['right','오른쪽']])}</div>`;
    else if(b.type==='text')body=`<div class="editor-form-grid">${blockTextarea('본문','body',b.body,'full')}${selectBlock('정렬','align',b.align||'left',[['left','왼쪽'],['center','가운데'],['right','오른쪽']])}</div><div class="editor-help"># 제목 · ## 소제목 · - 목록 · **굵게** 형식을 사용할 수 있습니다.</div>`;
    else if(b.type==='callout')body=`<div class="editor-form-grid">${blockField('안내 제목','title',b.title)}${selectBlock('색상','tone',b.tone||'blue',[['blue','파랑'],['navy','남색'],['green','초록'],['yellow','노랑'],['red','빨강']])}${blockTextarea('안내 내용','body',b.body,'full')}</div>`;
    else if(b.type==='image')body=`<div class="editor-form-grid">${uploadField('이미지 업로드','url',b.url||'')}${blockField('대체 문구','alt',b.alt||'')}${blockField('설명','caption',b.caption||'')}${blockField('클릭 연결 주소','link',b.link||'')}${selectBlock('맞춤','fit',b.fit||'cover',[['cover','영역 채우기'],['contain','전체 보이기']])}${selectBlock('모서리','radius',b.radius||'large',[['none','각지게'],['small','조금 둥글게'],['large','많이 둥글게']])}</div>`;
    else if(b.type==='button')body=`<div class="editor-form-grid">${blockField('버튼 문구','label',b.label)}${blockField('연결 주소','url',b.url)}${selectBlock('모양','style',b.style||'primary',[['primary','강조'],['outline','테두리'],['soft','부드럽게']])}${selectBlock('정렬','align',b.align||'left',[['left','왼쪽'],['center','가운데'],['right','오른쪽']])}</div>`;
    else if(b.type==='link_list')body=`<div class="editor-form-grid">${blockField('영역 제목','title',b.title,'text','full')}</div>${arrayEditor('items',b.items||[],[['label','링크 이름','text'],['url','주소','text'],['description','설명','textarea']])}`;
    else if(b.type==='cards')body=`<div class="editor-form-grid">${blockField('영역 제목','title',b.title)}${selectBlock('한 줄 카드 수','columns',String(b.columns||3),[['2','2개'],['3','3개'],['4','4개']])}</div>${arrayEditor('items',b.items||[],[['title','카드 제목','text'],['body','내용','textarea'],['url','연결 주소','text'],['image','카드 이미지','image']])}`;
    else if(b.type==='faq')body=`<div class="editor-form-grid">${blockField('영역 제목','title',b.title,'text','full')}</div>${arrayEditor('items',b.items||[],[['question','질문','text'],['answer','답변','textarea']])}`;
    else if(b.type==='notice_feed')body=`<div class="editor-form-grid">${blockField('영역 제목','title',b.title)}${selectBlock('게시글 종류','category',b.category||'notice',[['notice','공지사항'],['card','카드뉴스'],['policy','정책 콘텐츠']])}${blockField('표시 개수','limit',b.limit||5,'number')}<label class="editor-check"><input type="checkbox" data-block-field="show_more" ${b.show_more!==false?'checked':''}>전체 보기 링크 표시</label></div>`;
    else if(b.type==='schedule_calendar')body=`<div class="editor-form-grid">${blockField('영역 제목','title',b.title)}${blockField('소개 문구','description',b.description)}${blockField('다가오는 일정 개수','upcoming_count',b.upcoming_count||5,'number')}<label class="editor-check"><input type="checkbox" data-block-field="show_filters" ${b.show_filters!==false?'checked':''}>부서 필터 표시</label></div>`;
    else if(b.type==='divider')body=`<div class="editor-form-grid">${selectBlock('구분선','style',b.style||'solid',[['solid','실선'],['dashed','점선'],['bold','굵은 선']])}</div>`;
    else if(b.type==='spacer')body=`<div class="editor-form-grid">${blockField('높이(px)','height',b.height||32,'number')}</div>`;
    return common+body+'</div>';
  }
  function popupsPanel(){
    const list=state.layout.popups.map((p,i)=>`<div class="popup-list-item"><button type="button" data-select-popup="${i}" style="border:0;background:transparent;text-align:left;flex:1"><strong>${esc(p.title||'새 팝업')}</strong><small>${p.enabled===false?'숨김':'표시'}</small></button><button type="button" data-delete-popup="${i}">삭제</button></div>`).join('');
    const p=state.layout.popups[state.selectedPopup];
    return `<div class="editor-panel-head"><div><h2>페이지 팝업</h2><p>현재 페이지에서만 표시되는 안내 팝업을 관리합니다.</p></div><button class="btn btn-primary" id="addPopup" type="button">팝업 추가</button></div><div class="popup-list">${list||'<div class="managed-empty">등록된 팝업이 없습니다.</div>'}</div>${p?`<div class="block-editor"><div class="block-editor-head"><strong>팝업 설정</strong><label><input type="checkbox" data-popup-field="enabled" ${p.enabled!==false?'checked':''}> 표시</label></div><div class="editor-form-grid">${popupField('제목','title',p.title)}${uploadPopupField('이미지 업로드','image',p.image||'')}${popupTextarea('본문','body',p.body,'full')}${popupField('버튼 문구','button_label',p.button_label||'')}${popupField('버튼 주소','button_url',p.button_url||'')}${popupField('시작 일시','start_at',p.start_at||'','datetime-local')}${popupField('종료 일시','end_at',p.end_at||'','datetime-local')}${popupField('다시 보지 않을 기간(일)','dismiss_days',p.dismiss_days||1,'number')}</div></div>`:''}`;
  }
  function historyPanel(){return `<div class="editor-panel-head"><div><h2>이전 버전</h2><p>게시 전 상태로 되돌릴 수 있습니다.</p></div></div><div class="history-list">${state.history.length?state.history.map(h=>`<div class="history-item"><div><strong>${new Date(h.created_at).toLocaleString('ko-KR')}</strong><small>${esc(h.changed_by_name||'정책국장')}</small></div><button type="button" data-restore="${h.id}">복원</button></div>`).join(''):'<div class="managed-empty">저장된 이전 버전이 없습니다.</div>'}</div>`;}

  function field(label,path,value,type='text',help=''){return `<label class="editor-field"><span>${label}</span><input type="${type}" data-layout-path="${path}" value="${esc(value)}">${help?`<small class="editor-help">${help}</small>`:''}</label>`;}
  function textareaField(label,path,value,cls=''){return `<label class="editor-field ${cls}"><span>${label}</span><textarea data-layout-path="${path}">${esc(value)}</textarea></label>`;}
  function selectField(label,path,value,options){return `<label class="editor-field"><span>${label}</span><select data-layout-path="${path}">${options.map(([v,l])=>`<option value="${v}" ${String(v)===String(value)?'selected':''}>${l}</option>`).join('')}</select></label>`;}
  function blockField(label,key,value,type='text',cls=''){return `<label class="editor-field ${cls}"><span>${label}</span><input type="${type}" data-block-field="${key}" value="${esc(value??'')}"></label>`;}
  function blockTextarea(label,key,value,cls=''){return `<label class="editor-field ${cls}"><span>${label}</span><textarea data-block-field="${key}">${esc(value||'')}</textarea></label>`;}
  function selectBlock(label,key,value,options){return `<label class="editor-field"><span>${label}</span><select data-block-field="${key}">${options.map(([v,l])=>`<option value="${v}" ${String(v)===String(value)?'selected':''}>${l}</option>`).join('')}</select></label>`;}
  function uploadField(label,key,value){return `<label class="editor-field full"><span>${label}</span><input type="hidden" data-block-field="${key}" value="${esc(value)}"><div class="managed-upload-preview">${value?`<img src="${esc(value)}" alt="업로드 이미지 미리보기">`:'<span>등록된 이미지가 없습니다.</span>'}<button class="upload-button" type="button" data-upload="block" data-upload-field="${key}">이미지 선택</button></div><small class="editor-help">주소를 입력하지 않고 이미지 파일을 직접 선택합니다.</small></label>`;}
  function popupField(label,key,value,type='text'){return `<label class="editor-field"><span>${label}</span><input type="${type}" data-popup-field="${key}" value="${esc(value??'')}"></label>`;}
  function popupTextarea(label,key,value,cls=''){return `<label class="editor-field ${cls}"><span>${label}</span><textarea data-popup-field="${key}">${esc(value||'')}</textarea></label>`;}
  function uploadPopupField(label,key,value){return `<label class="editor-field full"><span>${label}</span><input type="hidden" data-popup-field="${key}" value="${esc(value)}"><div class="managed-upload-preview">${value?`<img src="${esc(value)}" alt="업로드 이미지 미리보기">`:'<span>등록된 이미지가 없습니다.</span>'}<button class="upload-button" type="button" data-upload="popup" data-upload-field="${key}">이미지 선택</button></div></label>`;}
  function arrayEditor(fieldName,items,defs){return `<div class="array-list">${items.map((item,i)=>`<div class="array-item"><div class="array-item-head"><strong>항목 ${i+1}</strong><button type="button" data-remove-array="${fieldName}" data-index="${i}">항목 삭제</button></div><div class="array-item-grid">${defs.map(([key,label,type])=>type==='textarea'?`<label class="editor-field"><span>${label}</span><textarea data-array-field="${fieldName}" data-index="${i}" data-item-key="${key}">${esc(item[key]||'')}</textarea></label>`:type==='image'?`<label class="editor-field full"><span>${label}</span><input type="hidden" data-array-field="${fieldName}" data-index="${i}" data-item-key="${key}" value="${esc(item[key]||'')}"><div class="managed-upload-preview">${item[key]?`<img src="${esc(item[key])}" alt="카드 이미지 미리보기">`:'<span>등록된 이미지가 없습니다.</span>'}<button class="upload-button" type="button" data-upload-array="${fieldName}" data-upload-index="${i}" data-upload-item-key="${key}">이미지 선택</button></div></label>`:`<label class="editor-field"><span>${label}</span><input type="text" data-array-field="${fieldName}" data-index="${i}" data-item-key="${key}" value="${esc(item[key]||'')}"></label>`).join('')}</div></div>`).join('')}</div><button class="add-array-item" type="button" data-add-array="${fieldName}">항목 추가</button>`;}
  function blockTitle(block){return block.title||block.label||block.type||'블록';}

  function bindPanel(){
    document.querySelectorAll('[data-layout-path]').forEach(input=>input.addEventListener('input',()=>{setPath(state.layout,input.dataset.layoutPath,input.type==='checkbox'?input.checked:input.value);changed();}));
    document.querySelectorAll('[data-fixed-field]').forEach(input=>input.addEventListener('input',()=>{state.layout.fixed_content=state.layout.fixed_content||{};state.layout.fixed_content[input.dataset.fixedField]=input.value;changed();}));
    document.querySelectorAll('[data-block-field]').forEach(input=>input.addEventListener('input',()=>{const b=state.layout.blocks[state.selectedBlock];if(!b)return;b[input.dataset.blockField]=input.type==='checkbox'?input.checked:(input.type==='number'?Number(input.value):input.value);changed();}));
    document.querySelectorAll('[data-popup-field]').forEach(input=>input.addEventListener('input',()=>{const p=state.layout.popups[state.selectedPopup];if(!p)return;p[input.dataset.popupField]=input.type==='checkbox'?input.checked:(input.type==='number'?Number(input.value):input.value);changed();}));
    document.querySelectorAll('[data-array-field]').forEach(input=>input.addEventListener('input',()=>{const b=state.layout.blocks[state.selectedBlock];const arr=b?.[input.dataset.arrayField];if(!arr)return;arr[Number(input.dataset.index)][input.dataset.itemKey]=input.value;changed();}));
    document.querySelector('#addBlock')?.addEventListener('click',()=>{const type=document.querySelector('#newBlockType').value;state.layout.blocks.push(window.KNA_PAGE_BLOCKS.createBlock(type));state.selectedBlock=state.layout.blocks.length-1;state.dirty=true;renderPanel();renderPreview();});
    document.querySelectorAll('[data-select-block]').forEach(btn=>btn.addEventListener('click',()=>{state.selectedBlock=Number(btn.dataset.selectBlock);renderPanel();}));
    document.querySelectorAll('[data-move-block]').forEach(btn=>btn.addEventListener('click',()=>moveBlock(Number(btn.dataset.moveBlock),Number(btn.dataset.direction))));
    document.querySelectorAll('[data-duplicate-block]').forEach(btn=>btn.addEventListener('click',()=>{const i=Number(btn.dataset.duplicateBlock);const copy=JSON.parse(JSON.stringify(state.layout.blocks[i]));copy.id=`block-${Date.now()}`;state.layout.blocks.splice(i+1,0,copy);state.selectedBlock=i+1;state.dirty=true;renderPanel();renderPreview();}));
    document.querySelectorAll('[data-delete-block]').forEach(btn=>btn.addEventListener('click',()=>{const i=Number(btn.dataset.deleteBlock);if(!confirm('이 블록을 삭제할까요?'))return;state.layout.blocks.splice(i,1);state.selectedBlock=Math.max(0,Math.min(state.selectedBlock,state.layout.blocks.length-1));state.dirty=true;renderPanel();renderPreview();}));
    document.querySelectorAll('[data-add-array]').forEach(btn=>btn.addEventListener('click',()=>{const b=state.layout.blocks[state.selectedBlock];const name=btn.dataset.addArray;b[name]=Array.isArray(b[name])?b[name]:[];b[name].push(name==='items'&&b.type==='faq'?{question:'새 질문',answer:'새 답변'}:b.type==='link_list'?{label:'새 링크',url:'#',description:''}:{title:'새 카드',body:'내용',url:'#',image:''});state.dirty=true;renderPanel();renderPreview();}));
    document.querySelectorAll('[data-remove-array]').forEach(btn=>btn.addEventListener('click',()=>{const b=state.layout.blocks[state.selectedBlock];b?.[btn.dataset.removeArray]?.splice(Number(btn.dataset.index),1);state.dirty=true;renderPanel();renderPreview();}));
    document.querySelector('#addPopup')?.addEventListener('click',()=>{state.layout.popups.push({id:`popup-${Date.now()}`,enabled:true,title:'새 안내 팝업',body:'안내 내용을 입력해 주세요.',image:'',button_label:'',button_url:'',start_at:'',end_at:'',dismiss_days:1});state.selectedPopup=state.layout.popups.length-1;state.dirty=true;renderPanel();});
    document.querySelectorAll('[data-select-popup]').forEach(btn=>btn.addEventListener('click',()=>{state.selectedPopup=Number(btn.dataset.selectPopup);renderPanel();}));
    document.querySelectorAll('[data-delete-popup]').forEach(btn=>btn.addEventListener('click',()=>{if(!confirm('팝업을 삭제할까요?'))return;state.layout.popups.splice(Number(btn.dataset.deletePopup),1);state.selectedPopup=0;state.dirty=true;renderPanel();}));
    document.querySelectorAll('[data-restore]').forEach(btn=>btn.addEventListener('click',()=>restore(Number(btn.dataset.restore))));
    document.querySelectorAll('[data-upload]').forEach(btn=>btn.addEventListener('click',()=>{state.uploadTarget={type:btn.dataset.upload,field:btn.dataset.uploadField};document.querySelector('#editorUploadInput').value='';document.querySelector('#editorUploadInput').click();}));
    document.querySelectorAll('[data-upload-array]').forEach(btn=>btn.addEventListener('click',()=>{state.uploadTarget={type:'array',field:btn.dataset.uploadArray,index:Number(btn.dataset.uploadIndex),itemKey:btn.dataset.uploadItemKey};document.querySelector('#editorUploadInput').value='';document.querySelector('#editorUploadInput').click();}));
  }
  function moveBlock(index,direction){const target=index+direction;if(target<0||target>=state.layout.blocks.length)return;const [item]=state.layout.blocks.splice(index,1);state.layout.blocks.splice(target,0,item);state.selectedBlock=target;state.dirty=true;renderPanel();renderPreview();}
  function setPath(obj,path,value){const parts=path.split('.');let current=obj;parts.slice(0,-1).forEach(key=>{current[key]=current[key]||{};current=current[key];});current[parts.at(-1)]=value;}
  let previewTimer;function changed(){state.dirty=true;clearTimeout(previewTimer);previewTimer=setTimeout(renderPreview,180);}
  function fixedPreviewHtml(){
    if(pageKey!=='about')return '';
    const f=state.layout.fixed_content||{};
    return `<section class="preview-fixed-about"><div class="section-head"><div><span class="eyebrow">${esc(f.role_eyebrow||'')}</span><h2>${esc(f.role_title||'')}</h2></div></div><div class="values"><article><span>${esc(f.value1_number||'')}</span><h3>${esc(f.value1_title||'')}</h3><p>${esc(f.value1_body||'')}</p></article><article><span>${esc(f.value2_number||'')}</span><h3>${esc(f.value2_title||'')}</h3><p>${esc(f.value2_body||'')}</p></article><article><span>${esc(f.value3_number||'')}</span><h3>${esc(f.value3_title||'')}</h3><p>${esc(f.value3_body||'')}</p></article></div><div class="policy-layout"><div class="policy-card"><h3>${esc(f.div1_title||'')}</h3><p>${esc(f.div1_body||'')}</p></div><div class="policy-card"><h3>${esc(f.div2_title||'')}</h3><p>${esc(f.div2_body||'')}</p></div></div></section>`;
  }
  async function renderPreview(){
    const hero=document.querySelector('#previewHero'),fixed=document.querySelector('#previewFixed'),blocks=document.querySelector('#previewBlocks');if(!hero||!blocks)return;
    hero.style.display=state.layout.hero.visible===false?'none':'block';hero.style.background=state.layout.design.background||'#fff';hero.innerHTML=`<span class="eyebrow">${esc(state.layout.hero.eyebrow||'')}</span><h1>${esc(state.layout.hero.title||'')}</h1><p>${esc(state.layout.hero.description||'')}</p>`;
    if(fixed)fixed.innerHTML=fixedPreviewHtml();
    document.querySelector('#editorPreview').style.setProperty('--managed-accent',state.layout.design.accent||'#1976c9');
    await window.KNA_PAGE_BLOCKS.renderBlocks(state.layout,blocks,{preview:true,showEmpty:true});
    if(!fullPreviewModal?.hidden)await renderFullPreview();
  }
  async function renderFullPreview(){
    const hero=document.querySelector('#fullPreviewHero'),fixed=document.querySelector('#fullPreviewFixed'),blocks=document.querySelector('#fullPreviewBlocks'),doc=document.querySelector('#fullPreviewDocument');
    if(!hero||!blocks||!doc)return;
    doc.classList.toggle('mobile',state.fullPreviewDevice==='mobile');
    doc.style.setProperty('--managed-accent',state.layout.design.accent||'#1976c9');
    doc.style.background=state.layout.design.background||'#fff';
    hero.style.display=state.layout.hero.visible===false?'none':'block';hero.style.background=state.layout.design.background||'#fff';hero.innerHTML=`<span class="eyebrow">${esc(state.layout.hero.eyebrow||'')}</span><h1>${esc(state.layout.hero.title||'')}</h1><p>${esc(state.layout.hero.description||'')}</p>`;
    if(fixed)fixed.innerHTML=fixedPreviewHtml();
    await window.KNA_PAGE_BLOCKS.renderBlocks(state.layout,blocks,{preview:true,showEmpty:true});
  }
  async function openFullPreview(){
    if(!fullPreviewModal)return;
    fullPreviewModal.hidden=false;document.body.classList.add('preview-open');await renderFullPreview();
  }
  function closeFullPreview(){if(!fullPreviewModal)return;fullPreviewModal.hidden=true;document.body.classList.remove('preview-open');}
  fullPreviewModal?.querySelectorAll('[data-close-full-preview]').forEach(button=>button.addEventListener('click',closeFullPreview));
  fullPreviewModal?.querySelectorAll('[data-full-device]').forEach(button=>button.addEventListener('click',async()=>{state.fullPreviewDevice=button.dataset.fullDevice;fullPreviewModal.querySelectorAll('[data-full-device]').forEach(x=>x.classList.toggle('active',x===button));await renderFullPreview();}));
  addEventListener('keydown',event=>{if(event.key==='Escape'&&!fullPreviewModal?.hidden)closeFullPreview();});
  async function uploadFile(event){
    const file=event.target.files?.[0];if(!file||!state.uploadTarget)return;
    if(!file.type.startsWith('image/')){message('이미지 파일만 업로드할 수 있습니다.','error');return;}
    message('이미지를 업로드하고 있습니다.','info');
    try{
      const uploaded=await window.KNA_FILE_SERVICE.upload(file,{
        purpose:state.uploadTarget.type==='popup'?'popup-image':'page-image',
        audience:'public',
        downloadEnabled:false
      });
      const url=uploaded.viewUrl;
      if(state.uploadTarget.type==='block')state.layout.blocks[state.selectedBlock][state.uploadTarget.field]=url;
      else if(state.uploadTarget.type==='array'){
        const block=state.layout.blocks[state.selectedBlock];
        const item=block?.[state.uploadTarget.field]?.[state.uploadTarget.index];
        if(!item)throw new Error('카드 항목을 찾을 수 없습니다.');
        item[state.uploadTarget.itemKey]=url;
      } else state.layout.popups[state.selectedPopup][state.uploadTarget.field]=url;
      state.dirty=true;renderPanel();renderPreview();message('이미지를 업로드했습니다.','success');
    }catch(error){message(error.message||'업로드하지 못했습니다.','error');}
  }
  async function publish(){
    publishButton.disabled=true;message('페이지를 게시하고 있습니다.','info');
    try{
      state.layout.page_label=String(state.layout.page_label||pageDefaults[pageKey]?.label||pageKey).trim();
      const {error}=await client.rpc('save_page_layout_v1',{p_page_key:pageKey,p_layout:state.layout});if(error)throw error;
      localStorage.removeItem(`kna_page_draft_${pageKey}`);state.dirty=false;message('페이지를 게시했습니다. 새 창에서 확인해 주세요.','success');setTimeout(()=>location.reload(),800);
    }catch(error){message(error.message||'페이지를 게시하지 못했습니다.','error');}finally{publishButton.disabled=false;}
  }
  async function restore(id){if(!confirm('이전 버전으로 복원할까요? 현재 버전은 자동으로 기록됩니다.'))return;const {error}=await client.rpc('restore_page_layout_v1',{p_version_id:id});if(error)return message(error.message,'error');location.reload();}
  function message(text,type='info'){const el=document.querySelector('#editorMessage');if(!el)return;el.className=`editor-message show ${type}`;el.textContent=text;}
  addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});
})();
