(async()=>{
  const root=document.querySelector('#newsRoot');const message=document.querySelector('#newsUpdatedAt');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  try{
    const response=await fetch(`data/external-news.json?ts=${Date.now()}`);if(!response.ok)throw new Error('뉴스 자료를 불러오지 못했습니다.');
    const payload=await response.json();const hours=Number(payload.refreshHours||6);
    message.textContent=payload.updatedAt?`최근 갱신: ${new Date(payload.updatedAt).toLocaleString('ko-KR')} · 약 ${hours}시간마다 자동 갱신`:`약 ${hours}시간마다 자동 갱신`;
    const items=payload.items||[];
    if(!items.length){root.innerHTML='<div class="empty-state">뉴스 갱신 준비 중입니다.</div>';return;}
    root.innerHTML=items.map(item=>`<article class="news-card"><div><span class="badge">${esc(item.contentType||'언론·기관')}</span><span class="badge secondary">${esc(item.category||'간호·정책')}</span><time>${item.publishedAt?new Date(item.publishedAt).toLocaleDateString('ko-KR'):''}</time></div><h2><a href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h2><p>${esc(item.source||'외부 언론·기관')}</p><a class="more-link" href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">원문 보기 →</a></article>`).join('');
  }catch(error){root.innerHTML=`<div class="auth-message show error">${esc(error.message)}</div>`;}
})();
