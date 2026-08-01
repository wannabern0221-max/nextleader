(async()=>{
  const holder=document.querySelector('[data-public-write-category]');
  if(!holder||!window.SUPABASE_CONFIG_READY||!window.knaSupabase)return;
  try{const{data:s}=await window.knaSupabase.auth.getSession();if(!s.session)return;const{data:a}=await window.knaSupabase.rpc('get_my_access');if(a?.approval_status!=='approved'||a?.system_role==='external_admin')return;const category=holder.dataset.publicWriteCategory;holder.href=`content-editor.html?category=${encodeURIComponent(category)}&return=${encodeURIComponent('content-manager.html')}`;holder.classList.add('is-visible');}catch(_){ }
})();
