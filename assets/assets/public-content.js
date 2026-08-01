(async()=>{
  const client=window.knaSupabase;
  const target=document.querySelector('[data-dynamic-content]');
  if(!target||!window.SUPABASE_CONFIG_READY||!client)return;
  const category=target.dataset.dynamicContent;
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const{data,error}=await client.from('content_posts').select('id,category,title,summary,cover_url,published_at').eq('status','published').eq('category',category).order('published_at',{ascending:false});
  if(error||!data?.length)return;
  if(category==='notice')target.innerHTML=data.map(r=>`<a class="notice-row-link" href="article.html?id=${r.id}"><span class="badge">공지</span><strong>${escapeHtml(r.title)}</strong><time>${new Date(r.published_at).toLocaleDateString('ko-KR')}</time></a>`).join('');
  else if(category==='card')target.innerHTML=data.map((r,i)=>`<article class="content-card"><div class="card-visual ${['blue','navy','teal'][i%3]}" ${r.cover_url?`style="background-image:linear-gradient(rgba(18,60,105,.35),rgba(18,60,105,.65)),url('${escapeHtml(r.cover_url)}');background-size:cover"`:''}><span class="card-mark">${String(i+1).padStart(2,'0')}</span><strong>${escapeHtml(r.title)}</strong></div><div class="card-body"><p>${escapeHtml(r.summary)}</p><a href="article.html?id=${r.id}">내용 보기 →</a></div></article>`).join('');
  else target.innerHTML=`<a class="policy-link-anchor" href="news.html"><strong>간호·정책 뉴스 바로가기</strong><span>자동 갱신</span></a>`+data.map(r=>`<a class="policy-link-anchor" href="article.html?id=${r.id}"><strong>${escapeHtml(r.title)}</strong><span>${new Date(r.published_at).toLocaleDateString('ko-KR')}</span></a>`).join('');
})();
