(() => {
  const defaults = {
    site_name: '대한간호학생회 부산',
    site_subtitle: '정책국 공식 홈페이지',
    utility_label: '대한간호학생회 부산 · 정책국',
    home_title: '정책을 읽고 간호의 내일을 설계합니다.',
    home_description: '간호정책을 쉽고 정확하게 전달하고 현장의 목소리를 연결하는 대한간호학생회 부산 정책국의 공식 공간입니다.',
    footer_notice: '공개 게시물은 로그인 없이 열람할 수 있습니다.',
    alert_title: '홈페이지 이용 안내',
    alert_body: '공개 메뉴는 로그인 없이 열람할 수 있습니다. 리더 기능은 이메일 인증과 가입 승인을 완료한 뒤 이용할 수 있습니다.',
    popup: {
      enabled: true,
      title: '대한간호학생회 부산 정책국 홈페이지에 오신 것을 환영합니다',
      body: '본 홈페이지는 부산 정책국 리더들의 원활한 소통과 정책 정보 공유를 위해 운영됩니다. 로그인 또는 가입 신청을 진행해 주세요.',
      id_guide: '가입 시 입력한 이메일 주소를 사용합니다.',
      password_guide: '안전한 방식으로 변환하여 처리되며 운영자도 기존 비밀번호를 확인할 수 없습니다.',
      signup_guide: '이메일 인증과 임원의 승인을 완료하면 리더 홈을 이용할 수 있습니다.'
    },
    public_menu: {
      about: {label:'정책국 소개',visible:true}, notice:{label:'공지사항',visible:true}, cards:{label:'카드뉴스',visible:true},
      policy:{label:'정책 콘텐츠',visible:true}, news:{label:'간호·정책 뉴스',visible:true}, schedule:{label:'일정',visible:true}
    },
    leader_menu: {home:'리더 홈',schedule:'일정 확인',board:'익명 소통',quiz:'정책 퀴즈'}
  };
  const merge = (base, extra) => {
    const out = Array.isArray(base) ? [...base] : {...base};
    if (!extra || typeof extra !== 'object') return out;
    Object.entries(extra).forEach(([key,value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value) && base?.[key] && typeof base[key] === 'object') out[key]=merge(base[key],value);
      else out[key]=value;
    });
    return out;
  };
  const apply = config => {
    window.KNA_SITE_SETTINGS = config;
    document.querySelectorAll('.brand strong,.footer-brand strong').forEach(el=>el.textContent=config.site_name);
    document.querySelectorAll('.brand > span > span,.footer-brand div > span').forEach(el=>el.textContent=config.site_subtitle);
    document.querySelectorAll('.utility .container > span').forEach(el=>el.textContent=config.utility_label);
    document.querySelectorAll('.footer-copy > div:first-child').forEach(el=>el.textContent=config.footer_notice);
    const map={about:'about.html',notice:'notice.html',cards:'cards.html',policy:'policy.html',news:'news.html',schedule:'schedule.html'};
    Object.entries(map).forEach(([key,href])=>{
      const setting=config.public_menu?.[key]||{};
      document.querySelectorAll(`.nav a[href="${href}"],.quick-item[href="${href}"]`).forEach(el=>{
        if(el.matches('.nav a')) el.textContent=setting.label||defaults.public_menu[key].label;
        else { const strong=el.querySelector('strong'); if(strong) strong.textContent=setting.label||defaults.public_menu[key].label; }
        el.hidden=setting.visible===false;
      });
    });
    if(document.body.dataset.page==='home'){
      const h1=document.querySelector('.hero h1'); if(h1)h1.textContent=config.home_title;
      const p=document.querySelector('.hero h1 + p'); if(p)p.textContent=config.home_description;
    }
    document.dispatchEvent(new CustomEvent('kna:site-settings-ready',{detail:config}));
  };
  window.KNA_SITE_SETTINGS=merge(defaults,{});
  window.KNA_SITE_SETTINGS_READY=(async()=>{
    let config=merge(defaults,{});
    try{
      if(window.SUPABASE_CONFIG_READY&&window.knaSupabase){
        const {data,error}=await window.knaSupabase.rpc('get_site_config_public_v1');
        if(!error&&data)config=merge(defaults,data);
      }
    }catch(error){console.warn('site settings fallback',error);}
    apply(config); return config;
  })();
})();
