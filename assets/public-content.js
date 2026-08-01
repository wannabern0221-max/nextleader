(async()=>{
  const client=window.knaSupabase;
  const targets=[...document.querySelectorAll('[data-dynamic-content]')];
  if(!targets.length)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const emptyMessage=category=>category==='card'?'아직 등록된 카드뉴스가 없습니다.':category==='notice'?'아직 등록된 공지사항이 없습니다.':'아직 등록된 콘텐츠가 없습니다.';

  for(const target of targets){
    const category=target.dataset.dynamicContent;
    const limit=Number(target.dataset.limit||0);
    target.dataset.loading='true';

    if(!window.SUPABASE_CONFIG_READY||!client){
      delete target.dataset.loading;
      target.innerHTML=`<div class="empty-state">${emptyMessage(category)}</div>`;
      continue;
    }

    let query=client.from('content_posts')
      .select('id,category,title,summary,cover_url,published_at')
      .eq('status','published')
      .eq('visibility','public')
      .eq('category',category)
      .order('published_at',{ascending:false});
    if(limit>0)query=query.limit(limit);
    const{data,error}=await query;
    delete target.dataset.loading;

    if(error){
      console.warn('public content load failed',error);
      target.innerHTML='<div class="empty-state">콘텐츠를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</div>';
      continue;
    }
    if(!data?.length){
      target.innerHTML=`<div class="empty-state">${emptyMessage(category)}</div>`;
      continue;
    }

    if(category==='notice'){
      target.innerHTML=data.map(r=>`<a class="notice-row-link" href="article.html?id=${r.id}"><span class="badge">공지</span><strong>${esc(r.title)}</strong><time>${new Date(r.published_at).toLocaleDateString('ko-KR')}</time></a>`).join('');
    }else if(category==='card'){
      target.innerHTML=data.map((r,i)=>`<article class="content-card"><div class="card-visual ${['blue','navy','teal'][i%3]}" ${r.cover_url?`style="background-image:linear-gradient(rgba(18,60,105,.35),rgba(18,60,105,.65)),url('${esc(r.cover_url)}');background-size:cover;background-position:center"`:''}><span class="card-mark">${String(i+1).padStart(2,'0')}</span><strong>${esc(r.title)}</strong></div><div class="card-body"><p>${esc(r.summary||'')}</p><a href="article.html?id=${r.id}">내용 보기 →</a></div></article>`).join('');
    }else{
      target.innerHTML=`<a class="policy-link-anchor" href="news.html"><strong>간호·정책 뉴스 바로가기</strong><span>자동 갱신</span></a>`+data.map(r=>`<a class="policy-link-anchor" href="article.html?id=${r.id}"><strong>${esc(r.title)}</strong><span>${new Date(r.published_at).toLocaleDateString('ko-KR')}</span></a>`).join('');
    }
  }
})();
