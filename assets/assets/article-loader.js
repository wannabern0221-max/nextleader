(async()=>{
  const id=new URLSearchParams(location.search).get('id');
  if(!id||!window.SUPABASE_CONFIG_READY||!window.knaSupabase)return;
  const{data,error}=await window.knaSupabase.from('content_posts').select('title,category,body,published_at').eq('id',id).eq('status','published').maybeSingle();
  if(error||!data)return;
  const labels={notice:'공지사항',card:'카드뉴스',policy:'정책 콘텐츠'};
  document.title=`${data.title} | 대한간호학생회 부산 정책국`;
  document.querySelector('#articleTitle').textContent=data.title;
  document.querySelector('#articleCategory').textContent=labels[data.category]||'게시물';
  document.querySelector('#articleDate').textContent=new Date(data.published_at).toLocaleDateString('ko-KR');
  document.querySelector('#articleBody').innerHTML=String(data.body||'').split('\n').map(line=>line.trim()?`<p>${line.replace(/[&<>]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]))}</p>`:'').join('');
})();
