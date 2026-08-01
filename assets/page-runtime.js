(() => {
  const pageKey = document.body.dataset.page;
  const supported = new Set(['home','about','notice','cards','policy','glossary','news','schedule','dashboard','internal-schedule','board','quiz','article']);
  if (!supported.has(pageKey) || !window.KNA_PAGE_BLOCKS) return;

  const fallback = {
    page_key: pageKey,
    page_label: '',
    access_level: ['dashboard','internal-schedule','board','quiz'].includes(pageKey) ? 'leaders' : 'public',
    hero: {visible:true},
    design: {accent:'#1976c9',background:'#ffffff',content_width:'wide',replace_base_content:false,section_style:'soft'},
    blocks: pageKey === 'home' ? [{
      id:'home-policy-calendar',type:'schedule_calendar',visible:true,title:'정책국 일정',
      description:'확정된 정책국·정책1부·정책2부 일정을 한눈에 확인하세요.',
      show_filters:true,upcoming_count:5,variant:'clean',accent:'#1976c9',padding:'normal'
    }] : [],
    popups: []
  };

  const merge = (base,extra) => {
    if (Array.isArray(extra)) return [...extra];
    const out = {...base};
    if (!extra || typeof extra !== 'object') return out;
    Object.entries(extra).forEach(([key,value])=>{
      if (value && typeof value==='object' && !Array.isArray(value) && base?.[key] && typeof base[key]==='object' && !Array.isArray(base[key])) out[key]=merge(base[key],value);
      else out[key]=value;
    });
    return out;
  };

  const getLayout = async () => {
    if (!window.SUPABASE_CONFIG_READY || !window.knaSupabase) return fallback;
    try {
      const {data,error}=await window.knaSupabase.rpc('get_page_layout_public_v1',{p_page_key:pageKey});
      if (error || !data) return fallback;
      return merge(fallback,data);
    } catch (_) { return fallback; }
  };

  const applyHero = layout => {
    const hero=layout.hero||{};
    const heroSection = pageKey==='home' ? document.querySelector('.hero') : document.querySelector('.page-hero');
    if (!heroSection) return;
    heroSection.hidden = hero.visible === false;
    const eyebrow=heroSection.querySelector('.eyebrow');
    const title=heroSection.querySelector('h1');
    const description=heroSection.querySelector('h1 + p, .container > p');
    if (eyebrow && hero.eyebrow) eyebrow.textContent=hero.eyebrow;
    if (title && hero.title) title.textContent=hero.title;
    if (description && hero.description) description.textContent=hero.description;
  };

  const applyDesign = layout => {
    const design=layout.design||{};
    if (/^#[0-9a-f]{6}$/i.test(design.accent||'')) document.documentElement.style.setProperty('--managed-accent',design.accent);
    if (/^#[0-9a-f]{6}$/i.test(design.background||'')) document.body.style.setProperty('--managed-page-background',design.background);
    document.body.classList.add('managed-page-enabled',`managed-width-${design.content_width||'wide'}`,`managed-section-${design.section_style||'soft'}`);
  };

  const createRoot = layout => {
    let root=document.querySelector('[data-managed-page-blocks]');
    if (!root) {
      root=document.createElement('div');
      root.dataset.managedPageBlocks='';
      root.className='managed-page-blocks-root';
      const main=document.querySelector('main');
      if (pageKey==='home') {
        const alt=main?.querySelector('.section.alt');
        if (alt) alt.before(root); else main?.append(root);
      } else main?.append(root);
    }
    if (layout.design?.replace_base_content) {
      const main=document.querySelector('main');
      [...(main?.children||[])].forEach(child=>{
        if (child===root || child.classList.contains('page-hero') || child.classList.contains('hero')) return;
        child.dataset.pageBaseHidden='true';
        child.hidden=true;
      });
    }
    return root;
  };

  const renderPopups = layout => {
    const popups=(Array.isArray(layout.popups)?layout.popups:[]).filter(item=>item&&item.enabled!==false);
    if (!popups.length) return;
    const now=new Date();
    const popup=popups.find(item=>{
      if(item.start_at&&new Date(item.start_at)>now)return false;
      if(item.end_at&&new Date(item.end_at)<now)return false;
      const key=`kna_page_popup_${pageKey}_${item.id}`;
      const hiddenUntil=Number(localStorage.getItem(key)||0);
      return hiddenUntil<Date.now();
    });
    if(!popup)return;
    const modal=document.createElement('div');
    modal.className='managed-popup-overlay';
    modal.innerHTML=`<div class="managed-popup" role="dialog" aria-modal="true"><button type="button" class="managed-popup-close" aria-label="닫기">×</button>${popup.image?`<img src="${window.KNA_PAGE_BLOCKS.escapeHtml(window.KNA_PAGE_BLOCKS.linkSafe(popup.image))}" alt="">`:''}<div><span class="managed-kicker">NOTICE</span><h2>${window.KNA_PAGE_BLOCKS.escapeHtml(popup.title||'안내')}</h2><div class="managed-richtext">${window.KNA_PAGE_BLOCKS.markdown(popup.body||'')}</div>${popup.button_label&&popup.button_url?`<a class="managed-button style-primary" href="${window.KNA_PAGE_BLOCKS.escapeHtml(window.KNA_PAGE_BLOCKS.linkSafe(popup.button_url))}">${window.KNA_PAGE_BLOCKS.escapeHtml(popup.button_label)}</a>`:''}<label class="managed-popup-dismiss"><input type="checkbox"> ${Number(popup.dismiss_days||1)}일 동안 보지 않기</label></div></div>`;
    document.body.append(modal);
    const close=()=>{
      const checked=modal.querySelector('input')?.checked;
      if(checked)localStorage.setItem(`kna_page_popup_${pageKey}_${popup.id}`,String(Date.now()+Math.max(1,Number(popup.dismiss_days||1))*86400000));
      modal.remove();
    };
    modal.querySelector('.managed-popup-close').addEventListener('click',close);
    modal.addEventListener('click',event=>{if(event.target===modal)close();});
  };

  window.KNA_PAGE_LAYOUT_READY=(async()=>{
    const layout=await getLayout();
    window.KNA_CURRENT_PAGE_LAYOUT=layout;
    applyHero(layout); applyDesign(layout);
    const root=createRoot(layout);
    await window.KNA_PAGE_BLOCKS.renderBlocks(layout,root);
    renderPopups(layout);
    document.dispatchEvent(new CustomEvent('kna:page-layout-ready',{detail:layout}));
    return layout;
  })();
})();
