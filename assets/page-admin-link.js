(async () => {
  const pageKey=document.body.dataset.page;
  const supported=new Set(['home','about','notice','cards','policy','glossary','news','schedule','dashboard','internal-schedule','board','quiz','article']);
  if(!supported.has(pageKey)||!window.SUPABASE_CONFIG_READY||!window.knaSupabase)return;
  try{
    const {data:{session}}=await window.knaSupabase.auth.getSession();
    if(!session)return;
    const {data,error}=await window.knaSupabase.rpc('get_my_access');
    const normalizedPosition=String(data?.position||data?.requested_position||'').replace(/\s+/g,'');
    if(error||!data||data.approval_status!=='approved'||!(data.system_role==='policy_director'||normalizedPosition.includes('정책국장')))return;
    const link=document.createElement('a');
    link.className='page-edit-fab';
    link.href=`page-editor.html?page=${encodeURIComponent(pageKey)}`;
    link.innerHTML='<span>✎</span> 페이지 수정';
    document.body.append(link);
    const hero=document.querySelector(pageKey==='home'?'.hero-actions':'.page-hero .container');
    if(hero&&pageKey!=='home'){
      const inline=document.createElement('a');
      inline.className='page-edit-inline';inline.href=link.href;inline.textContent='이 페이지 수정';hero.append(inline);
    }
  }catch(error){console.warn('page edit link',error);}
})();
